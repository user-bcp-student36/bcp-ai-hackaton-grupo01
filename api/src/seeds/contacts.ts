import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { hashPasswordSync } from "../features/onboarding/adapters/persistence/scrypt-passwords.js";
import { findSeedFullName } from "./names.js";

export const SEED_RECIPIENT = {
  userId: "seed-user-recipient",
  walletId: "seed-wallet-recipient",
  documentNumber: "70000001",
  phone: "+51900000001",
  email: "recipient@example.com",
  openingBalanceCents: 100_000,
} as const;

const SEEDED_AT = "2026-10-23T00:00:00.000Z";

export type SeedRecipient = {
  readonly userId: string;
  readonly walletId: string;
  readonly documentNumber: string;
  readonly phone: string;
  readonly email: string;
  readonly openingBalanceCents: number;
  // Set only for users that must log in; the default is an unknown random password.
  readonly password?: string;
  // Anything but "activa" seeds an inactive user with no wallet.
  readonly kycStatus?: "activa" | "pendiente" | "rechazada";
};

export function seedContactRecipient(database: DatabaseSync): void {
  seedReceivingUser(database, SEED_RECIPIENT);
}

// Idempotent: an existing user is left untouched, so funds are never reset.
export function seedReceivingUser(
  database: DatabaseSync,
  recipient: SeedRecipient,
): void {
  const exists = database
    .prepare("SELECT 1 FROM users WHERE id = ?")
    .get(recipient.userId);
  if (exists) return;

  const kycStatus = recipient.kycStatus ?? "activa";
  const isActive = kycStatus === "activa";
  const passwordHash = hashPasswordSync(
    recipient.password ?? randomBytes(16).toString("hex"),
  );
  database
    .prepare(
      `INSERT INTO users
        (id, document_type, document_number, phone, email, password_hash, wallet_id,
         kyc_status, active, created_at, updated_at, full_name)
       VALUES (?, 'DNI', ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
    )
    .run(
      recipient.userId,
      recipient.documentNumber,
      recipient.phone,
      recipient.email,
      passwordHash,
      kycStatus,
      Number(isActive),
      SEEDED_AT,
      SEEDED_AT,
      findSeedFullName(recipient.phone),
    );
  if (!isActive) return;

  database
    .prepare(`INSERT INTO wallets VALUES (?, ?, 'PEN', ?, ?, ?)`)
    .run(
      recipient.walletId,
      recipient.userId,
      recipient.openingBalanceCents,
      SEEDED_AT,
      SEEDED_AT,
    );
  database
    .prepare(`INSERT INTO wallet_openings VALUES (?, ?, ?)`)
    .run(recipient.walletId, recipient.openingBalanceCents, SEEDED_AT);
  database
    .prepare("UPDATE users SET wallet_id = ? WHERE id = ?")
    .run(recipient.walletId, recipient.userId);
}
