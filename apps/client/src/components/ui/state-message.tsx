import { cn } from "@netfly/ui";
import { CloudOff, Film } from "lucide-react";
import { Button } from "./button";

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
    <div
      className={cn(
        "mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center",
        className,
      )}
    >
      <div className="bg-surface relative mb-6 grid size-20 place-items-center rounded-3xl ring-1 ring-white/8">
        <div className="absolute inset-0 rounded-3xl bg-[radial-gradient(circle,rgb(var(--accent-rgb)/0.25),transparent_70%)]" />
        <Icon className="relative size-8 text-white/80" />
      </div>
      <h2 className="text-h3 font-bold tracking-tight">{title}</h2>
      {children && <p className="text-muted text-body mt-2 leading-relaxed">{children}</p>}
      {action && (
        <Button variant="play" className="mt-6" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
