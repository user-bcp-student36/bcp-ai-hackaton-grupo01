import { z } from "zod";

// Local copy of the PaymentView Contract until the shared payments schema is merged.
export const paymentViewSchema = z.strictObject({
  id: z.string(),
  sourceWalletId: z.string(),
  destinationWalletId: z.string(),
  recipientType: z.literal("contact"),
  amountCents: z.number().int(),
  currency: z.literal("PEN"),
  status: z.literal("SUCCEEDED"),
  createdAt: z.string(),
  counterpartyName: z.string(),
});

export type PaymentView = z.infer<typeof paymentViewSchema>;
