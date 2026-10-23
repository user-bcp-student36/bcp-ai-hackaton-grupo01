import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { afterEach, expect, test } from "vitest";
import type { PaymentQuery } from "../../application/ports.js";
import {
  getPaymentReceipt,
  listPaymentHistory,
} from "../../application/payment-history.js";
import type { PaymentView } from "../../domain/payment-view.js";
import { receiptHistoryRoutes, type Participant } from "./routes.js";

type ErrorBody = { error: { code: string; message: string } };
type HistoryBody = { payments: PaymentView[] };
type ReceiptBody = { receipt: PaymentView };

const payments: PaymentView[] = [
  payment("pay-a", "w1", "w2", "2026-10-23T10:00:00.000Z"),
  payment("pay-b", "w3", "w1", "2026-10-23T11:00:00.000Z"),
  payment("pay-c", "w2", "w1", "2026-10-23T11:00:00.000Z"),
  payment("pay-x", "w2", "w3", "2026-10-23T12:00:00.000Z"),
];

// Tokens are keyed by name; the test app maps "token-<name>" to a participant.
const participants: Record<string, Participant> = {
  "token-w1": { walletId: "w1", active: true },
  "token-w2": { walletId: "w2", active: true },
  "token-w3": { walletId: "w3", active: true },
  "token-empty": { walletId: "w9", active: true },
  "token-no-wallet": { walletId: null, active: true },
  "token-inactive": { walletId: "w1", active: false },
};

const apps: FastifyInstance[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

async function start(): Promise<FastifyInstance> {
  const query = fakePayments(payments);
  const app = Fastify({ logger: false }).withTypeProvider();
  apps.push(app);
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler((error, _request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.code(400).send({
        error: { code: "VALIDATION_ERROR", message: "Revisa los datos enviados." },
      });
    }
    throw error;
  });
  await app.register(receiptHistoryRoutes, {
    authenticate: (token) => participants[`token-${token}`] ?? null,
    history: listPaymentHistory(query),
    receipt: getPaymentReceipt(query),
  });
  await app.ready();
  return app;
}

function bearer(name: string): Record<string, string> {
  return { authorization: `Bearer ${name}` };
}

test("history lists incoming and outgoing payments newest first, ties by id descending", async () => {
  const app = await start();

  const response = await app.inject({
    method: "GET",
    url: "/api/v1/payments",
    headers: bearer("w1"),
  });

  expect(response.statusCode).toBe(200);
  const body = JSON.parse(response.body) as HistoryBody;
  expect(body.payments.map((p) => p.id)).toEqual(["pay-c", "pay-b", "pay-a"]);
});

test("empty history returns an empty array", async () => {
  const app = await start();

  const response = await app.inject({
    method: "GET",
    url: "/api/v1/payments",
    headers: bearer("empty"),
  });

  expect(JSON.parse(response.body) as HistoryBody).toEqual({ payments: [] });
});

test("a user without a wallet has an empty history and no receipt", async () => {
  const app = await start();

  const history = await app.inject({
    method: "GET",
    url: "/api/v1/payments",
    headers: bearer("no-wallet"),
  });
  const receipt = await app.inject({
    method: "GET",
    url: "/api/v1/payments/pay-a/receipt",
    headers: bearer("no-wallet"),
  });

  expect(JSON.parse(history.body) as HistoryBody).toEqual({ payments: [] });
  expect(receipt.statusCode).toBe(404);
});

test("sender and recipient receive the same receipt", async () => {
  const app = await start();

  const sender = await app.inject({
    method: "GET",
    url: "/api/v1/payments/pay-a/receipt",
    headers: bearer("w1"),
  });
  const recipient = await app.inject({
    method: "GET",
    url: "/api/v1/payments/pay-a/receipt",
    headers: bearer("w2"),
  });

  expect(sender.statusCode).toBe(200);
  expect((JSON.parse(sender.body) as ReceiptBody).receipt).toEqual(payments[0]);
  expect(JSON.parse(recipient.body) as ReceiptBody).toEqual(
    JSON.parse(sender.body) as ReceiptBody,
  );
});

test("unrelated and missing receipts return the same 404", async () => {
  const app = await start();

  const unrelated = await app.inject({
    method: "GET",
    url: "/api/v1/payments/pay-a/receipt",
    headers: bearer("w3"),
  });
  const missing = await app.inject({
    method: "GET",
    url: "/api/v1/payments/pay-missing/receipt",
    headers: bearer("w1"),
  });

  expect(unrelated.statusCode).toBe(404);
  expect(JSON.parse(unrelated.body) as ErrorBody).toEqual(
    JSON.parse(missing.body) as ErrorBody,
  );
  expect((JSON.parse(unrelated.body) as ErrorBody).error.code).toBe(
    "PAYMENT_NOT_FOUND",
  );
});

test("invalid payment id is rejected with 400", async () => {
  const app = await start();

  const response = await app.inject({
    method: "GET",
    url: "/api/v1/payments/bad%20id/receipt",
    headers: bearer("w1"),
  });

  expect(response.statusCode).toBe(400);
  expect((JSON.parse(response.body) as ErrorBody).error.code).toBe(
    "VALIDATION_ERROR",
  );
});

test("unknown query properties on history are rejected with 400", async () => {
  const app = await start();

  const response = await app.inject({
    method: "GET",
    url: "/api/v1/payments?walletId=w2",
    headers: bearer("w1"),
  });

  expect(response.statusCode).toBe(400);
});

test("missing or unknown bearer returns 401 on both routes", async () => {
  const app = await start();

  for (const url of ["/api/v1/payments", "/api/v1/payments/pay-a/receipt"]) {
    const missing = await app.inject({ method: "GET", url });
    const unknown = await app.inject({ method: "GET", url, headers: bearer("nobody") });
    expect(missing.statusCode).toBe(401);
    expect((JSON.parse(unknown.body) as ErrorBody).error.code).toBe(
      "UNAUTHENTICATED",
    );
  }
});

test("inactive account returns 403 on both routes", async () => {
  const app = await start();

  for (const url of ["/api/v1/payments", "/api/v1/payments/pay-a/receipt"]) {
    const response = await app.inject({ method: "GET", url, headers: bearer("inactive") });
    expect(response.statusCode).toBe(403);
    expect((JSON.parse(response.body) as ErrorBody).error.code).toBe(
      "ACCOUNT_INACTIVE",
    );
  }
});

function payment(id: string, source: string, destination: string, createdAt: string): PaymentView {
  return {
    id,
    sourceWalletId: source,
    destinationWalletId: destination,
    recipientType: "contact",
    amountCents: 1000,
    currency: "PEN",
    status: "SUCCEEDED",
    createdAt,
    counterpartyName: "Contacto ***123",
  };
}

function fakePayments(rows: PaymentView[]): PaymentQuery {
  const involves = (p: PaymentView, walletId: string) =>
    p.sourceWalletId === walletId || p.destinationWalletId === walletId;
  return {
    listForWallet: (walletId) => rows.filter((p) => involves(p, walletId)),
    findForWallet: (paymentId, walletId) =>
      rows.find((p) => p.id === paymentId && involves(p, walletId)) ?? null,
  };
}
