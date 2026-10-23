import { z } from "zod";

export const QR_PAYLOAD_PREFIX = "altoque-qr:";
export const QR_TTL_SECONDS = 300;
const MAX_QR_AMOUNT_CENTS = 100_000_000;

export const createQrInputSchema = z.strictObject({
  amountCents: z.number().int().min(1).max(MAX_QR_AMOUNT_CENTS).optional(),
});
export const createQrResponseSchema = z.strictObject({
  qr: z.strictObject({
    id: z.string(),
    payload: z.string(),
    amountCents: z.number().int().nullable(),
    expiresAt: z.string(),
  }),
});

export const resolveQrInputSchema = z.strictObject({
  payload: z
    .string()
    .trim()
    .startsWith(QR_PAYLOAD_PREFIX)
    .min(QR_PAYLOAD_PREFIX.length + 1)
    .max(100),
});
export const resolveQrResponseSchema = z.strictObject({
  qr: z.strictObject({
    id: z.string(),
    recipientWalletId: z.string(),
    recipientPhone: z.string(),
    amountCents: z.number().int().nullable(),
    expiresAt: z.string(),
  }),
});

export type CreateQrInput = z.infer<typeof createQrInputSchema>;
export type CreateQrResponse = z.infer<typeof createQrResponseSchema>;
export type ResolveQrInput = z.infer<typeof resolveQrInputSchema>;
export type ResolveQrResponse = z.infer<typeof resolveQrResponseSchema>;
