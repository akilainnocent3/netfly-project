import { safeNext } from "./safe-next";

/**
 * The paid-plan / trial flow carries its context in the URL so Back, reloads and a new tab all
 * work: /verify/email → /verify/phone → /payment, each with ?plan=…&trial=1&next=….
 * `from=account` = verifying a contact detail from Account → Security (no plan involved).
 */
export interface CheckoutContext {
  plan: string | null;
  trial: boolean;
  next: string;
  fromAccount: boolean;
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,59}$/;

export function readCheckout(params: URLSearchParams): CheckoutContext {
  const plan = params.get("plan");
  return {
    plan: plan && SLUG.test(plan) ? plan : null,
    trial: params.get("trial") === "1",
    next: safeNext(params.get("next")),
    fromAccount: params.get("from") === "account",
  };
}

export function checkoutQuery(ctx: CheckoutContext, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams();
  if (ctx.plan) q.set("plan", ctx.plan);
  if (ctx.trial) q.set("trial", "1");
  if (ctx.fromAccount) q.set("from", "account");
  q.set("next", ctx.next);
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  return `?${q.toString()}`;
}

/** Where a checkout step lives ("email" | "phone" | "payment" | "trial"). */
export function stepHref(step: string, ctx: CheckoutContext): string {
  if (step === "email" || step === "phone") return `/verify/${step}${checkoutQuery(ctx)}`;
  return `/payment${checkoutQuery(ctx)}`;
}

/** STEP X OF 3 numbering: email 1, phone 2, payment / trial 3. */
export const STEP_NUMBER: Record<string, number> = { email: 1, phone: 2, payment: 3, trial: 3 };
