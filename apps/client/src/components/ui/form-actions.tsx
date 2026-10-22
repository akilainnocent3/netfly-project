import { cn } from "@netfly/ui";

/**
 * The one place a form's or card's actions live (the dark twin of sign-up's `StepActions`): a
 * banner across the bottom edge of its card or dialog, primary (red) action first, then Cancel;
 * a destructive action goes last with `ml-auto`. On phones it stays docked at the bottom of the
 * screen (above the tab bar) or of the dialog while its form is in view, so Save is always one
 * tap away; from `md` it is the card's static footer.
 *
 * It bleeds to the card's edges using the card's padding, `--panel-pad` (AccountPanel and the
 * profile dialog set it), and takes the card's background via `className` (default `bg-surface`).
 */
export function FormActions({
  children,
  className,
  inDialog = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** Docks to the dialog's own bottom edge rather than above the tab bar. */
  inDialog?: boolean;
}) {
  return (
    <div
      className={cn(
        "bg-surface sticky z-10 -mx-[var(--panel-pad,0px)] mt-6 -mb-[var(--panel-pad,0px)] flex flex-wrap items-center gap-3 border-t border-white/8 px-[var(--panel-pad,0px)] py-4",
        // Phones: the primary action fills the row, like the sign-up banner.
        "max-sm:[&>*:first-child]:flex-1",
        inDialog ? "bottom-0" : "bottom-[var(--tabbar-h,0px)]",
        "md:static",
        className,
      )}
    >
      {children}
    </div>
  );
}
