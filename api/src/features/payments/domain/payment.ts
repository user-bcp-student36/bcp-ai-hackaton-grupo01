import { createHash } from "node:crypto";

export const MAX_BALANCE_CENTS = 100_000_000;

export type PaymentCommand = {
  sourceUserId: string;
  idempotencyKey: string;
  recipientWalletId: string;
  amountCents: number;
};

export class InvalidPaymentAmount extends Error {
  readonly code = "VALIDATION_ERROR";
  constructor() {
    super("Monto de pago no válido.");
  }
}

export class RecipientNotFound extends Error {
  readonly code = "RECIPIENT_NOT_FOUND";
  constructor() {
    super("Destinatario no encontrado.");
  }
}

export class SelfTransfer extends Error {
  readonly code = "SELF_TRANSFER";
  constructor() {
    super("No puedes pagarte a ti mismo.");
  }
}

export class ContactRequired extends Error {
  readonly code = "CONTACT_REQUIRED";
  constructor() {
    super("Solo puedes pagar a tus contactos guardados.");
  }
}

export class InsufficientFunds extends Error {
  readonly code = "INSUFFICIENT_FUNDS";
  constructor() {
    super("Saldo insuficiente.");
  }
}

export class BalanceLimitExceeded extends Error {
  readonly code = "BALANCE_LIMIT_EXCEEDED";
  constructor() {
    super("El saldo del destinatario superaría el límite.");
  }
}

export class IdempotencyConflict extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";
  constructor() {
    super("La clave de idempotencia ya se usó con otro pago.");
  }
}

export class StorageUnavailable extends Error {
  readonly code = "STORAGE_UNAVAILABLE";
  constructor() {
    super("Almacenamiento no disponible.");
  }
}

// Ordered fields, not JSON key order, so equal payloads always hash equal.
export function paymentFingerprint(
  command: Pick<PaymentCommand, "recipientWalletId" | "amountCents">,
): string {
  const canonical = JSON.stringify([
    "PEN",
    "contact",
    command.recipientWalletId,
    command.amountCents,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

export function isPayableAmount(amountCents: number, maxCents: number): boolean {
  return Number.isSafeInteger(amountCents) && amountCents >= 1 && amountCents <= maxCents;
}
