import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  biometricProfileResponseSchema,
  biometricSessionResponseSchema,
  FACE_IMAGE_PREFIX,
} from "@wallet/contracts/biometric";
import { buildApp } from "../../../../app.js";
import { loadConfig } from "../../../../shared/config.js";
import { migrationsDirectory, openDatabase } from "../../../../shared/database.js";

const DEMO_DNI = "72193412";
const PASSWORD = "246810";
const FACE_IMAGE = `${FACE_IMAGE_PREFIX}${"A".repeat(200)}`;

let directory: string;
let app: FastifyInstance;

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "biometric-routes-"));
  const databasePath = join(directory, "wallet.sqlite");
  app = await buildApp({
    config: loadConfig({
      NODE_ENV: "test",
      DATABASE_PATH: databasePath,
      DEMO_KYC_RESULT: "activa",
      AUTH_RATE_LIMIT_MAX: "100",
    }),
    database: openDatabase(databasePath, migrationsDirectory),
    logger: false,
  });
});

afterEach(async () => {
  await app.close();
  rmSync(directory, { recursive: true });
});

const enter = (payload: Record<string, unknown>) =>
  app.inject({ method: "POST", url: "/api/v1/biometric/sessions", payload });

test("a seeded document gets its preloaded profile", async () => {
  const response = await app.inject({
    method: "GET",
    url: `/api/v1/biometric/profiles/${DEMO_DNI}`,
  });

  expect(response.statusCode).toBe(200);
  expect(biometricProfileResponseSchema.parse(response.json())).toMatchObject({
    documentNumber: DEMO_DNI,
    hasAccount: false,
  });
});

test("the first biometric entry creates the account with the preloaded data", async () => {
  const response = await enter({
    documentNumber: DEMO_DNI,
    password: PASSWORD,
    faceImage: FACE_IMAGE,
  });

  expect(response.statusCode).toBe(201);
  const body = biometricSessionResponseSchema.parse(response.json());
  expect(body.created).toBe(true);
  expect(body.user.documentNumber).toBe(DEMO_DNI);
  expect(body.user.phone).toBe("+51987000001");
  expect(body.user.walletId).not.toBeNull();
});

test("a later biometric entry logs in with the same password", async () => {
  await enter({ documentNumber: DEMO_DNI, password: PASSWORD, faceImage: FACE_IMAGE });

  const response = await enter({
    documentNumber: DEMO_DNI,
    password: PASSWORD,
    faceImage: FACE_IMAGE,
  });

  expect(response.statusCode).toBe(201);
  expect(biometricSessionResponseSchema.parse(response.json()).created).toBe(false);
});

test("a wrong password is rejected for an existing biometric account", async () => {
  await enter({ documentNumber: DEMO_DNI, password: PASSWORD, faceImage: FACE_IMAGE });

  const response = await enter({
    documentNumber: DEMO_DNI,
    password: "000000",
    faceImage: FACE_IMAGE,
  });

  expect(response.statusCode).toBe(401);
});

test("a document outside the seeded list is not enabled", async () => {
  const response = await enter({
    documentNumber: "11111111",
    password: PASSWORD,
    faceImage: FACE_IMAGE,
  });

  expect(response.statusCode).toBe(404);
  expect(response.json()).toMatchObject({ error: { code: "BIOMETRIC_NOT_ENABLED" } });
});

test("a missing or malformed face image is a validation error", async () => {
  const response = await enter({
    documentNumber: DEMO_DNI,
    password: PASSWORD,
    faceImage: "not-an-image",
  });

  expect(response.statusCode).toBe(400);
});
