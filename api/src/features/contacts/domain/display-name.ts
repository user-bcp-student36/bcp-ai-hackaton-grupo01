const VISIBLE_PHONE_DIGITS = 3;

// "Andrés Koga" becomes "Andrés K***"; without a known name only the phone tail shows.
export function contactDisplayName(fullName: string | null, phone: string): string {
  const [first, ...rest] = (fullName ?? "").trim().split(/\s+/);
  if (first) {
    return rest.length > 0
      ? `${first} ${rest.map((part) => `${part.charAt(0)}***`).join(" ")}`
      : first;
  }
  return `Contacto ***${phone.slice(-VISIBLE_PHONE_DIGITS)}`;
}
