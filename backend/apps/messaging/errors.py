class MessagingError(Exception):
    """A message couldn't be sent. `message` is safe to show to staff; never contains secrets.

    `provider` is what the provider answered (HTTP status, its code and status text, recipient
    counts) — for the server log, the audit log and Studio's test button. It never holds the
    message body (codes) or credentials. `rejected_number` is True when the provider refused the
    destination itself (invalid, opted out), as opposed to an account / configuration problem.
    """

    def __init__(
        self,
        message: str,
        code: str = "send_failed",
        *,
        provider: dict | None = None,
        rejected_number: bool = False,
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.provider = provider or {}
        self.rejected_number = rejected_number
