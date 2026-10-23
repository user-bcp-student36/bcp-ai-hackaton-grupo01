import type { DatabaseSync } from "node:sqlite";
import { PaymentError, paymentErrorCodes } from "../../application/ports.js";
import type {
  ContactReader,
  PaymentPort,
  PaymentRecord,
  TransferCommand,
  TransferOutcome,
} from "../../application/ports.js";
import { transferPayment } from "../../application/transfer.js";
import { SimulatedPaymentProvider } from "../provider/simulated-provider.js";
import { SqlitePayments } from "./sqlite-payments.js";

class SqliteContactReader implements ContactReader {
  constructor(private readonly database: DatabaseSync) {}

  hasSavedContactWallet(ownerUserId: string, walletId: string): boolean {
    const row = this.database
      .prepare(
        `SELECT 1 AS found FROM contacts c
        JOIN wallets w ON w.user_id = c.contact_user_id
        WHERE c.owner_user_id = ? AND w.id = ?`,
      )
      .get(ownerUserId, walletId);
    return row !== undefined;
  }
}

function toPaymentError(error: unknown): unknown {
  const code =
    error instanceof Error && "code" in error ? String(error.code) : null;
  return paymentErrorCodes.find((known) => known === code) !== undefined
    ? new PaymentError(code as (typeof paymentErrorCodes)[number])
    : error;
}

export type SqlitePaymentPortOptions = {
  maxAmountCents: number;
  now: () => string;
  newId: () => string;
};

// Composes the transfer use case with the SQLite ledger behind the HTTP port.
export class SqlitePaymentPort implements PaymentPort {
  private readonly ledger: SqlitePayments;
  private readonly transferUseCase: ReturnType<typeof transferPayment>;

  constructor(
    private readonly database: DatabaseSync,
    options: SqlitePaymentPortOptions,
  ) {
    this.ledger = new SqlitePayments(database);
    this.transferUseCase = transferPayment({
      ledger: this.ledger,
      contacts: new SqliteContactReader(database),
      provider: new SimulatedPaymentProvider(database),
      ...options,
    });
  }

  transfer(command: TransferCommand): TransferOutcome {
    try {
      const result = this.transferUseCase(command);
      return {
        outcome: result.outcome,
        payment: result.payment,
        wallet: {
          id: result.payment.sourceWalletId,
          currency: "PEN",
          balanceCents: result.senderBalanceCents,
        },
      };
    } catch (error) {
      throw toPaymentError(error);
    }
  }

  findByKey(sourceUserId: string, idempotencyKey: string): PaymentRecord | null {
    return this.ledger.findPaymentByRetryKey(sourceUserId, idempotencyKey);
  }

  findForParticipant(viewerUserId: string, paymentId: string): PaymentRecord | null {
    return this.ledger.findPaymentForParticipant(paymentId, viewerUserId);
  }
}
