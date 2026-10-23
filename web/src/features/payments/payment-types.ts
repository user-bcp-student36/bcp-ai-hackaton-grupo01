import { z } from "zod";

// Local copy: the payments schema is not in packages/contracts yet (parallel-p1 design).
export const paymentViewSchema = z.object({
  id: z.string(),
  sourceWalletId: z.string(),
  destinationWalletId: z.string(),
  recipientType: z.literal("contact"),
  amountCents: z.number().int().positive(),
  currency: z.literal("PEN"),
  status: z.literal("SUCCEEDED"),
  createdAt: z.string(),
});

export const paymentResponseSchema = z.object({ payment: paymentViewSchema });

export const paymentPayloadSchema = z.object({
  recipientType: z.literal("contact"),
  recipientWalletId: z.string().min(1),
  amountCents: z.number().int().positive(),
  currency: z.literal("PEN"),
});

export type PaymentView = z.infer<typeof paymentViewSchema>;
export type PaymentPayload = z.infer<typeof paymentPayloadSchema>;
export type SavedContact = { walletId: string; name: string };
