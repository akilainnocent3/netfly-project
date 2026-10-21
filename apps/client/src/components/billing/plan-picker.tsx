"use client";

import { cn, planGradient, priceLabel } from "@netfly/ui";
import { Check } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Plan } from "@/lib/queries";
import { limitPhrase } from "@/lib/usage-format";

export { planGradient, priceLabel };

/** Netflix 2024 plan cards: gradient header, price, then rows with dividers. */
export function PlanPicker({
  plans,
  selected,
  current,
  onSelect,
}: {
  plans: Plan[];
  selected: string;
  current?: string | null;
  onSelect: (slug: string) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  // Phones: a swipeable strip; the card that snaps into view becomes the selection.
  useEffect(() => {
    const el = strip.current;
    if (!el || !window.matchMedia("(max-width: 767px)").matches) return;
    const cards = Array.from(el.querySelectorAll<HTMLElement>("[data-plan]"));
    const target = cards.find((c) => c.dataset.plan === selected);
    target?.scrollIntoView({ block: "nearest", inline: "center" });
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((e) => e.isIntersecting && e.intersectionRatio > 0.7);
        const slug = (visible?.target as HTMLElement | undefined)?.dataset.plan;
        if (slug) onSelect(slug);
      },
      { root: el, threshold: [0.7] },
    );
    cards.forEach((c) => observer.observe(c));
    return () => observer.disconnect();
    // Selection drives scroll only on mount; afterwards the swipe drives selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans.length]);

  return (
    <div
      ref={strip}
      role="radiogroup"
      aria-label="Plans"
      className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:snap-none md:gap-4 md:overflow-visible md:px-0"
      style={{ gridTemplateColumns: `repeat(${plans.length}, minmax(0, 1fr))` }}
    >
      {plans.map((plan, i) => {
        const active = plan.slug === selected;
        return (
          <button
            key={plan.slug}
            type="button"
            role="radio"
            aria-checked={active}
            data-plan={plan.slug}
            onClick={() => onSelect(plan.slug)}
            className={cn(
              "relative w-[82%] shrink-0 snap-center rounded-2xl border-2 bg-white text-left transition-[border-color,box-shadow] duration-200 md:w-auto",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0071eb]",
              active
                ? "border-[#e50914] shadow-[0_8px_24px_rgb(0_0_0/0.18)]"
                : "border-[#d6d6d6] hover:border-[#a8a8a8]",
            )}
          >
            {plan.highlight_label ? (
              <span className="text-caption absolute top-0 right-0 left-0 z-10 rounded-t-[14px] bg-[#e6e6e6] py-1 text-center font-bold text-[#333]">
                {plan.highlight_label}
              </span>
            ) : null}
            <div
              className={cn(
                "relative m-2 rounded-xl px-4 pt-4 pb-4 text-white",
                plan.highlight_label && "mt-8",
              )}
              style={{ background: planGradient(plan.order ?? i) }}
            >
              <p className="text-h3 font-bold">{plan.name}</p>
              <p className="text-meta mt-0.5 font-semibold opacity-90">
                {limitPhrase(plan.daily_limit_minutes, "day")}
              </p>
              <span
                aria-hidden
                className={cn(
                  "absolute right-3 bottom-3 grid size-7 place-items-center rounded-full bg-white text-[#e50914] transition-transform duration-200",
                  active ? "scale-100" : "scale-0",
                )}
              >
                <Check className="size-4" strokeWidth={3.5} />
              </span>
            </div>
            <dl className="px-5 pb-5 text-[#333]">
              <Row label="Price">
                <span data-testid="plan-price">{priceLabel(plan)}</span>
              </Row>
              <Row label="Daily viewing">{limitPhrase(plan.daily_limit_minutes, "day")}</Row>
              <Row label="Weekly viewing">{limitPhrase(plan.weekly_limit_minutes, "week")}</Row>
              <Row label="Monthly viewing">{limitPhrase(plan.monthly_limit_minutes, "month")}</Row>
              <Row label="Video quality">Best (same on every plan)</Row>
              {plan.feature_bullets
                .filter((b) => !/quality/i.test(b))
                .map((b) => (
                  <Row key={b} label="Included">
                    {b}
                  </Row>
                ))}
            </dl>
            {current === plan.slug ? (
              <p className="text-meta mx-5 -mt-2 mb-4 font-semibold text-[#2f7a39]">
                Your current plan
              </p>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[#e6e6e6] py-3 last:border-b-0">
      <dt className="text-meta text-[#737373]">{label}</dt>
      <dd className="text-body mt-0.5 font-semibold">{children}</dd>
    </div>
  );
}
