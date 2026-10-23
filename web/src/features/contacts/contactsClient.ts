import { errorResponseSchema } from "@wallet/contracts";
import { z } from "zod";
import {
  ApiError,
  DEFAULT_ERROR_MESSAGE,
  REQUEST_TIMEOUT_MS,
} from "../../lib/apiClient";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";

const contactViewSchema = z.object({
  id: z.string(),
  phone: z.string(),
  displayName: z.string(),
  walletId: z.string(),
  createdAt: z.string(),
});

const recipientSchema = z.object({
  phone: z.string(),
  walletId: z.string(),
});

const addContactResponseSchema = z.object({ contact: contactViewSchema });

const listContactsResponseSchema = z.object({
  contacts: z.array(contactViewSchema),
});

export type ContactView = z.infer<typeof contactViewSchema>;
export type RecipientLookup = z.infer<typeof recipientSchema>;

export interface ContactsClient {
  lookupRecipient(phone: string): Promise<RecipientLookup>;
  addContact(walletId: string): Promise<ContactView>;
  listContacts(): Promise<ContactView[]>;
}

async function request(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<unknown> {
  const hasBody = init?.body !== undefined;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
    },
  });
  const body: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const parsed = errorResponseSchema.safeParse(body);
    throw new ApiError(
      parsed.success ? parsed.data.error.code : "HTTP_ERROR",
      parsed.success ? parsed.data.error.message : DEFAULT_ERROR_MESSAGE,
      response.status,
    );
  }
  return body;
}

export function createContactsClient(accessToken: string): ContactsClient {
  return {
    async lookupRecipient(phone) {
      const body = await request(
        `/contacts/lookup?phone=${encodeURIComponent(phone)}`,
        accessToken,
      );
      return recipientSchema.parse(body);
    },
    async addContact(walletId) {
      const body = await request("/contacts", accessToken, {
        method: "POST",
        body: JSON.stringify({ walletId }),
      });
      return addContactResponseSchema.parse(body).contact;
    },
    async listContacts() {
      const body = await request("/contacts", accessToken);
      return listContactsResponseSchema.parse(body).contacts;
    },
  };
}
