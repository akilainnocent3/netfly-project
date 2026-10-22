"use client";

import { cn } from "@netfly/ui";
import { Check } from "lucide-react";
import { forwardRef } from "react";
import { COUNTRIES, NETWORKS, networkOf, normalizePhone, type Network } from "@/lib/phone";
import { LightField } from "../ui/light-field";

/** A mobile-money network chip ("Vodacom M-Pesa"), in the network's colour. */
export function NetworkChip({
  network,
  className,
  selected,
}: {
  network: Network;
  className?: string;
  selected?: boolean;
}) {
  const meta = NETWORKS[network];
  return (
    <span
      data-testid={`network-${network}`}
      aria-current={selected || undefined}
      className={cn(
        "text-meta inline-flex h-8 items-center gap-2 rounded-full border bg-white px-3 font-semibold text-[#333] transition-colors duration-150",
        selected ? "border-2 border-[#333]" : "border-[#d6d6d6] font-normal text-[#595959]",
        className,
      )}
    >
      <span aria-hidden className="size-2.5 rounded-full" style={{ background: meta.color }} />
      {meta.label}
      {selected ? <Check aria-hidden className="size-3.5" strokeWidth={3} /> : null}
    </span>
  );
}

/**
 * Tanzania (+255) by default, with a country selector. Accepts 07XXXXXXXX / 7XXXXXXXX /
 * 2557XXXXXXXX / +255…, and shows the detected network as soon as the number is complete.
 */
export const PhoneField = forwardRef<
  HTMLInputElement,
  {
    country: string;
    onCountryChange: (code: string) => void;
    value: string;
    onChange: (value: string) => void;
    error?: string;
    label?: string;
    autoFocus?: boolean;
    disabled?: boolean;
    /** The detected network chip under the field (off where a network list is shown). */
    showNetwork?: boolean;
  }
>(function PhoneField(
  {
    country,
    onCountryChange,
    value,
    onChange,
    error,
    label = "Mobile number",
    autoFocus,
    disabled,
    showNetwork = true,
  },
  ref,
) {
  const normalized = normalizePhone(value, country);
  const network = networkOf(normalized);
  return (
    <div>
      <LightField
        ref={ref}
        label={label}
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        enterKeyHint="send"
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        error={error}
        indicator={normalized ? "ok" : "none"}
        onChange={(e) => onChange(e.target.value)}
        leading={
          <label className="relative flex shrink-0 items-center border-r border-[#d6d6d6] pr-1 pl-3">
            <span className="sr-only">Country code</span>
            <select
              value={country}
              disabled={disabled}
              onChange={(e) => onCountryChange(e.target.value)}
              className="text-body h-full cursor-pointer appearance-none bg-transparent pr-5 font-semibold text-[#333] outline-none"
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} +{c.code}
                </option>
              ))}
            </select>
            <span aria-hidden className="text-caption pointer-events-none absolute right-1.5">
              ▼
            </span>
          </label>
        }
      />
      {showNetwork ? (
        <div className="mt-3 min-h-8" aria-live="polite">
          {network ? <NetworkChip network={network} selected /> : null}
        </div>
      ) : null}
    </div>
  );
});

/** What to send the API: the number as typed for Tanzania (the server normalises), else +cc… */
export function phoneForApi(value: string, country: string): string {
  const normalized = normalizePhone(value, country);
  return normalized ? `+${normalized}` : value;
}
