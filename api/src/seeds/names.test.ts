import { expect, test } from "vitest";
import { contactDisplayName } from "../features/contacts/domain/display-name.js";
import { TEST_USERS } from "./test-users.js";
import { FAILING_RECIPIENTS } from "./failing-recipients.js";
import { SEED_RECIPIENT } from "./contacts.js";
import { findSeedFullName } from "./names.js";

test("every seeded user has a name and shows it obfuscated, never the phone", () => {
  const phones = [SEED_RECIPIENT, ...FAILING_RECIPIENTS, ...TEST_USERS].map(
    (user) => user.phone,
  );
  for (const phone of phones) {
    const shown = contactDisplayName(findSeedFullName(phone), phone);
    expect(shown).toMatch(/^\S+ \S\*\*\*/);
    expect(shown).not.toContain(phone.slice(-3));
  }
});

test("an unknown phone falls back to a masked placeholder", () => {
  expect(contactDisplayName(findSeedFullName("+51911111111"), "+51911111111")).toBe(
    "Contacto ***111",
  );
});
