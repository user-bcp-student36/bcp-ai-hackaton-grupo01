import {
  accountResponseSchema,
  sessionResponseSchema,
  type LoginInput,
} from "@wallet/contracts/auth";
import {
  deleteAuthorized,
  getJsonAuthorized,
  postJson,
} from "../../lib/apiClient";

export function loginAccount(input: LoginInput) {
  return postJson("/sessions", input, sessionResponseSchema);
}

export function fetchAccount(token: string) {
  return getJsonAuthorized("/me", accountResponseSchema, token);
}

export function endSession(token: string) {
  return deleteAuthorized("/sessions/current", token);
}
