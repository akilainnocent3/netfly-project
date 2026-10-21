"use client";

import { cn } from "@netfly/ui";
import { CreditCard, Gauge, House, ShieldCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const ACCOUNT_SECTIONS = [
  { href: "/account", label: "Overview", icon: House },
  { href: "/account/membership", label: "Membership", icon: CreditCard },
  { href: "/account/usage", label: "Usage", icon: Gauge },
  { href: "/account/security", label: "Security", icon: ShieldCheck },
  { href: "/account/profiles", label: "Profiles", icon: UsersRound },
] as const;

/** Netflix account navigation: a left column on desktop, a scrollable tab strip on phones. */
export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Account"
      className="lg:sticky lg:top-[calc(var(--header-h)+24px)] lg:self-start"
    >
      <ul className="no-scrollbar -mx-[max(4vw,16px)] flex gap-1 overflow-x-auto px-[max(4vw,16px)] lg:mx-0 lg:flex-col lg:px-0">
        {ACCOUNT_SECTIONS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "text-body flex h-11 items-center gap-3 rounded-md px-3 whitespace-nowrap transition-colors duration-150",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                  active
                    ? "bg-white/10 font-bold text-white"
                    : "text-[#b3b3b3] hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon className="size-5 shrink-0" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** A white-on-dark account card with a heading. */
export function AccountPanel({
  title,
  description,
  action,
  children,
  className,
  testId,
}: {
  title?: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section
      data-testid={testId}
      className={cn("bg-surface overflow-hidden rounded-md ring-1 ring-white/8", className)}
    >
      {title ? (
        <div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-6">
          <div>
            <h2 className="text-h3 font-bold">{title}</h2>
            {description ? <p className="text-meta mt-1 text-[#b3b3b3]">{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className={cn("p-6", title && "pt-5")}>{children}</div>
    </section>
  );
}

/** A row link in an account panel ("Change plan  ›"). */
export function AccountLinkRow({
  href,
  icon,
  label,
  hint,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 border-b border-white/8 py-4 last:border-b-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/8 text-white [&_svg]:size-5">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-body block font-semibold group-hover:underline">{label}</span>
        {hint ? <span className="text-meta block truncate text-[#b3b3b3]">{hint}</span> : null}
      </span>
      <span
        aria-hidden
        className="text-lead text-[#a3a3a3] transition-transform group-hover:translate-x-0.5"
      >
        ›
      </span>
    </Link>
  );
}
