import { errorResponseSchema } from "@wallet/contracts";
import { z } from "zod";
import { ApiError, DEFAULT_ERROR_MESSAGE } from "../../lib/apiClient";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";

// Local mirror of `PaymentView` from payments/design.md#contracts. The shared
// schema is owned by the payments group, so it is declared here until it is
// merged. Strict: an unknown or missing field is a failed read, never a guess.
export const paymentViewSchema = z.strictObject({
  id: z.string().min(1),
  sourceWalletId: z.string().min(1),
  destinationWalletId: z.string().min(1),
  recipientType: z.literal("contact"),
  amountCents: z.number().int().positive(),
  currency: z.literal("PEN"),
  status: z.literal("SUCCEEDED"),
  createdAt: z.iso.datetime(),
  counterpartyName: z.string(),
});

const listPaymentsResponseSchema = z.strictObject({
  payments: z.array(paymentViewSchema),
});
const receiptResponseSchema = z.strictObject({ receipt: paymentViewSchema });

// Only the error object is read; the top-level shape may carry sibling keys.
const errorBodySchema = z.object({ error: errorResponseSchema.shape.error });

export type PaymentView = z.infer<typeof paymentViewSchema>;

/** The signed-in identity the screens need: the bearer token and the user's wallet. */
export type ReceiptSession = {
  readonly accessToken: string;
  readonly walletId: string;
};

export interface PaymentsClient {
  listPayments(accessToken: string): Promise<PaymentView[]>;
  getReceipt(accessToken: string, paymentId: string): Promise<PaymentView>;
}

async function request(path: string, accessToken: string): Promise<unknown> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const body: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const parsed = errorBodySchema.safeParse(body);
    throw new ApiError(
      parsed.success ? parsed.data.error.code : "HTTP_ERROR",
      parsed.success ? parsed.data.error.message : DEFAULT_ERROR_MESSAGE,
      response.status,
    );
  }
  return body;
}

export const paymentsClient: PaymentsClient = {
  async listPayments(accessToken) {
    const body = await request("/payments", accessToken);
    return listPaymentsResponseSchema.parse(body).payments;
  },
  async getReceipt(accessToken, paymentId) {
    const body = await request(
      `/payments/${encodeURIComponent(paymentId)}/receipt`,
      accessToken,
    );
    return receiptResponseSchema.parse(body).receipt;
  },
};
