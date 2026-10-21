/** Shared by the e2e run (also used by specs that sign webhooks). */
export const E2E_WEBHOOK_SECRET = "whsec_e2e_netfly_test";

/**
 * Lift sign-up/login rate limits for the run through the admin settings API —
 * which also proves settings changes apply live, without a redeploy. Providers (SMS, email,
 * mobile money) are simulated for the run: codes land in Studio's test outbox and payments are
 * settled by signed webhooks (see global-teardown.ts, which switches this off again).
 */
export default async function globalSetup(): Promise<void> {
  const admin = process.env.NETFLY_ADMIN_URL ?? "http://localhost:3001";
  const username = process.env.NETFLY_ADMIN_USER ?? "admin";
  const password = process.env.NETFLY_ADMIN_PASSWORD ?? "netfly-dev-admin";
  const login = await fetch(`${admin}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, app: "admin" }),
  });
  if (!login.ok) throw new Error(`Admin login failed (${login.status}). Set NETFLY_ADMIN_USER / NETFLY_ADMIN_PASSWORD.`);
  const { access } = (await login.json()) as { access: string };
  for (const [key, value] of [["security.rate_signup", "500/min"], ["security.rate_login", "500/min"], ["security.rate_username_check", "2000/min"], ["security.rate_engagement", "2000/min"], ["features.profiles_enabled", false], ["testing.mock_providers", true], ["security.rate_otp_send", "500/hour"], ["security.rate_payment", "500/hour"], ["payments.snippe_webhook_secret", E2E_WEBHOOK_SECRET]] as const) {
    const res = await fetch(`${admin}/api/v1/admin/config/${key}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${access}` },
      body: JSON.stringify({ value }),
    });
    if (!res.ok) throw new Error(`Couldn't set ${key}: ${res.status}`);
  }
}
