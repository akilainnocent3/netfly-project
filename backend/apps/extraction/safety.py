"""SSRF guard: which URLs the server may fetch, and the address it connects to (decision 67).

Only http/https on `extraction.allowed_ports`; credentials are stripped; the host is resolved
here and *every* address it resolves to must be public. The fetcher then connects to the vetted
address (pinned), so a second DNS answer can't point the connection somewhere else.
"""

import ipaddress
import socket
from dataclasses import dataclass
from urllib.parse import urlsplit, urlunsplit

from apps.core.config import config

# Never reachable, even from a test-mode allow-list entry.
ALWAYS_BLOCKED = {
    ipaddress.ip_address("169.254.169.254"),  # cloud metadata (AWS, GCP, Azure, …)
    ipaddress.ip_address("fd00:ec2::254"),  # AWS metadata over IPv6
    ipaddress.ip_address("100.100.100.200"),  # Alibaba Cloud metadata
}
EXTRA_BLOCKED_NETS = [
    ipaddress.ip_network("100.64.0.0/10"),  # CGNAT (shared address space)
    ipaddress.ip_network("192.0.0.0/24"),  # IETF protocol assignments
    ipaddress.ip_network("198.18.0.0/15"),  # benchmarking
    ipaddress.ip_network("fc00::/7"),  # IPv6 unique local
    ipaddress.ip_network("64:ff9b:1::/48"),  # local-use NAT64
]
DEFAULT_PORTS = {"http": 80, "https": 443}
# The resolver (tests replace this one name, never the process-wide socket.getaddrinfo).
getaddrinfo = socket.getaddrinfo


class BlockedURL(Exception):
    """A URL the server refuses to fetch. `message` is shown to staff as is."""

    def __init__(self, message: str, code: str = "blocked_url"):
        super().__init__(message)
        self.message = message
        self.code = code


@dataclass(frozen=True)
class Target:
    url: str  # credentials removed, scheme/host lowercased
    scheme: str
    host: str  # IDNA (ASCII) host, no brackets
    port: int
    test_host: bool = False  # allowed by the test-mode allow-list


def _embedded_v4(ip: ipaddress.IPv6Address) -> ipaddress.IPv4Address | None:
    return (
        ip.ipv4_mapped
        or (ip.sixtofour if ip.sixtofour else None)
        or (ip.teredo[1] if ip.teredo else None)
    )


def ip_problem(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> str | None:
    """Why `ip` must not be contacted, or None when it is a public unicast address."""
    if ip in ALWAYS_BLOCKED:
        return "the cloud metadata service"
    if isinstance(ip, ipaddress.IPv6Address) and (inner := _embedded_v4(ip)):
        return ip_problem(inner)
    if ip.is_loopback:
        return "a loopback address"
    if ip.is_link_local:
        return "a link-local address"
    if ip.is_multicast:
        return "a multicast address"
    if ip.is_unspecified:
        return "an unspecified address"
    if any(ip in net for net in EXTRA_BLOCKED_NETS if net.version == ip.version):
        return "a private network address"
    if ip.is_private or ip.is_reserved or not ip.is_global:
        return "a private network address"
    return None


def allowed_ports() -> set[int]:
    ports = config.get_json("extraction.allowed_ports", [80, 443]) or [80, 443]
    return {int(p) for p in ports}


def test_hosts() -> set[str]:
    """`host:port` entries that skip the address rules, honoured only while test mode is on."""
    if not config.get_bool("testing.mock_providers"):
        return set()
    return {str(h).lower() for h in config.get_json("extraction.test_hosts", []) or []}


def validate_url(raw: str) -> Target:
    """Check the shape of a URL (no DNS). Raises BlockedURL with a message for staff."""
    raw = (raw or "").strip()
    if not raw:
        raise BlockedURL("Enter an address.", "invalid_url")
    try:
        parts = urlsplit(raw)
        port = parts.port
    except ValueError:
        raise BlockedURL("That isn't a valid web address.", "invalid_url") from None
    scheme = parts.scheme.lower()
    if scheme not in DEFAULT_PORTS:
        raise BlockedURL("Only http:// and https:// addresses can be checked.", "invalid_scheme")
    host = (parts.hostname or "").rstrip(".")
    if not host:
        raise BlockedURL("That address has no host name.", "invalid_url")
    try:
        host = host.encode("idna").decode("ascii").lower() if not _is_ip(host) else host
    except UnicodeError:
        raise BlockedURL("That host name isn't valid.", "invalid_url") from None
    port = port or DEFAULT_PORTS[scheme]
    is_test = f"{host}:{port}" in test_hosts()
    if not is_test:
        if port not in allowed_ports():
            raise BlockedURL(
                f"Port {port} isn't allowed. Only standard web ports can be checked.",
                "blocked_port",
            )
        if host == "localhost" or host.endswith(".localhost") or host.endswith(".internal"):
            raise BlockedURL("Addresses on this server's own network can't be checked.")
        if _is_ip(host) and (problem := ip_problem(ipaddress.ip_address(host))):
            raise BlockedURL(f"That address is {problem}, which can't be checked.")
    netloc = f"[{host}]" if ":" in host else host
    if port != DEFAULT_PORTS[scheme]:
        netloc += f":{port}"
    url = urlunsplit((scheme, netloc, parts.path or "/", parts.query, parts.fragment))
    return Target(url=url, scheme=scheme, host=host, port=port, test_host=is_test)


def _is_ip(host: str) -> bool:
    try:
        ipaddress.ip_address(host)
        return True
    except ValueError:
        return False


def resolve(target: Target) -> str:
    """The address to connect to. Every address the name resolves to must be public."""
    if _is_ip(target.host):
        ip = ipaddress.ip_address(target.host)
        if ip in ALWAYS_BLOCKED:
            raise BlockedURL("That address is the cloud metadata service, which can't be checked.")
        return target.host
    try:
        infos = getaddrinfo(target.host, target.port, type=socket.SOCK_STREAM)
    except (socket.gaierror, UnicodeError):
        raise BlockedURL("The address doesn't exist (DNS).", "dns") from None
    addresses = []
    for info in infos:
        ip = ipaddress.ip_address(info[4][0].split("%", 1)[0])
        if ip in ALWAYS_BLOCKED:
            raise BlockedURL("That name points at the cloud metadata service.")
        if not target.test_host and (problem := ip_problem(ip)):
            # One private answer is enough to refuse: mixing answers is a rebinding trick.
            raise BlockedURL(f"That name points at {problem}, which can't be checked.")
        addresses.append(str(ip))
    if not addresses:
        raise BlockedURL("The address doesn't exist (DNS).", "dns")
    # Prefer IPv4: containers often have no IPv6 route.
    addresses.sort(key=lambda a: ":" in a)
    return addresses[0]


def check_url(raw: str) -> Target:
    """Shape + DNS: what the API runs on a start URL before queueing a crawl."""
    target = validate_url(raw)
    resolve(target)
    return target
