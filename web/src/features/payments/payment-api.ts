import { z } from "zod";
import type { PaymentAttempt } from "./payment-attempt";
import { paymentResponseSchema, type PaymentView } from "./payment-types";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";
// A request past this limit is an unknown result, not a failed payment.
const PAYMENT_REQUEST_TIMEOUT_MS = 10_000;
const PAYMENT_NOT_FOUND_CODE = "PAYMENT_NOT_FOUND";
const UNKNOWN_STATUS_MIN = 500;

const errorBodySchema = z.object({ error: z.object({ code: z.string() }) });

const REJECTION_MESSAGES: Partial<Record<string, string>> = {
  UNAUTHENTICATED: "Tu sesión venció. Ingresa de nuevo para pagar.",
  ACCOUNT_INACTIVE: "Tu cuenta todavía no está activa para pagar.",
  VALIDATION_ERROR: "Revisa el monto y el destinatario.",
  RECIPIENT_NOT_FOUND: "El contacto ya no está disponible.",
  SELF_TRANSFER: "No puedes pagarte a ti mismo.",
  CONTACT_REQUIRED: "Solo puedes pagar a contactos guardados.",
  INSUFFICIENT_FUNDS: "Saldo insuficiente para este pago.",
  BALANCE_LIMIT_EXCEEDED: "El destinatario no puede recibir ese monto.",
  IDEMPOTENCY_CONFLICT:
    "Esta operación ya se usó con otros datos. Vuelve a intentarlo.",
};
const DEFAULT_REJECTION_MESSAGE = "No se pudo completar el pago.";

export type Settled =
  | { kind: "confirmed"; payment: PaymentView }
  | { kind: "rejected"; code: string }
  | { kind: "unknown" };

type RawResponse = { status: number; body: unknown };
type RequestInitLike = {
  method: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
};

async function send(
  path: string,
  init: RequestInitLike,
  accessToken: string,
): Promise<RawResponse | undefined> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...init.headers,
      },
      signal: AbortSignal.timeout(PAYMENT_REQUEST_TIMEOUT_MS),
    });
    const body: unknown = await response.json().catch(() => undefined);
    return { status: response.status, body };
  } catch {
    // A dropped connection does not prove the payment failed.
    return undefined;
  }
}

function settle(response: RawResponse | undefined): Settled {
  if (!response || response.status >= UNKNOWN_STATUS_MIN) {
    return { kind: "unknown" };
  }
  if (response.status === 200 || response.status === 201) {
    const parsed = paymentResponseSchema.safeParse(response.body);
    return parsed.success
      ? { kind: "confirmed", payment: parsed.data.payment }
      : { kind: "unknown" };
  }
  const parsedError = errorBodySchema.safeParse(response.body);
  return {
    kind: "rejected",
    code: parsedError.success ? parsedError.data.error.code : "HTTP_ERROR",
  };
}

export async function submitPayment(
  attempt: PaymentAttempt,
  accessToken: string,
): Promise<Settled> {
  return settle(
    await send(
      "/payments",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": attempt.key,
        },
        body: JSON.stringify(attempt.payload),
      },
      accessToken,
    ),
  );
}

async function lookupByKey(key: string, accessToken: string): Promise<Settled> {
  return settle(
    await send(
      `/payments/by-key/${encodeURIComponent(key)}`,
      { method: "GET" },
      accessToken,
    ),
  );
}

/** Resolves an unknown attempt with the same key; never creates a new key. */
export async function resolvePaymentAttempt(
  attempt: PaymentAttempt,
  accessToken: string,
): Promise<Settled> {
  const lookup = await lookupByKey(attempt.key, accessToken);
  if (lookup.kind === "confirmed") return lookup;
  if (lookup.kind === "rejected" && lookup.code === PAYMENT_NOT_FOUND_CODE) {
    return submitPayment(attempt, accessToken);
  }
  return { kind: "unknown" };
}

export function describeRejection(code: string): string {
  return REJECTION_MESSAGES[code] ?? DEFAULT_REJECTION_MESSAGE;
}
