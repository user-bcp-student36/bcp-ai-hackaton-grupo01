import { errorResponseSchema, type ErrorResponse } from "@wallet/contracts";
import {
  registrationInputSchema,
  registrationResponseSchema,
  verificationInputSchema,
  verificationResponseSchema,
} from "@wallet/contracts/onboarding";
import type {
  FastifyPluginCallback,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type {
  KycVerifier,
  PasswordHasher,
  UserRepository,
} from "../../application/ports.js";
import { UserAlreadyExists, type User } from "../../domain/identity.js";
import { registerUser } from "../../application/register-user.js";
import { createIpThrottle, type IpThrottle } from "./ip-throttle.js";

export type OnboardingRoutesOptions = {
  users: UserRepository;
  passwords: PasswordHasher;
  kyc: KycVerifier;
  now: () => string;
  newId: () => string;
  openingBalanceCents: number;
  rateLimit: { max: number; windowMs: number };
};

const safeError = (code: string, message: string): ErrorResponse => ({
  error: { code, message },
});
const registrationFailureSchema = errorResponseSchema.extend({
  walletId: z.null(),
});

export const onboardingRoutes: FastifyPluginCallback<
  OnboardingRoutesOptions
> = (app, options, done) => {
  const server = app.withTypeProvider<ZodTypeProvider>();
  const throttle: IpThrottle = createIpThrottle({
    max: options.rateLimit.max,
    windowMs: options.rateLimit.windowMs,
    now: Date.now,
  });
  const register = registerUser(options);
  const rejectIfThrottled = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    if (throttle(request.ip)) return;
    return reply
      .code(429)
      .send(safeError("RATE_LIMITED", "Demasiadas solicitudes."));
  };

  server.post(
    "/api/v1/kyc/verification",
    {
      onRequest: rejectIfThrottled,
      schema: {
        body: verificationInputSchema,
        response: {
          200: verificationResponseSchema,
          400: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
    },
    (request) => options.kyc.verify(request.body),
  );

  server.post(
    "/api/v1/users",
    {
      onRequest: rejectIfThrottled,
      schema: {
        body: registrationInputSchema,
        response: {
          201: registrationResponseSchema,
          400: errorResponseSchema,
          409: errorResponseSchema,
          429: errorResponseSchema,
          500: registrationFailureSchema,
        },
      },
    },
    async (request, reply) => {
      let user: User;
      try {
        user = await register(request.body);
      } catch (error) {
        if (error instanceof UserAlreadyExists) {
          return reply
            .code(409)
            .send(safeError("USER_ALREADY_EXISTS", "La cuenta ya existe."));
        }
        request.log.error(
          { code: "REGISTRATION_FAILED" },
          "Registro no completado",
        );
        return reply.code(500).send({
          ...safeError("INTERNAL_ERROR", "Error interno."),
          walletId: null,
        });
      }
      return reply.code(201).send({ user });
    },
  );
  done();
};
