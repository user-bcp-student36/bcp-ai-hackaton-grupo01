const CENTS_PER_SOL = 100;
const DECIMAL_PLACES = 2;
const PEN_AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;
const INVALID_AMOUNT_MESSAGE =
  "Ingresa un monto en soles, con hasta dos decimales. Ej.: 25.50";
const NON_POSITIVE_AMOUNT_MESSAGE = "El monto debe ser mayor que cero.";

export type AmountParseResult =
  { ok: true; cents: number } | { ok: false; message: string };

export function parsePenAmountToCents(input: string): AmountParseResult {
  const text = input.trim();
  if (!PEN_AMOUNT_PATTERN.test(text)) {
    return { ok: false, message: INVALID_AMOUNT_MESSAGE };
  }
  const [whole = "", fraction = ""] = text.split(".");
  // Digits are concatenated, never multiplied by 100: "25.5" becomes "2550".
  const cents = Number(`${whole}${fraction.padEnd(DECIMAL_PLACES, "0")}`);
  if (!Number.isSafeInteger(cents)) {
    return { ok: false, message: INVALID_AMOUNT_MESSAGE };
  }
  if (cents <= 0) {
    return { ok: false, message: NON_POSITIVE_AMOUNT_MESSAGE };
  }
  return { ok: true, cents };
}

export function formatCentsAsDecimal(cents: number): string {
  const whole = Math.floor(cents / CENTS_PER_SOL);
  const fraction = String(cents % CENTS_PER_SOL).padStart(DECIMAL_PLACES, "0");
  return `${String(whole)}.${fraction}`;
}

export function formatPenCents(cents: number): string {
  const whole = Math.floor(cents / CENTS_PER_SOL).toLocaleString("en-US");
  const fraction = String(cents % CENTS_PER_SOL).padStart(DECIMAL_PLACES, "0");
  return `S/ ${whole}.${fraction}`;
}
