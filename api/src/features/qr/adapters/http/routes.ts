import {
  errorResponseSchema,
  type ErrorResponse,
} from "@wallet/contracts";
import {
  createQrInputSchema,
  createQrResponseSchema,
  resolveQrInputSchema,
  resolveQrResponseSchema,
  type CreateQrResponse,
  type ResolveQrResponse,
} from "@wallet/contracts/qr";
import type { FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { InvalidQrAmount, QrExpired, QrNotFound, SelfQr } from "../../domain/qr-errors.js";

export type QrOwner = { userId: string; active: boolean };

export type QrRoutesDeps = {
  authenticate: (token: string) => QrOwner | null;
  create: (ownerUserId: string, amountCents: number | null) => CreateQrResponse["qr"];
  resolve: (viewerUserId: string, payload: string) => ResolveQrResponse["qr"];
  // Returns null when allowed, or the Retry-After in seconds.
  throttle: { consume: (keys: readonly string[]) => number | null };
};

type Access =
  | { ok: true; ownerUserId: string }
  | { ok: false; status: 401 | 403; body: ErrorResponse };

const safeError = (code: string, message: string): ErrorResponse => ({
  error: { code, message },
});

const bearerPattern = /^Bearer ([A-Za-z0-9_-]+)$/;

const errorStatuses = [
  { type: QrNotFound, status: 404 },
  { type: QrExpired, status: 410 },
  { type: SelfQr, status: 409 },
  { type: InvalidQrAmount, status: 400 },
] as const;

function failure(reply: FastifyReply, error: unknown): ErrorResponse {
  const match = errorStatuses.find(({ type }) => error instanceof type);
  if (!match || !(error instanceof Error && "code" in error)) throw error;
  reply.code(match.status);
  return safeError(String(error.code), error.message);
}

export const qrRoutes: FastifyPluginCallback<QrRoutesDeps> = (app, deps, done) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  const authorize = (request: FastifyRequest): Access => {
    const token = bearerPattern.exec(request.headers.authorization ?? "")?.[1];
    const owner = token ? deps.authenticate(token) : null;
    if (!owner) {
      return {
        ok: false,
        status: 401,
        body: safeError("UNAUTHENTICATED", "Sesión no válida."),
      };
    }
    if (!owner.active) {
      return {
        ok: false,
        status: 403,
        body: safeError("ACCOUNT_INACTIVE", "Cuenta inactiva."),
      };
    }
    return { ok: true, ownerUserId: owner.userId };
  };

  const throttled = (reply: FastifyReply, userId: string): ErrorResponse | null => {
    const retryAfter = deps.throttle.consume([`qr-user:${userId}`]);
    if (retryAfter === null) return null;
    reply.header("Retry-After", String(retryAfter));
    reply.code(429);
    return safeError("RATE_LIMITED", "Demasiados intentos. Intenta más tarde.");
  };

  const errors = {
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
    404: errorResponseSchema,
    409: errorResponseSchema,
    410: errorResponseSchema,
    429: errorResponseSchema,
  };

  typed.post(
    "/api/v1/qrs",
    {
      schema: {
        body: createQrInputSchema,
        response: { 201: createQrResponseSchema, ...errors },
      },
    },
    (request, reply) => {
      const access = authorize(request);
      if (!access.ok) {
        reply.code(access.status);
        return access.body;
      }
      const limited = throttled(reply, access.ownerUserId);
      if (limited) return limited;
      try {
        const qr = deps.create(access.ownerUserId, request.body.amountCents ?? null);
        reply.code(201);
        return { qr };
      } catch (error) {
        return failure(reply, error);
      }
    },
  );

  typed.post(
    "/api/v1/qrs/resolve",
    {
      schema: {
        body: resolveQrInputSchema,
        response: { 200: resolveQrResponseSchema, ...errors },
      },
    },
    (request, reply) => {
      const access = authorize(request);
      if (!access.ok) {
        reply.code(access.status);
        return access.body;
      }
      const limited = throttled(reply, access.ownerUserId);
      if (limited) return limited;
      try {
        return { qr: deps.resolve(access.ownerUserId, request.body.payload) };
      } catch (error) {
        return failure(reply, error);
      }
    },
  );
  done();
};
