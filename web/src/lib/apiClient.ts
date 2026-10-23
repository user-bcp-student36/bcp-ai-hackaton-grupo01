import { errorResponseSchema } from "@wallet/contracts";
import { z } from "zod";

export const DEFAULT_ERROR_MESSAGE = "No se pudo completar la solicitud.";

// Only the error object is read: some failures (e.g. 500 registration) add
// sibling keys such as walletId, which the strict top-level schema rejects.
const errorBodySchema = z.object({ error: errorResponseSchema.shape.error });

export type ApiErrorDetail = { readonly field: string; readonly code: string };

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: readonly ApiErrorDetail[];

  constructor(
    code: string,
    message: string,
    status: number,
    details: readonly ApiErrorDetail[] = [],
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const defaultBaseUrl = (): string =>
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";

function toApiError(status: number, body: unknown): ApiError {
  const parsed = errorBodySchema.safeParse(body);
  if (!parsed.success) {
    return new ApiError("HTTP_ERROR", DEFAULT_ERROR_MESSAGE, status);
  }
  const { code, message, details } = parsed.data.error;
  return new ApiError(code, message, status, details);
}

async function send<T>(
  path: string,
  init: RequestInit,
  schema: z.ZodType<T>,
  baseUrl: string,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, init);
  let body: unknown;
  try {
    body = (await response.json()) as unknown;
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    throw toApiError(response.status, body);
  }

  return schema.parse(body);
}

export function getJson<T>(
  path: string,
  schema: z.ZodType<T>,
  baseUrl: string = defaultBaseUrl(),
): Promise<T> {
  return send(
    path,
    { headers: { Accept: "application/json" } },
    schema,
    baseUrl,
  );
}

export function postJson<T>(
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
  baseUrl: string = defaultBaseUrl(),
): Promise<T> {
  return send(
    path,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    schema,
    baseUrl,
  );
}

export function getJsonAuthorized<T>(
  path: string,
  schema: z.ZodType<T>,
  token: string,
  baseUrl: string = defaultBaseUrl(),
): Promise<T> {
  return send(
    path,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    },
    schema,
    baseUrl,
  );
}

export async function deleteAuthorized(
  path: string,
  token: string,
  baseUrl: string = defaultBaseUrl(),
): Promise<void> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined);
    throw toApiError(response.status, body);
  }
}
