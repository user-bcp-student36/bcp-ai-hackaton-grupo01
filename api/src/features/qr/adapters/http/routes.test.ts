import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { FACE_IMAGE_PREFIX } from "@wallet/contracts/biometric";
import { createQrResponseSchema, resolveQrResponseSchema } from "@wallet/contracts/qr";
import { buildApp } from "../../../../app.js";
import { loadConfig } from "../../../../shared/config.js";
import { migrationsDirectory, openDatabase } from "../../../../shared/database.js";

const FACE_IMAGE = `${FACE_IMAGE_PREFIX}${"A".repeat(200)}`;
const PASSWORD = "246810";
const PAYMENT_MAX_CENTS = 50_000;

let directory: string;
let app: FastifyInstance;
let database: ReturnType<typeof openDatabase>;

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "qr-routes-"));
  const databasePath = join(directory, "wallet.sqlite");
  database = openDatabase(databasePath, migrationsDirectory);
  app = await buildApp({
    config: loadConfig({
      NODE_ENV: "test",
      DATABASE_PATH: databasePath,
      DEMO_KYC_RESULT: "activa",
      AUTH_RATE_LIMIT_MAX: "100",
      PAYMENT_MAX_CENTS: String(PAYMENT_MAX_CENTS),
    }),
    database,
    logger: false,
  });
});

afterEach(async () => {
  await app.close();
  if (database.isOpen) database.close();
  rmSync(directory, { recursive: true });
});

async function signIn(documentNumber: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/biometric/sessions",
    payload: { documentNumber, password: PASSWORD, faceImage: FACE_IMAGE },
  });
  const body = response.json<{
    accessToken: string;
    user: { walletId: string };
  }>();
  return { token: body.accessToken, walletId: body.user.walletId };
}

const authorized = (token: string) => ({ authorization: `Bearer ${token}` });

async function createQr(token: string, payload: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: "/api/v1/qrs",
    headers: authorized(token),
    payload,
  });
}

const resolveQr = (token: string, payload: string) =>
  app.inject({
    method: "POST",
    url: "/api/v1/qrs/resolve",
    headers: authorized(token),
    payload: { payload },
  });

test("an open-amount QR has no amount and expires in five minutes", async () => {
  const { token } = await signIn("72193412");

  const response = await createQr(token);

  expect(response.statusCode).toBe(201);
  const { qr } = createQrResponseSchema.parse(response.json());
  expect(qr.amountCents).toBeNull();
  expect(qr.payload).toBe(`altoque-qr:${qr.id}`);
  const seconds = (Date.parse(qr.expiresAt) - Date.now()) / 1000;
  expect(seconds).toBeGreaterThan(290);
  expect(seconds).toBeLessThanOrEqual(300);
});

test("a fixed-amount QR carries that exact amount", async () => {
  const { token } = await signIn("72193412");

  const response = await createQr(token, { amountCents: 1500 });

  expect(createQrResponseSchema.parse(response.json()).qr.amountCents).toBe(1500);
});

test("a QR above the payment cap is rejected", async () => {
  const { token } = await signIn("72193412");

  const response = await createQr(token, { amountCents: PAYMENT_MAX_CENTS + 1 });

  expect(response.statusCode).toBe(400);
});

test("creating a QR without a session returns 401", async () => {
  const response = await app.inject({ method: "POST", url: "/api/v1/qrs", payload: {} });

  expect(response.statusCode).toBe(401);
});

test("another user resolves a QR to the receiver wallet", async () => {
  const receiver = await signIn("72193412");
  const payer = await signIn("45871236");
  const { qr } = createQrResponseSchema.parse(
    (await createQr(receiver.token, { amountCents: 2000 })).json(),
  );

  const response = await resolveQr(payer.token, qr.payload);

  expect(response.statusCode).toBe(200);
  expect(resolveQrResponseSchema.parse(response.json()).qr).toMatchObject({
    recipientWalletId: receiver.walletId,
    recipientPhone: "+51987000001",
    amountCents: 2000,
  });
});

test("resolving your own QR returns SELF_QR", async () => {
  const { token } = await signIn("72193412");
  const { qr } = createQrResponseSchema.parse((await createQr(token)).json());

  const response = await resolveQr(token, qr.payload);

  expect(response.statusCode).toBe(409);
  expect(response.json()).toMatchObject({ error: { code: "SELF_QR" } });
});

test("resolving an unknown QR returns QR_NOT_FOUND", async () => {
  const { token } = await signIn("72193412");

  const response = await resolveQr(token, "altoque-qr:missing");

  expect(response.statusCode).toBe(404);
  expect(response.json()).toMatchObject({ error: { code: "QR_NOT_FOUND" } });
});

test("resolving an expired QR returns QR_EXPIRED", async () => {
  const receiver = await signIn("72193412");
  const payer = await signIn("45871236");
  const { qr } = createQrResponseSchema.parse((await createQr(receiver.token)).json());
  database
    .prepare("UPDATE qr_codes SET expires_at = ? WHERE id = ?")
    .run("2020-01-01T00:00:00.000Z", qr.id);

  const response = await resolveQr(payer.token, qr.payload);

  expect(response.statusCode).toBe(410);
  expect(response.json()).toMatchObject({ error: { code: "QR_EXPIRED" } });
});

test("a payer saves the receiver and pays the QR wallet through the running app", async () => {
  const receiver = await signIn("72193412");
  const payer = await signIn("45871236");

  const contact = await app.inject({
    method: "POST",
    url: "/api/v1/contacts",
    headers: authorized(payer.token),
    payload: { walletId: receiver.walletId },
  });
  const payment = await app.inject({
    method: "POST",
    url: "/api/v1/payments",
    headers: { ...authorized(payer.token), "idempotency-key": "qr-payment-0001" },
    payload: {
      recipientType: "contact",
      recipientWalletId: receiver.walletId,
      amountCents: 2000,
      currency: "PEN",
    },
  });

  expect(contact.statusCode).toBe(201);
  expect(payment.statusCode).toBe(201);
  expect(payment.json()).toMatchObject({
    payment: { destinationWalletId: receiver.walletId, amountCents: 2000 },
  });
});
