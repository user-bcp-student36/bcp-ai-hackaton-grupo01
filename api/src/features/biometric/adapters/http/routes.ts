import type { FastifyPluginCallback } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { errorResponseSchema, type ErrorResponse } from "@wallet/contracts";
import {
  biometricProfileParamsSchema,
  biometricProfileResponseSchema,
  biometricSessionInputSchema,
  biometricSessionResponseSchema,
} from "@wallet/contracts/biometric";
import type { LoginThrottle } from "../../../auth/application/login-throttle.js";
import type { LoginResult } from "../../../auth/application/login-user.js";
import { InvalidCredentials } from "../../../auth/domain/session.js";
import { UserAlreadyExists } from "../../../onboarding/domain/identity.js";
import {
  PasswordRequired,
  type BiometricProfile,
} from "../../application/biometric-access.js";
import { BiometricNotEnabled } from "../../domain/demo-profiles.js";

export type BiometricRoutesDeps = {
  profile: (documentNumber: string) => BiometricProfile;
  enter: (input: {
    documentNumber: string;
    password?: string;
  }) => Promise<LoginResult & { created: boolean }>;
  throttle: LoginThrottle;
};

const safeError = (code: string, message: string): ErrorResponse => ({
  error: { code, message },
});
const NOT_ENABLED = "Este documento no tiene acceso biométrico habilitado.";

export const biometricRoutes: FastifyPluginCallback<BiometricRoutesDeps> = (
  app,
  deps,
  done,
) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    "/api/v1/biometric/profiles/:documentNumber",
    {
      schema: {
        params: biometricProfileParamsSchema,
        response: {
          200: biometricProfileResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
    },
    (request, reply) => {
      const retryAfter = deps.throttle.consume([`biometric-ip:${request.ip}`]);
      if (retryAfter !== null) {
        reply.header("Retry-After", String(retryAfter));
        reply.code(429);
        return safeError("RATE_LIMITED", "Demasiados intentos. Intenta más tarde.");
      }
      try {
        return deps.profile(request.params.documentNumber);
      } catch (error) {
        if (error instanceof BiometricNotEnabled) {
          reply.code(404);
          return safeError("BIOMETRIC_NOT_ENABLED", NOT_ENABLED);
        }
        throw error;
      }
    },
  );

  typed.post(
    "/api/v1/biometric/sessions",
    {
      schema: {
        body: biometricSessionInputSchema,
        response: {
          201: biometricSessionResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { documentNumber, password } = request.body;
      const retryAfter = deps.throttle.consume([
        `biometric-ip:${request.ip}`,
        `biometric-doc:${documentNumber}`,
      ]);
      if (retryAfter !== null) {
        reply.header("Retry-After", String(retryAfter));
        reply.code(429);
        return safeError("RATE_LIMITED", "Demasiados intentos. Intenta más tarde.");
      }
      try {
        const session = await deps.enter({ documentNumber, password });
        reply.code(201);
        return session;
      } catch (error) {
        if (error instanceof BiometricNotEnabled) {
          reply.code(404);
          return safeError("BIOMETRIC_NOT_ENABLED", NOT_ENABLED);
        }
        if (error instanceof PasswordRequired) {
          reply.code(400);
          return safeError("VALIDATION_ERROR", error.message);
        }
        if (error instanceof InvalidCredentials) {
          reply.code(401);
          return safeError("INVALID_CREDENTIALS", error.message);
        }
        if (error instanceof UserAlreadyExists) {
          reply.code(409);
          return safeError("USER_ALREADY_EXISTS", error.message);
        }
        throw error;
      }
    },
  );
  done();
};
