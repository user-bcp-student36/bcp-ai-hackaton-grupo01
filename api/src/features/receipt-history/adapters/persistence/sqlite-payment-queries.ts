import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { contactDisplayName } from "../../../contacts/domain/display-name.js";
import type { PaymentQuery } from "../../application/ports.js";
import { paymentViewSchema, type PaymentView } from "../../domain/payment-view.js";

// Supplied by the composition root; null when the name is unknown.
export type FullNameOf = (phone: string) => string | null;
const unknownName: FullNameOf = () => null;

const paymentRow = paymentViewSchema.omit({ counterpartyName: true }).extend({
  counterpartyPhone: z.string().nullable(),
  counterpartyFullName: z.string().nullable(),
});

// Aliases map the snake_case columns of migration 004 to the PaymentView fields.
// The counterparty is the other wallet of the payment, relative to the viewer (first parameter).
const selectPayments = `
  SELECT p.id,
         p.source_wallet_id AS sourceWalletId,
         p.destination_wallet_id AS destinationWalletId,
         p.recipient_type AS recipientType,
         p.amount_cents AS amountCents,
         p.currency,
         p.status,
         p.created_at AS createdAt,
         u.phone AS counterpartyPhone,
         u.full_name AS counterpartyFullName
  FROM payments p
  LEFT JOIN wallets w ON w.id = CASE WHEN p.source_wallet_id = ?
    THEN p.destination_wallet_id ELSE p.source_wallet_id END
  LEFT JOIN users u ON u.id = w.user_id`;

// Statements are prepared per call: the payments table arrives with its own migration.
export class SqlitePaymentQueries implements PaymentQuery {
  constructor(
    private readonly database: DatabaseSync,
    private readonly fullNameOf: FullNameOf = unknownName,
  ) {}

  listForWallet(walletId: string): PaymentView[] {
    return this.database
      .prepare(
        `${selectPayments} WHERE p.source_wallet_id = ? OR p.destination_wallet_id = ?`,
      )
      .all(walletId, walletId, walletId)
      .map((row) => this.toView(row));
  }

  findForWallet(paymentId: string, walletId: string): PaymentView | null {
    const row = this.database
      .prepare(
        `${selectPayments} WHERE p.id = ? AND (p.source_wallet_id = ? OR p.destination_wallet_id = ?)`,
      )
      .get(walletId, paymentId, walletId, walletId);
    return row === undefined ? null : this.toView(row);
  }

  private toView(row: unknown): PaymentView {
    const { counterpartyPhone, counterpartyFullName, ...payment } =
      paymentRow.parse(row);
    const phone = counterpartyPhone ?? "";
    return {
      ...payment,
      counterpartyName: contactDisplayName(
        counterpartyFullName ?? this.fullNameOf(phone),
        phone,
      ),
    };
  }
}
