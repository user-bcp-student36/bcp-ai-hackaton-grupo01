import { z } from "zod";
import { passwordSchema } from "./onboarding.js";
import { sessionResponseSchema } from "./auth.js";

export const FACE_IMAGE_PREFIX = "data:image/jpeg;base64,";
// A 320x240 JPEG frame is roughly 20 KB; the cap keeps the body well under Fastify's limit.
export const FACE_IMAGE_MAX_LENGTH = 400_000;

const dniSchema = z.string().trim().regex(/^[0-9]{8}$/);

export const biometricProfileParamsSchema = z.strictObject({
  documentNumber: dniSchema,
});
export const biometricProfileResponseSchema = z.strictObject({
  documentNumber: z.string(),
  fullName: z.string(),
  phone: z.string(),
  email: z.string(),
  hasAccount: z.boolean(),
});

export const biometricSessionInputSchema = z.strictObject({
  documentNumber: dniSchema,
  password: passwordSchema.optional(),
  faceImage: z
    .string()
    .startsWith(FACE_IMAGE_PREFIX)
    .min(FACE_IMAGE_PREFIX.length + 100)
    .max(FACE_IMAGE_MAX_LENGTH),
});
export const biometricSessionResponseSchema = sessionResponseSchema.extend({
  created: z.boolean(),
});

export type BiometricProfileResponse = z.infer<
  typeof biometricProfileResponseSchema
>;
export type BiometricSessionInput = z.infer<typeof biometricSessionInputSchema>;
export type BiometricSessionResponse = z.infer<
  typeof biometricSessionResponseSchema
>;
