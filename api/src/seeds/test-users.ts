import type { DatabaseSync } from "node:sqlite";
import { FAILING_RECIPIENTS } from "./failing-recipients.js";
import { seedReceivingUser, type SeedRecipient } from "./contacts.js";

export const TEST_PASSWORD = "123456";
const SEEDED_AT = "2026-10-23T00:00:00.000Z";

// Demo logins, one per scenario in test.md. Keep both files in step.
export const TEST_USERS: readonly SeedRecipient[] = [
  {
    userId: "seed-user-ana",
    walletId: "seed-wallet-ana",
    documentNumber: "70000010",
    phone: "+51900000010",
    email: "ana.pagadora@example.com",
    openingBalanceCents: 100_000,
    password: TEST_PASSWORD,
  },
  {
    userId: "seed-user-beto",
    walletId: "seed-wallet-beto",
    documentNumber: "70000011",
    phone: "+51900000011",
    email: "beto.cobrador@example.com",
    openingBalanceCents: 100_000,
    password: TEST_PASSWORD,
  },
  {
    userId: "seed-user-saldo-bajo",
    walletId: "seed-wallet-saldo-bajo",
    documentNumber: "70000012",
    phone: "+51900000012",
    email: "saldo.bajo@example.com",
    openingBalanceCents: 500,
    password: TEST_PASSWORD,
  },
  {
    userId: "seed-user-pendiente",
    walletId: "seed-wallet-pendiente",
    documentNumber: "70000013",
    phone: "+51900000013",
    email: "kyc.pendiente@example.com",
    openingBalanceCents: 0,
    password: TEST_PASSWORD,
    kycStatus: "pendiente",
  },
  {
    userId: "seed-user-rechazado",
    walletId: "seed-wallet-rechazado",
    documentNumber: "70000014",
    phone: "+51900000014",
    email: "kyc.rechazado@example.com",
    openingBalanceCents: 0,
    password: TEST_PASSWORD,
    kycStatus: "rechazada",
  },
];

// Ana and Saldo bajo start with these saved contacts, so a payment needs no setup.
const SEEDED_CONTACT_OWNERS = ["seed-user-ana", "seed-user-saldo-bajo"] as const;

export function seedTestUsers(database: DatabaseSync): void {
  for (const user of TEST_USERS) seedReceivingUser(database, user);

  const contactUserIds = [
    "seed-user-beto",
    ...FAILING_RECIPIENTS.map((recipient) => recipient.userId),
  ];
  const insertContact = database.prepare(
    `INSERT OR IGNORE INTO contacts (id, owner_user_id, contact_user_id, created_at)
     VALUES (?, ?, ?, ?)`,
  );
  for (const ownerId of SEEDED_CONTACT_OWNERS) {
    for (const contactId of contactUserIds) {
      insertContact.run(`seed-contact-${ownerId}-${contactId}`, ownerId, contactId, SEEDED_AT);
    }
  }
}
