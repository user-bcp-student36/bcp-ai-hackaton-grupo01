import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, test } from "vitest";
import { migrationsDirectory, openDatabase } from "../shared/database.js";
import { demoSeeds } from "../seeds.js";
import { SqliteUsers } from "../features/onboarding/adapters/persistence/sqlite-users.js";
import { ScryptPasswords } from "../features/onboarding/adapters/persistence/scrypt-passwords.js";
import { TEST_PASSWORD, TEST_USERS } from "./test-users.js";

let directory: string;
let database: DatabaseSync;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "seed-test-"));
  database = openDatabase(join(directory, "test.db"), migrationsDirectory);
  for (const seed of demoSeeds) seed(database);
});

afterEach(() => {
  database.close();
  rmSync(directory, { recursive: true, force: true });
});

test("seeded test users can be found by document with the shared password", async () => {
  const users = new SqliteUsers(database);
  const passwords = new ScryptPasswords();
  for (const seeded of TEST_USERS) {
    const found = users.findByDocument({
      documentType: "DNI",
      documentNumber: seeded.documentNumber,
    });
    expect(found?.user.kycStatus).toBe(seeded.kycStatus ?? "activa");
    expect(await passwords.verify(TEST_PASSWORD, found?.passwordHash ?? "")).toBe(true);
  }
});

test("seeding twice neither duplicates users nor resets contacts", () => {
  for (const seed of demoSeeds) seed(database);
  const count = (table: string) =>
    (database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  expect(count("users")).toBe(1 + 3 + TEST_USERS.length);
  expect(count("contacts")).toBe(8);
});

test("pending and rejected users have no wallet", () => {
  const rows = database
    .prepare("SELECT wallet_id FROM users WHERE kyc_status <> 'activa'")
    .all() as { wallet_id: string | null }[];
  expect(rows).toHaveLength(2);
  expect(rows.every((row) => row.wallet_id === null)).toBe(true);
});
