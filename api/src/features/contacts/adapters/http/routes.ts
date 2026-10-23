import {
  emptyInputSchema,
  errorResponseSchema,
  type ErrorResponse,
} from "@wallet/contracts";
import {
  addContactInputSchema,
  addContactResponseSchema,
  listContactsResponseSchema,
  lookupQuerySchema,
  lookupResponseSchema,
} from "@wallet/contracts/contacts";
import type { FastifyPluginCallback, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { AddContactResult } from "../../application/add-contact.js";
import type { Contact } from "../../application/ports.js";
import {
  ContactLimitReached,
  RecipientNotFound,
  SelfContact,
} from "../../domain/contact-errors.js";

export type ContactOwner = { userId: string; active: boolean };

export type ContactRoutesDeps = {
  authenticate: (token: string) => ContactOwner | null;
  lookup: (ownerUserId: string, phone: string) => { phone: string; walletId: string };
  add: (ownerUserId: string, walletId: string) => AddContactResult;
  list: (ownerUserId: string) => Contact[];
  // Returns null when allowed, or the Retry-After in seconds.
  throttle: { consume: (keys: readonly string[]) => number | null };
};

type Access =
  | { ok: true; ownerUserId: string }
  | { ok: false; status: 401 | 403; body: ErrorResponse };

const safeError = (code: string, message: string): ErrorResponse => ({
  error: { code, message },
});

// The scheme is the literal "Bearer", one space, then a base64url token.
const bearerPattern = /^Bearer ([A-Za-z0-9_-]+)$/;

const NOT_FOUND = safeError(
  "RECIPIENT_NOT_FOUND",
  "No encontramos un destinatario activo con ese número.",
);
const SELF = safeError(
  "SELF_CONTACT",
  "No puedes agregarte a ti mismo como contacto.",
);
const LIMIT = safeError(
  "CONTACT_LIMIT_REACHED",
  "Alcanzaste el máximo de contactos.",
);

export const contactRoutes: FastifyPluginCallback<ContactRoutesDeps> = (
  app,
  deps,
  done,
) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // The owner comes only from the session, never from the request.
  const authorize = (request: FastifyRequest): Access => {
    const match = bearerPattern.exec(request.headers.authorization ?? "");
    const owner = match?.[1] ? deps.authenticate(match[1]) : null;
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

  typed.get(
    "/api/v1/contacts/lookup",
    {
      schema: {
        querystring: lookupQuerySchema,
        response: {
          200: lookupResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const access = authorize(request);
      if (!access.ok) {
        reply.code(access.status);
        return access.body;
      }
      const retryAfter = deps.throttle.consume([
        `contact-lookup-ip:${request.ip}`,
        `contact-lookup-user:${access.ownerUserId}`,
      ]);
      if (retryAfter !== null) {
        reply.header("Retry-After", String(retryAfter));
        reply.code(429);
        return safeError(
          "RATE_LIMITED",
          "Demasiadas búsquedas. Intenta más tarde.",
        );
      }
      try {
        return deps.lookup(access.ownerUserId, request.query.phone);
      } catch (error) {
        if (error instanceof RecipientNotFound) {
          reply.code(404);
          return NOT_FOUND;
        }
        if (error instanceof SelfContact) {
          reply.code(409);
          return SELF;
        }
        throw error;
      }
    },
  );

  typed.post(
    "/api/v1/contacts",
    {
      schema: {
        body: addContactInputSchema,
        response: {
          200: addContactResponseSchema,
          201: addContactResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const access = authorize(request);
      if (!access.ok) {
        reply.code(access.status);
        return access.body;
      }
      try {
        const { contact, created } = deps.add(
          access.ownerUserId,
          request.body.walletId,
        );
        reply.code(created ? 201 : 200);
        return { contact };
      } catch (error) {
        if (error instanceof RecipientNotFound) {
          reply.code(404);
          return NOT_FOUND;
        }
        if (error instanceof SelfContact) {
          reply.code(409);
          return SELF;
        }
        if (error instanceof ContactLimitReached) {
          reply.code(409);
          return LIMIT;
        }
        throw error;
      }
    },
  );

  typed.get(
    "/api/v1/contacts",
    {
      schema: {
        querystring: emptyInputSchema,
        response: {
          200: listContactsResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const access = authorize(request);
      if (!access.ok) {
        reply.code(access.status);
        return access.body;
      }
      return { contacts: deps.list(access.ownerUserId) };
    },
  );

  done();
};
