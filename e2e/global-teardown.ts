/** Never leave a stack simulating providers: test mode off, code / payment limits restored. */
export default async function globalTeardown(): Promise<void> {
  const admin = process.env.NETFLY_ADMIN_URL ?? "http://localhost:3001";
  const login = await fetch(`${admin}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: process.env.NETFLY_ADMIN_USER ?? "admin",
      password: process.env.NETFLY_ADMIN_PASSWORD ?? "netfly-dev-admin",
      app: "admin",
    }),
  });
  if (!login.ok) return;
  const { access } = (await login.json()) as { access: string };
  for (const [key, value] of [
    ["testing.mock_providers", false],
    ["security.rate_otp_send", "10/hour"],
    ["security.rate_payment", "12/hour"],
  ] as const) {
    await fetch(`${admin}/api/v1/admin/config/${key}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${access}` },
      body: JSON.stringify({ value }),
    });
  }
}
