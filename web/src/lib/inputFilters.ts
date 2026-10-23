// Input filters: they drop characters the contract would reject, so the user can't type past a limit.
export const DNI_LENGTH = 8;
export const PASSWORD_LENGTH = 6;
const CE_MAX_LENGTH = 12;
const PHONE_DIGITS = 9;
const PHONE_PREFIX = "+51";
const AMOUNT_DECIMALS = 2;
const AMOUNT_MAX_INTEGER_DIGITS = 6;

export function digitsOnly(value: string, maxLength: number): string {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

export function documentNumberFilter(
  documentType: "DNI" | "CE",
): (value: string) => string {
  return documentType === "DNI"
    ? (value) => digitsOnly(value, DNI_LENGTH)
    : (value) =>
        value
          .replace(/[^a-zA-Z0-9]/g, "")
          .toUpperCase()
          .slice(0, CE_MAX_LENGTH);
}

export const documentMaxLength = (documentType: "DNI" | "CE"): number =>
  documentType === "DNI" ? DNI_LENGTH : CE_MAX_LENGTH;

// Accepts 9XXXXXXXX or +519XXXXXXXX.
export function phoneFilter(value: string): string {
  const hasPrefix = value.trimStart().startsWith("+");
  const digits = value.replace(/\D/g, "");
  if (!hasPrefix) return digits.slice(0, PHONE_DIGITS);
  return `+${digits.slice(0, PHONE_PREFIX.length - 1 + PHONE_DIGITS)}`;
}

export const PHONE_MAX_LENGTH = PHONE_PREFIX.length + PHONE_DIGITS;

// Decimal amount in soles: digits and a single dot with up to two decimals.
export function amountFilter(value: string): string {
  const cleaned = value.replace(",", ".").replace(/[^0-9.]/g, "");
  const [integer = "", ...rest] = cleaned.split(".");
  const integerPart = integer.slice(0, AMOUNT_MAX_INTEGER_DIGITS);
  if (rest.length === 0) return integerPart;
  return `${integerPart}.${rest.join("").slice(0, AMOUNT_DECIMALS)}`;
}
