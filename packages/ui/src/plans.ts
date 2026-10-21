/** Plan presentation shared by the viewer plan picker / Account and Studio's live preview. */

const PLAN_GRADIENTS = [
  "linear-gradient(140deg,#2b3a8c 0%,#1a1f5e 100%)",
  "linear-gradient(140deg,#3d4fc1 0%,#6a2ea3 100%)",
  "linear-gradient(140deg,#6b2fb0 0%,#c0245f 100%)",
  "linear-gradient(140deg,#b81d4a 0%,#e50914 100%)",
];

/** The plan card's header gradient (stable per plan position). */
export function planGradient(order: number): string {
  return PLAN_GRADIENTS[Math.abs(order) % PLAN_GRADIENTS.length]!;
}

export function formatTzs(amount: number): string {
  return `TSh ${amount.toLocaleString("en-US")}`;
}

/** "Free", "TSh 2,500/month", "TSh 9,000/90 days" */
export function priceLabel(plan: {
  price_tzs?: number;
  period_days?: number;
  is_free?: boolean;
}): string {
  if (plan.is_free || !plan.price_tzs) return "Free";
  const days = plan.period_days ?? 30;
  const per = days === 30 ? "month" : days === 7 ? "week" : `${days} days`;
  return `${formatTzs(plan.price_tzs)}/${per}`;
}

/** Minutes → "4 hours a day" / "90 minutes a week" / "1h 30m a day". */
export function limitPhrase(
  minutes: number | null | undefined,
  per: "day" | "week" | "month",
): string {
  if (minutes == null) return "Unlimited";
  const unit =
    minutes % 60 === 0
      ? `${minutes / 60} hour${minutes === 60 ? "" : "s"}`
      : minutes > 60
        ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
        : `${minutes} minutes`;
  return `${unit} a ${per}`;
}
