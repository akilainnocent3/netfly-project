import { cn } from "@netfly/ui";
import { CloudOff, Film } from "lucide-react";

/** Empty / error / offline states, designed with the same care as content. */
export function StateMessage({
  title,
  children,
  tone = "empty",
  action,
  className,
}: {
  title: string;
  children?: React.ReactNode;
  tone?: "empty" | "error";
  action?: { label: string; onClick: () => void };
  className?: string;
}) {
  const Icon = tone === "error" ? CloudOff : Film;
  return (
    <div className={cn("mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center", className)}>
      <div className="relative mb-6 grid size-20 place-items-center rounded-3xl bg-surface ring-1 ring-white/8">
        <div className="absolute inset-0 rounded-3xl bg-[radial-gradient(circle,rgb(var(--accent-rgb)/0.25),transparent_70%)]" />
        <Icon className="relative size-8 text-white/80" />
      </div>
      <h2 className="text-[22px] font-bold tracking-tight">{title}</h2>
      {children && <p className="mt-2 text-[15px] leading-relaxed text-muted">{children}</p>}
      {action && (
        <button type="button" onClick={action.onClick} className="mt-6 rounded-full bg-white px-6 py-2.5 text-[15px] font-semibold text-black transition hover:bg-white/85">
          {action.label}
        </button>
      )}
    </div>
  );
}
