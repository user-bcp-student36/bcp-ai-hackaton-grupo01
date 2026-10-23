import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type {
  ActiveWallet,
  PaymentLedger,
  PaymentRecord,
  PaymentTransaction,
  RetryKeyRecord,
} from "../../application/ports.js";
import { StorageUnavailable } from "../../domain/payment.js";

const MAX_BALANCE_CENTS = 100_000_000;
const SQLITE_BUSY_CODES = [5, 6];

const paymentSelect = `SELECT p.id, p.source_wallet_id AS sourceWalletId,
  p.destination_wallet_id AS destinationWalletId, p.recipient_type AS recipientType,
  p.amount_cents AS amountCents, p.currency, p.status, p.created_at AS createdAt
  FROM payments p`;

const paymentRow = z.object({
  id: z.string(),
  sourceWalletId: z.string(),
  destinationWalletId: z.string(),
  recipientType: z.literal("contact"),
  amountCents: z.number().int(),
  currency: z.literal("PEN"),
  status: z.literal("SUCCEEDED"),
  createdAt: z.string(),
});
const retryKeyRow = z.object({
  fingerprint: z.string(),
  paymentId: z.string(),
});
const activeWalletRow = z.object({
  id: z.string(),
  userId: z.string(),
  balanceCents: z.number().int(),
});

function parsePayment(row: unknown): PaymentRecord {
  return paymentRow.parse(row);
}

function parseActiveWallet(row: unknown): ActiveWallet | null {
  return row ? activeWalletRow.parse(row) : null;
}

function isBusyError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "errcode" in error &&
    typeof error.errcode === "number" &&
    SQLITE_BUSY_CODES.includes(error.errcode & 0xff)
  );
}

class SqlitePaymentTransaction implements PaymentTransaction {
  constructor(private readonly database: DatabaseSync) {}

  findRetryKey(sourceUserId: string, key: string): RetryKeyRecord | null {
    const row = this.database
      .prepare(
        "SELECT fingerprint, payment_id AS paymentId FROM payment_keys WHERE source_user_id = ? AND key = ?",
      )
      .get(sourceUserId, key);
    return row ? retryKeyRow.parse(row) : null;
  }

  findPaymentById(paymentId: string): PaymentRecord | null {
    const row = this.database
      .prepare(`${paymentSelect} WHERE p.id = ?`)
      .get(paymentId);
    return row ? parsePayment(row) : null;
  }

  findActiveWalletByUserId(userId: string): ActiveWallet | null {
    return parseActiveWallet(
      this.database
        .prepare(
          `SELECT w.id, w.user_id AS userId, w.balance_cents AS balanceCents
          FROM wallets w JOIN users u ON u.id = w.user_id
          WHERE w.user_id = ? AND u.active = 1`,
        )
        .get(userId),
    );
  }

  findActiveWalletById(walletId: string): ActiveWallet | null {
    return parseActiveWallet(
      this.database
        .prepare(
          `SELECT w.id, w.user_id AS userId, w.balance_cents AS balanceCents
          FROM wallets w JOIN users u ON u.id = w.user_id
          WHERE w.id = ? AND u.active = 1`,
        )
        .get(walletId),
    );
  }

  debit(walletId: string, amountCents: number, updatedAt: string): boolean {
    const result = this.database
      .prepare(
        `UPDATE wallets SET balance_cents = balance_cents - ?, updated_at = ?
        WHERE id = ? AND balance_cents >= ?`,
      )
      .run(amountCents, updatedAt, walletId, amountCents);
    return Number(result.changes) > 0;
  }

  credit(walletId: string, amountCents: number, updatedAt: string): boolean {
    const result = this.database
      .prepare(
        `UPDATE wallets SET balance_cents = balance_cents + ?, updated_at = ?
        WHERE id = ? AND balance_cents + ? <= ?`,
      )
      .run(amountCents, updatedAt, walletId, amountCents, MAX_BALANCE_CENTS);
    return Number(result.changes) > 0;
  }

  insertPayment(payment: PaymentRecord): void {
    this.database
      .prepare(
        `INSERT INTO payments (id, source_wallet_id, destination_wallet_id,
        recipient_type, amount_cents, currency, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        payment.id,
        payment.sourceWalletId,
        payment.destinationWalletId,
        payment.recipientType,
        payment.amountCents,
        payment.currency,
        payment.status,
        payment.createdAt,
      );
  }

  insertRetryKey(input: {
    sourceUserId: string;
    key: string;
    fingerprint: string;
    paymentId: string;
    createdAt: string;
  }): void {
    this.database
      .prepare(
        `INSERT INTO payment_keys (source_user_id, key, fingerprint, payment_id, created_at)
        VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        input.sourceUserId,
        input.key,
        input.fingerprint,
        input.paymentId,
        input.createdAt,
      );
  }
}

export class SqlitePayments implements PaymentLedger {
  constructor(private readonly database: DatabaseSync) {}

  transact<T>(work: (transaction: PaymentTransaction) => T): T {
    try {
      this.database.exec("BEGIN IMMEDIATE");
    } catch (error) {
      throw isBusyError(error) ? new StorageUnavailable() : error;
    }
    try {
      const value = work(new SqlitePaymentTransaction(this.database));
      this.database.exec("COMMIT");
      return value;
    } catch (error) {
      if (this.database.isTransaction) this.database.exec("ROLLBACK");
      throw isBusyError(error) ? new StorageUnavailable() : error;
    }
  }

  findPaymentByRetryKey(sourceUserId: string, key: string): PaymentRecord | null {
    const row = this.database
      .prepare(
        `${paymentSelect} JOIN payment_keys k ON k.payment_id = p.id
        WHERE k.source_user_id = ? AND k.key = ?`,
      )
      .get(sourceUserId, key);
    return row ? parsePayment(row) : null;
  }

  findPaymentForParticipant(paymentId: string, userId: string): PaymentRecord | null {
    const row = this.database
      .prepare(
        `${paymentSelect}
        JOIN wallets sw ON sw.id = p.source_wallet_id
        JOIN wallets dw ON dw.id = p.destination_wallet_id
        WHERE p.id = ? AND (sw.user_id = ? OR dw.user_id = ?)`,
      )
      .get(paymentId, userId, userId);
    return row ? parsePayment(row) : null;
  }
}
