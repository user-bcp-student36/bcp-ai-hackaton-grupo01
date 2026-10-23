import {
  BalanceLimitExceeded,
  ContactRequired,
  IdempotencyConflict,
  InsufficientFunds,
  InvalidPaymentAmount,
  RecipientNotFound,
  SelfTransfer,
  isPayableAmount,
  paymentFingerprint,
} from "../domain/payment.js";
import type { PaymentCommand } from "../domain/payment.js";
import type {
  ContactReader,
  PaymentLedger,
  PaymentRecord,
} from "./ports.js";

type Dependencies = {
  ledger: PaymentLedger;
  contacts: ContactReader;
  maxAmountCents: number;
  now: () => string;
  newId: () => string;
};

export type TransferResult = {
  outcome: "created" | "replayed";
  payment: PaymentRecord;
  senderBalanceCents: number;
};

export function transferPayment(deps: Dependencies) {
  return (command: PaymentCommand): TransferResult => {
    if (!isPayableAmount(command.amountCents, deps.maxAmountCents)) {
      throw new InvalidPaymentAmount();
    }
    const fingerprint = paymentFingerprint(command);
    return deps.ledger.transact((tx) => {
      const retry = tx.findRetryKey(command.sourceUserId, command.idempotencyKey);
      if (retry) {
        if (retry.fingerprint !== fingerprint) throw new IdempotencyConflict();
        const payment = tx.findPaymentById(retry.paymentId);
        const sender = tx.findActiveWalletByUserId(command.sourceUserId);
        if (!payment || !sender) {
          throw new Error("Payment ledger is inconsistent for a committed key.");
        }
        return {
          outcome: "replayed",
          payment,
          senderBalanceCents: sender.balanceCents,
        };
      }

      const sender = tx.findActiveWalletByUserId(command.sourceUserId);
      if (!sender) throw new Error("Sender wallet is not active.");
      const recipient = tx.findActiveWalletById(command.recipientWalletId);
      if (!recipient) throw new RecipientNotFound();
      if (recipient.userId === command.sourceUserId) throw new SelfTransfer();
      if (!deps.contacts.hasSavedContactWallet(command.sourceUserId, recipient.id)) {
        throw new ContactRequired();
      }

      const updatedAt = deps.now();
      if (!tx.debit(sender.id, command.amountCents, updatedAt)) {
        throw new InsufficientFunds();
      }
      if (!tx.credit(recipient.id, command.amountCents, updatedAt)) {
        throw new BalanceLimitExceeded();
      }
      const payment: PaymentRecord = {
        id: deps.newId(),
        sourceWalletId: sender.id,
        destinationWalletId: recipient.id,
        recipientType: "contact",
        amountCents: command.amountCents,
        currency: "PEN",
        status: "SUCCEEDED",
        createdAt: updatedAt,
      };
      tx.insertPayment(payment);
      tx.insertRetryKey({
        sourceUserId: command.sourceUserId,
        key: command.idempotencyKey,
        fingerprint,
        paymentId: payment.id,
        createdAt: updatedAt,
      });
      return {
        outcome: "created",
        payment,
        senderBalanceCents: sender.balanceCents - command.amountCents,
      };
    });
  };
}
