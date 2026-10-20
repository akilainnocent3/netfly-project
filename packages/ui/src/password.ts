export interface Strength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
}

const COMMON = ["password", "123456", "qwerty", "letmein", "welcome", "netfly", "iloveyou", "admin"];

/** Lightweight strength estimate: length and variety, penalising common patterns. */
export function passwordStrength(password: string): Strength {
  if (!password) return { score: 0, label: "" };
  let bits = 0;
  const pools = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  const poolSize = [0, 26, 52, 62, 94][pools] ?? 26;
  bits = password.length * Math.log2(poolSize);
  const lower = password.toLowerCase();
  if (COMMON.some((c) => lower.includes(c))) bits -= 25;
  if (/(.)\1{2,}/.test(password)) bits -= 10;
  if (/^(?:0123|1234|abcd|qwer)/i.test(password)) bits -= 10;
  const score = (bits < 28 ? 0 : bits < 40 ? 1 : bits < 55 ? 2 : bits < 70 ? 3 : 4) as Strength["score"];
  return { score, label: ["Too weak", "Weak", "Okay", "Strong", "Very strong"][score] ?? "" };
}
