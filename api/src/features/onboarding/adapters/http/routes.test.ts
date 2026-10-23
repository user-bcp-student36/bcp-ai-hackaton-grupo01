import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { errorResponseSchema } from "@wallet/contracts";
import {
  registrationResponseSchema,
  verificationResponseSchema,
} from "@wallet/contracts/onboarding";
import { buildApp } from "../../../../app.js";
import { loadConfig, type Config } from "../../../../shared/config.js";
import {
  migrationsDirectory,
  openDatabase,
} from "../../../../shared/database.js";

let directory: string;
const apps: FastifyInstance[] = [];
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "onboarding-routes-"));
});
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  rmSync(directory, { recursive: true });
});

const config = (overrides: Record<string, string> = {}): Config =>
  loadConfig({
    NODE_ENV: "test",
    DATABASE_PATH: join(directory, `demo-${String(apps.length)}.sqlite`),
    AUTH_RATE_LIMIT_MAX: "100",
    ...overrides,
  });
async function appWith(overrides: Record<string, string> = {}) {
  const app = await buildApp({ config: config(overrides), logger: false });
  apps.push(app);
  return app;
}
const registration = {
  documentType: "DNI",
  documentNumber: "12345678",
  phone: "912345678",
  email: "demo@example.test",
  password: "012345",
};

test.each(["activa", "pendiente", "rechazada"] as const)(
  "KYC verification returns the configured %s outcome",
  async (status) => {
    const app = await appWith({ DEMO_KYC_RESULT: status });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/kyc/verification",
      payload: { documentType: "CE", documentNumber: "abc123456" },
    });
    expect(response.statusCode).toBe(200);
    expect(verificationResponseSchema.parse(response.json())).toEqual({
      kycStatus: status,
      simulated: true,
    });
  },
);

test("KYC verification rejects a client-selected approval", async () => {
  const app = await appWith();
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/kyc/verification",
    payload: {
      documentType: "DNI",
      documentNumber: "12345678",
      kycStatus: "activa",
    },
  });
  expect(response.statusCode).toBe(400);
  expect(errorResponseSchema.parse(response.json()).error.code).toBe(
    "VALIDATION_ERROR",
  );
});

test("KYC verification rejects a malformed document", async () => {
  const app = await appWith();
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/kyc/verification",
    payload: { documentType: "DNI", documentNumber: "1234" },
  });
  expect(response.statusCode).toBe(400);
});

test("Registration creates an active user with a wallet for activa KYC", async () => {
  const app = await appWith({ DEMO_KYC_RESULT: "activa" });
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/users",
    payload: registration,
  });
  expect(response.statusCode).toBe(201);
  const { user } = registrationResponseSchema.parse(response.json());
  expect(user).toMatchObject({
    documentType: "DNI",
    documentNumber: "12345678",
    phone: "+51912345678",
    kycStatus: "activa",
    active: true,
  });
  expect(user.walletId).not.toBeNull();
  expect(response.body).not.toContain("012345");
  expect(response.body).not.toContain("scrypt");
});

test("Registration of a CE with leading-zero password keeps inactive status without wallet", async () => {
  const app = await appWith({ DEMO_KYC_RESULT: "pendiente" });
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/users",
    payload: {
      ...registration,
      documentType: "CE",
      documentNumber: "abc123456",
    },
  });
  expect(response.statusCode).toBe(201);
  expect(registrationResponseSchema.parse(response.json()).user).toMatchObject({
    documentType: "CE",
    documentNumber: "ABC123456",
    kycStatus: "pendiente",
    active: false,
    walletId: null,
  });
});

test("Registration with a client-supplied KYC or balance is rejected", async () => {
  const app = await appWith({ DEMO_KYC_RESULT: "rechazada" });
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/users",
    payload: { ...registration, kycStatus: "activa", balanceCents: 999_999 },
  });
  expect(response.statusCode).toBe(400);
  expect(errorResponseSchema.parse(response.json()).error.code).toBe(
    "VALIDATION_ERROR",
  );
});

test("Registration rejects a malformed password without creating a user", async () => {
  const app = await appWith();
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/users",
    payload: { ...registration, password: "12345" },
  });
  expect(response.statusCode).toBe(400);
  const again = await app.inject({
    method: "POST",
    url: "/api/v1/users",
    payload: registration,
  });
  expect(again.statusCode).toBe(201);
});

test("Duplicate registration returns a safe conflict", async () => {
  const app = await appWith();
  await app.inject({
    method: "POST",
    url: "/api/v1/users",
    payload: registration,
  });
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/users",
    payload: { ...registration, email: "other@example.test" },
  });
  expect(response.statusCode).toBe(409);
  expect(errorResponseSchema.parse(response.json()).error.code).toBe(
    "USER_ALREADY_EXISTS",
  );
});

test("Technical registration failure returns 500 with null walletId and no partial account", async () => {
  const database = openDatabase(
    join(directory, "fail.sqlite"),
    migrationsDirectory,
  );
  database.exec(`CREATE TRIGGER fail_affiliation BEFORE UPDATE OF wallet_id ON users
    BEGIN SELECT RAISE(ABORT, 'controlled failure'); END`);
  const app = await buildApp({
    config: config({ DEMO_KYC_RESULT: "activa" }),
    database,
    logger: false,
  });
  apps.push(app);
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/users",
    payload: registration,
  });
  expect(response.statusCode).toBe(500);
  expect(response.json()).toMatchObject({
    error: { code: "INTERNAL_ERROR" },
    walletId: null,
  });
  expect(response.body).not.toContain("controlled failure");
  expect(
    database.prepare("SELECT count(*) AS count FROM users").get()?.count,
  ).toBe(0);
});

test("Requests beyond the configured limit return RATE_LIMITED", async () => {
  const app = await appWith({ AUTH_RATE_LIMIT_MAX: "1" });
  const first = await app.inject({
    method: "POST",
    url: "/api/v1/kyc/verification",
    payload: { documentType: "DNI", documentNumber: "12345678" },
  });
  const second = await app.inject({
    method: "POST",
    url: "/api/v1/kyc/verification",
    payload: { documentType: "DNI", documentNumber: "12345678" },
  });
  expect(first.statusCode).toBe(200);
  expect(second.statusCode).toBe(429);
  expect(errorResponseSchema.parse(second.json()).error.code).toBe(
    "RATE_LIMITED",
  );
});

test("Registration logs never contain the password or the hash", async () => {
  const logs: string[] = [];
  const app = await buildApp({
    config: config({ DEMO_KYC_RESULT: "activa" }),
    logger: { stream: { write: (line: string) => logs.push(line) } },
  });
  apps.push(app);
  await app.inject({
    method: "POST",
    url: "/api/v1/users",
    payload: registration,
  });
  await app.inject({
    method: "POST",
    url: "/api/v1/users",
    payload: registration,
  });
  expect(logs.join("")).not.toContain("012345");
  expect(logs.join("")).not.toContain("scrypt$");
});
