import { z } from "zod";
import { phoneSchema } from "./onboarding.js";

export const MAX_CONTACTS = 100;

const idSchema = z.string().min(1).max(100);

export const contactViewSchema = z.strictObject({
  id: idSchema,
  phone: z.string(),
  walletId: idSchema,
  createdAt: z.iso.datetime(),
});
export const lookupQuerySchema = z.strictObject({ phone: phoneSchema });
export const lookupResponseSchema = z.strictObject({
  phone: z.string(),
  walletId: idSchema,
});
// Strict: a supplied owner field is rejected, the owner comes from the session.
export const addContactInputSchema = z.strictObject({ walletId: idSchema });
export const addContactResponseSchema = z.strictObject({
  contact: contactViewSchema,
});
export const listContactsResponseSchema = z.strictObject({
  contacts: z.array(contactViewSchema),
});

export type ContactView = z.infer<typeof contactViewSchema>;
