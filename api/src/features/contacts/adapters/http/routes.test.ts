import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { errorResponseSchema } from "@wallet/contracts";
import { sessionResponseSchema } from "@wallet/contracts/auth";
import {
  MAX_CONTACTS,
  addContactResponseSchema,
  listContactsResponseSchema,
  lookupResponseSchema,
} from "@wallet/contracts/contacts";
import { registrationInputSchema } from "@wallet/contracts/onboarding";
import { buildApp } from "../../../../app.js";
import { loadConfig } from "../../../../shared/config.js";
import { migrationsDirectory, openDatabase } from "../../../../shared/database.js";
import { runSeeds } from "../../../../shared/database.js";
import { seedContactRecipient, SEED_RECIPIENT } from "../../../../seeds/contacts.js";
import { ScryptPasswords } from "../../../onboarding/adapters/persistence/scrypt-passwords.js";
import { SqliteUsers } from "../../../onboarding/adapters/persistence/sqlite-users.js";
import { registerUser } from "../../../onboarding/application/register-user.js";

const PASSWORD = "012345";
const REGISTERED_AT = "2026-10-23T16:00:00.000Z";
const ANA = { document: "11111111", phone: "+51911111111" };
const BETO = { document: "22222222", phone: "+51922222222" };
const CARLA = { document: "33333333", phone: "+51933333333" };
const PENDING = { document: "44444444", phone: "+51944444444" };

let directory: string;
let database: ReturnType<typeof openDatabase>;
const apps: FastifyInstance[] = [];

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "contacts-routes-"));
  database = openDatabase(join(directory, "wallet.sqlite"), migrationsDirectory);
  let counter = 0;
  const register = registerUser({
    users: new SqliteUsers(database),
    passwords: new ScryptPasswords(),
    kyc: {
      verify: ({ documentNumber }) =>
        Promise.resolve({
          kycStatus: documentNumber === PENDING.document ? "pendiente" : "activa",
          simulated: true,
        }),
    },
    now: () => REGISTERED_AT,
    newId: () => `id-${String(++counter)}`,
    openingBalanceCents: 100_000,
  });
  for (const person of [ANA, BETO, CARLA, PENDING]) {
    await register(
      registrationInputSchema.parse({
        documentType: "DNI",
        documentNumber: person.document,
        phone: person.phone,
        email: `${person.document}@example.test`,
        password: PASSWORD,
      }),
    );
  }
});

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  if (database.isOpen) database.close();
  rmSync(directory, { recursive: true });
});

async function start(env: Record<string, string> = {}): Promise<FastifyInstance> {
  const app = await buildApp({
    config: loadConfig({
      NODE_ENV: "test",
      DATABASE_PATH: join(directory, "wallet.sqlite"),
      ...env,
    }),
    database,
    logger: false,
  });
  apps.push(app);
  return app;
}

async function tokenFor(app: FastifyInstance, documentNumber: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/sessions",
    payload: { documentType: "DNI", documentNumber, password: PASSWORD },
  });
  expect(response.statusCode).toBe(201);
  return sessionResponseSchema.parse(response.json()).accessToken;
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

function walletIdOf(phone: string): string {
  const row = database
    .prepare(
      "SELECT w.id FROM wallets w JOIN users u ON u.id = w.user_id WHERE u.phone = ?",
    )
    .get(phone) as { id: string } | undefined;
  if (!row) throw new Error("wallet not found");
  return row.id;
}

function lookup(app: FastifyInstance, token: string, phone: string) {
  return app.inject({
    method: "GET",
    url: `/api/v1/contacts/lookup?phone=${encodeURIComponent(phone)}`,
    headers: bearer(token),
  });
}

function add(app: FastifyInstance, token: string, payload: unknown) {
  return app.inject({
    method: "POST",
    url: "/api/v1/contacts",
    headers: bearer(token),
    payload: payload as Record<string, unknown>,
  });
}

function list(app: FastifyInstance, token: string) {
  return app.inject({ method: "GET", url: "/api/v1/contacts", headers: bearer(token) });
}

test("Lookup existing wallet by a normalized-equivalent phone returns only phone and wallet", async () => {
  const app = await start();
  const token = await tokenFor(app, ANA.document);

  const response = await lookup(app, token, "922222222");

  expect(response.statusCode).toBe(200);
  expect(lookupResponseSchema.parse(response.json())).toEqual({
    phone: BETO.phone,
    walletId: walletIdOf(BETO.phone),
  });
});

test("Lookup rejects a malformed phone with a validation error", async () => {
  const app = await start();
  const token = await tokenFor(app, ANA.document);

  const response = await lookup(app, token, "12345");

  expect(response.statusCode).toBe(400);
  expect(errorResponseSchema.parse(response.json()).error.code).toBe("VALIDATION_ERROR");
});

test("Lookup of a missing or inactive recipient returns the same not found", async () => {
  const app = await start();
  const token = await tokenFor(app, ANA.document);

  const missing = await lookup(app, token, "+51999999999");
  const inactive = await lookup(app, token, PENDING.phone);

  expect(missing.statusCode).toBe(404);
  expect(inactive.statusCode).toBe(404);
  expect(inactive.json()).toEqual(missing.json());
  expect(errorResponseSchema.parse(missing.json()).error.code).toBe("RECIPIENT_NOT_FOUND");
});

test("Lookup of yourself is a self contact conflict", async () => {
  const app = await start();
  const token = await tokenFor(app, ANA.document);

  const response = await lookup(app, token, ANA.phone);

  expect(response.statusCode).toBe(409);
  expect(errorResponseSchema.parse(response.json()).error.code).toBe("SELF_CONTACT");
});

test("Lookup is throttled after the configured number of searches", async () => {
  const app = await start({ AUTH_RATE_LIMIT_MAX: "2" });
  const token = await tokenFor(app, ANA.document);

  await lookup(app, token, BETO.phone);
  await lookup(app, token, BETO.phone);
  const throttled = await lookup(app, token, BETO.phone);

  expect(throttled.statusCode).toBe(429);
  expect(throttled.headers["retry-after"]).toBeDefined();
  expect(errorResponseSchema.parse(throttled.json()).error.code).toBe("RATE_LIMITED");
});

test("Add stores one association, and a repeat returns the same contact with 200", async () => {
  const app = await start();
  const token = await tokenFor(app, ANA.document);
  const walletId = walletIdOf(BETO.phone);

  const first = await add(app, token, { walletId });
  const second = await add(app, token, { walletId });

  expect(first.statusCode).toBe(201);
  expect(second.statusCode).toBe(200);
  const created = addContactResponseSchema.parse(first.json()).contact;
  expect(created).toMatchObject({ phone: BETO.phone, walletId });
  expect(addContactResponseSchema.parse(second.json()).contact).toEqual(created);
  const rows = database.prepare("SELECT COUNT(*) AS total FROM contacts").get();
  expect(rows).toEqual({ total: 1 });
});

test("Add rejects a forged owner field and stores nothing", async () => {
  const app = await start();
  const token = await tokenFor(app, ANA.document);

  const response = await add(app, token, {
    walletId: walletIdOf(BETO.phone),
    ownerUserId: "id-3",
  });

  expect(response.statusCode).toBe(400);
  expect(database.prepare("SELECT COUNT(*) AS total FROM contacts").get()).toEqual({ total: 0 });
});

test("Add refuses a missing or own wallet", async () => {
  const app = await start();
  const token = await tokenFor(app, ANA.document);

  const missing = await add(app, token, { walletId: "wallet-nobody" });
  const self = await add(app, token, { walletId: walletIdOf(ANA.phone) });

  expect(missing.statusCode).toBe(404);
  expect(self.statusCode).toBe(409);
  expect(errorResponseSchema.parse(self.json()).error.code).toBe("SELF_CONTACT");
});

test("Add beyond the capacity is refused while a duplicate still succeeds", async () => {
  const app = await start();
  const token = await tokenFor(app, ANA.document);
  const anaId = (database.prepare("SELECT id FROM users WHERE phone = ?").get(ANA.phone) as { id: string }).id;
  const insertUser = database.prepare(
    `INSERT INTO users (id, document_type, document_number, phone, email, password_hash,
       wallet_id, kyc_status, active, created_at, updated_at)
     VALUES (?, 'DNI', ?, ?, ?, 'x', NULL, 'activa', 1, ?, ?)`,
  );
  const insertContact = database.prepare(
    "INSERT INTO contacts (id, owner_user_id, contact_user_id, created_at) VALUES (?, ?, ?, ?)",
  );
  for (let index = 0; index < MAX_CONTACTS; index += 1) {
    const id = `filler-${String(index)}`;
    insertUser.run(id, `9${String(index).padStart(7, "0")}`, `+5180000${String(index).padStart(4, "0")}`, `${id}@example.test`, REGISTERED_AT, REGISTERED_AT);
    insertContact.run(`fc-${String(index)}`, anaId, id, REGISTERED_AT);
  }

  const refused = await add(app, token, { walletId: walletIdOf(BETO.phone) });

  expect(refused.statusCode).toBe(409);
  expect(errorResponseSchema.parse(refused.json()).error.code).toBe("CONTACT_LIMIT_REACHED");
});

test("Each user lists only their own contacts and an empty list is an array", async () => {
  const app = await start();
  const ana = await tokenFor(app, ANA.document);
  const beto = await tokenFor(app, BETO.document);
  await add(app, ana, { walletId: walletIdOf(CARLA.phone) });

  const own = listContactsResponseSchema.parse((await list(app, ana)).json());
  const other = await list(app, beto);

  expect(own.contacts).toHaveLength(1);
  expect(own.contacts[0]?.phone).toBe(CARLA.phone);
  expect(other.json()).toEqual({ contacts: [] });
});

test("The list is ordered by creation time then id", async () => {
  const app = await start();
  const token = await tokenFor(app, ANA.document);
  await add(app, token, { walletId: walletIdOf(CARLA.phone) });
  await add(app, token, { walletId: walletIdOf(BETO.phone) });
  database.prepare("UPDATE contacts SET created_at = '2026-10-23T10:00:00.000Z'").run();

  const body = listContactsResponseSchema.parse((await list(app, token)).json());

  const ids = body.contacts.map((contact) => contact.id);
  expect(ids).toEqual([...ids].sort());
});

test("Missing, malformed and unknown bearer tokens are rejected with 401", async () => {
  const app = await start();

  const missing = await app.inject({ method: "GET", url: "/api/v1/contacts" });
  const malformed = await app.inject({
    method: "GET",
    url: "/api/v1/contacts",
    headers: { authorization: "Token abc" },
  });
  const unknown = await list(app, "unknown-token");

  for (const response of [missing, malformed, unknown]) {
    expect(response.statusCode).toBe(401);
    expect(errorResponseSchema.parse(response.json()).error.code).toBe("UNAUTHENTICATED");
  }
});

test("A pending account gets 403 on every contacts route without directory data", async () => {
  const app = await start();
  const token = await tokenFor(app, PENDING.document);

  const responses = [
    await list(app, token),
    await lookup(app, token, BETO.phone),
    await add(app, token, { walletId: walletIdOf(BETO.phone) }),
  ];

  for (const response of responses) {
    expect(response.statusCode).toBe(403);
    expect(errorResponseSchema.parse(response.json()).error.code).toBe("ACCOUNT_INACTIVE");
    expect(response.body).not.toContain(BETO.phone);
  }
});

test("Contact responses never expose private identity fields", async () => {
  const app = await start();
  const token = await tokenFor(app, ANA.document);
  await add(app, token, { walletId: walletIdOf(BETO.phone) });

  const response = await list(app, token);

  const [contact] = listContactsResponseSchema.parse(response.json()).contacts;
  expect(Object.keys(contact ?? {}).sort()).toEqual(["createdAt", "id", "phone", "walletId"]);
  expect(response.body).not.toContain("@example.test");
});

test("The seeded recipient can be found, and reseeding never resets its funds", async () => {
  runSeeds(database, [seedContactRecipient]);
  database.prepare("UPDATE wallets SET balance_cents = 1234 WHERE id = ?").run(SEED_RECIPIENT.walletId);
  runSeeds(database, [seedContactRecipient]);
  const app = await start();
  const token = await tokenFor(app, ANA.document);

  const response = await lookup(app, token, SEED_RECIPIENT.phone);

  expect(response.statusCode).toBe(200);
  expect(
    database.prepare("SELECT balance_cents FROM wallets WHERE id = ?").get(SEED_RECIPIENT.walletId),
  ).toEqual({ balance_cents: 1234 });
  expect(database.prepare("SELECT COUNT(*) AS total FROM users WHERE id = ?").get(SEED_RECIPIENT.userId)).toEqual({ total: 1 });
});
