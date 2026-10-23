import {
  createQrResponseSchema,
  resolveQrResponseSchema,
  type CreateQrInput,
} from "@wallet/contracts/qr";
import { postJsonAuthorized } from "../../lib/apiClient";

export function createQr(input: CreateQrInput, token: string) {
  return postJsonAuthorized("/qrs", input, createQrResponseSchema, token);
}

export function resolveQr(payload: string, token: string) {
  return postJsonAuthorized(
    "/qrs/resolve",
    { payload },
    resolveQrResponseSchema,
    token,
  );
}
