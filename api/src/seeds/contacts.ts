import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { hashPasswordSync } from "../features/onboarding/adapters/persistence/scrypt-passwords.js";

export const SEED_RECIPIENT = {
  userId: "seed-user-recipient",
  walletId: "seed-wallet-recipient",
  documentNumber: "70000001",
  phone: "+51900000001",
  email: "recipient@example.com",
  openingBalanceCents: 100_000,
} as const;

const SEEDED_AT = "2026-10-23T00:00:00.000Z";

// Idempotent: an existing recipient is left untouched, so funds are never reset.
export function seedContactRecipient(database: DatabaseSync): void {
  const exists = database
    .prepare("SELECT 1 FROM users WHERE id = ?")
    .get(SEED_RECIPIENT.userId);
  if (exists) return;

  // Nobody knows this password: the recipient only receives, it never logs in.
  const passwordHash = hashPasswordSync(randomBytes(16).toString("hex"));
  database
    .prepare(
      `INSERT INTO users
        (id, document_type, document_number, phone, email, password_hash, wallet_id,
         kyc_status, active, created_at, updated_at)
       VALUES (?, 'DNI', ?, ?, ?, ?, NULL, 'activa', 1, ?, ?)`,
    )
    .run(
      SEED_RECIPIENT.userId,
      SEED_RECIPIENT.documentNumber,
      SEED_RECIPIENT.phone,
      SEED_RECIPIENT.email,
      passwordHash,
      SEEDED_AT,
      SEEDED_AT,
    );
  database
    .prepare(`INSERT INTO wallets VALUES (?, ?, 'PEN', ?, ?, ?)`)
    .run(
      SEED_RECIPIENT.walletId,
      SEED_RECIPIENT.userId,
      SEED_RECIPIENT.openingBalanceCents,
      SEEDED_AT,
      SEEDED_AT,
    );
  database
    .prepare(`INSERT INTO wallet_openings VALUES (?, ?, ?)`)
    .run(SEED_RECIPIENT.walletId, SEED_RECIPIENT.openingBalanceCents, SEEDED_AT);
  database
    .prepare("UPDATE users SET wallet_id = ? WHERE id = ?")
    .run(SEED_RECIPIENT.walletId, SEED_RECIPIENT.userId);
}
