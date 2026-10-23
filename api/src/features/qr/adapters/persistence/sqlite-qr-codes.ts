import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { QrCode, QrRepository } from "../../application/ports.js";

const qrRow = z.object({
  id: z.string(),
  wallet_id: z.string(),
  owner_user_id: z.string(),
  owner_phone: z.string(),
  amount_cents: z.number().nullable(),
  expires_at: z.string(),
});

const qrSelect = `SELECT q.id, q.wallet_id, w.user_id AS owner_user_id,
  u.phone AS owner_phone, q.amount_cents, q.expires_at
  FROM qr_codes q
  JOIN wallets w ON w.id = q.wallet_id
  JOIN users u ON u.id = w.user_id`;

function mapQr(row: unknown): QrCode {
  const parsed = qrRow.parse(row);
  return {
    id: parsed.id,
    walletId: parsed.wallet_id,
    ownerUserId: parsed.owner_user_id,
    ownerPhone: parsed.owner_phone,
    amountCents: parsed.amount_cents,
    expiresAt: parsed.expires_at,
  };
}

export class SqliteQrCodes implements QrRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(input: {
    id: string;
    ownerUserId: string;
    amountCents: number | null;
    createdAt: string;
    expiresAt: string;
  }): QrCode | null {
    const result = this.database
      .prepare(
        `INSERT INTO qr_codes (id, wallet_id, amount_cents, created_at, expires_at)
        SELECT ?, w.id, ?, ?, ? FROM wallets w WHERE w.user_id = ?`,
      )
      .run(input.id, input.amountCents, input.createdAt, input.expiresAt, input.ownerUserId);
    return result.changes === 1 ? this.findById(input.id) : null;
  }

  findById(id: string): QrCode | null {
    const row = this.database.prepare(`${qrSelect} WHERE q.id = ?`).get(id);
    return row ? mapQr(row) : null;
  }
}
