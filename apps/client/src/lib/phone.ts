/**
 * Phone numbers as the API stores them: E.164 digits without "+" (255712345678), Tanzania
 * first. Mirrors backend/apps/accounts/phone.py so the field can show the network chip and a
 * friendly error before submitting (the server still normalises and validates).
 */

export const COUNTRIES = [
  { code: "255", label: "Tanzania", flag: "🇹🇿" },
  { code: "254", label: "Kenya", flag: "🇰🇪" },
  { code: "256", label: "Uganda", flag: "🇺🇬" },
  { code: "250", label: "Rwanda", flag: "🇷🇼" },
  { code: "257", label: "Burundi", flag: "🇧🇮" },
  { code: "243", label: "DR Congo", flag: "🇨🇩" },
  { code: "260", label: "Zambia", flag: "🇿🇲" },
  { code: "265", label: "Malawi", flag: "🇲🇼" },
  { code: "258", label: "Mozambique", flag: "🇲🇿" },
  { code: "27", label: "South Africa", flag: "🇿🇦" },
  { code: "44", label: "United Kingdom", flag: "🇬🇧" },
  { code: "1", label: "United States", flag: "🇺🇸" },
] as const;

export type Network = "vodacom" | "airtel" | "mixx" | "halotel";

const TZ_NETWORKS: Record<string, Network> = {
  "74": "vodacom",
  "75": "vodacom",
  "76": "vodacom",
  "79": "vodacom",
  "68": "airtel",
  "69": "airtel",
  "78": "airtel",
  "65": "mixx",
  "67": "mixx",
  "71": "mixx",
  "77": "mixx",
  "61": "halotel",
  "62": "halotel",
};

export const NETWORKS: Record<Network, { label: string; color: string }> = {
  vodacom: { label: "Vodacom M-Pesa", color: "#e60000" },
  airtel: { label: "Airtel Money", color: "#d71920" },
  mixx: { label: "Mixx by Yas", color: "#1d4ed8" },
  halotel: { label: "Halotel", color: "#f26522" },
};

/** Canonical digits, or null while it isn't a valid number yet. */
export function normalizePhone(raw: string, country = "255"): string | null {
  const text = raw.trim();
  if (!text || /[^\d\s()+.-]/.test(text)) return null;
  let digits = text.replace(/\D/g, "");
  if (text.startsWith("+")) {
    /* already international */
  } else if (text.startsWith("00")) digits = digits.slice(2);
  else if (country === "255" && digits.startsWith("0") && digits.length === 10)
    digits = `255${digits.slice(1)}`;
  else if (country === "255" && digits.length === 9 && /^[67]/.test(digits))
    digits = `255${digits}`;
  else if (!digits.startsWith(country)) digits = country + digits.replace(/^0+/, "");
  if (digits.startsWith("255")) return /^255[67]\d{8}$/.test(digits) ? digits : null;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function networkOf(phone: string | null | undefined): Network | null {
  if (!phone || !phone.startsWith("255") || phone.length !== 12) return null;
  return TZ_NETWORKS[phone.slice(3, 5)] ?? null;
}

/** 0712 ••• 678 */
export function maskPhone(phone: string): string {
  if (phone.startsWith("255") && phone.length === 12) {
    const local = `0${phone.slice(3)}`;
    return `${local.slice(0, 4)} ••• ${local.slice(-3)}`;
  }
  return phone.length > 6 ? `+${phone.slice(0, -6)}•••${phone.slice(-3)}` : phone;
}
