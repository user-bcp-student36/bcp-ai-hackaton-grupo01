import { z } from "zod";
import { paymentPayloadSchema } from "./payment-types";

// Owner-bound slot: a later user never reads another user's unresolved attempt.
const STORAGE_PREFIX = "wallet.payment-attempt:";
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;
const IDEMPOTENCY_KEY_MAX_LENGTH = 100;

const attemptSchema = z.object({
  ownerUserId: z.string().min(1),
  key: z
    .string()
    .min(1)
    .max(IDEMPOTENCY_KEY_MAX_LENGTH)
    .regex(IDEMPOTENCY_KEY_PATTERN),
  payload: paymentPayloadSchema,
});

export type PaymentAttempt = z.infer<typeof attemptSchema>;

function storageKey(ownerUserId: string): string {
  return `${STORAGE_PREFIX}${ownerUserId}`;
}

function parseStored(raw: string): unknown {
  // Unreadable storage is discarded: it can never be a valid attempt.
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

export function loadPaymentAttempt(
  ownerUserId: string,
): PaymentAttempt | undefined {
  const raw = sessionStorage.getItem(storageKey(ownerUserId));
  if (raw === null) return undefined;
  const parsed = attemptSchema.safeParse(parseStored(raw));
  if (!parsed.success || parsed.data.ownerUserId !== ownerUserId) {
    clearPaymentAttempt(ownerUserId);
    return undefined;
  }
  return parsed.data;
}

export function savePaymentAttempt(attempt: PaymentAttempt): void {
  sessionStorage.setItem(
    storageKey(attempt.ownerUserId),
    JSON.stringify(attempt),
  );
}

export function clearPaymentAttempt(ownerUserId: string): void {
  sessionStorage.removeItem(storageKey(ownerUserId));
}

export function hasUnresolvedPaymentAttempt(ownerUserId: string): boolean {
  return loadPaymentAttempt(ownerUserId) !== undefined;
}
