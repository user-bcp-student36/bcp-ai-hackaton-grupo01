import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, test } from "vitest";
import { migrationsDirectory, openDatabase } from "../../../../shared/database.js";
import { SqliteUsers } from "../../../onboarding/adapters/persistence/sqlite-users.js";
import type { ContactReader, PaymentLedger } from "../../application/ports.js";
import { transferPayment } from "../../application/transfer.js";
import {
  BalanceLimitExceeded,
  ContactRequired,
  IdempotencyConflict,
  InsufficientFunds,
  InvalidPaymentAmount,
  RecipientNotFound,
  SelfTransfer,
  StorageUnavailable,
} from "../../domain/payment.js";
import { SqlitePayments } from "./sqlite-payments.js";

const NOW = "2026-10-23T16:00:00.000Z";
const MAX_AMOUNT_CENTS = 50_000;

class FakeContacts implements ContactReader {
  constructor(private readonly links: readonly string[]) {}

  hasSavedContactWallet(ownerUserId: string, walletId: string): boolean {
    return this.links.includes(`${ownerUserId}>${walletId}`);
  }
}

let directory: string;
let path: string;
let database: DatabaseSync;
let users: SqliteUsers;
let counter: number;
const defaultContacts = new FakeContacts([
  "user-alice>wallet-bob",
  "user-alice>wallet-carol",
  "user-alice>wallet-dave",
]);

function nextId(): string {
  counter += 1;
  return `payment-${String(counter)}`;
}

function createUser(id: string, openingCents: number): void {
  users.create(
    {
      id,
      documentType: "DNI",
      documentNumber: `doc-${id}`,
      phone: `phone-${id}`,
      email: `${id}@example.test`,
      walletId: `wallet-${id.replace("user-", "")}`,
      kycStatus: "activa",
      active: true,
      createdAt: NOW,
      updatedAt: NOW,
    },
    "hash-unused",
    openingCents,
  );
}

function transfers(
  db: DatabaseSync,
  contacts: ContactReader = defaultContacts,
  newId: () => string = nextId,
) {
  return transferPayment({
    ledger: new SqlitePayments(db),
    contacts,
    maxAmountCents: MAX_AMOUNT_CENTS,
    now: () => NOW,
    newId,
  });
}

function command(
  recipientWalletId: string,
  amountCents: number,
  idempotencyKey = "key-1",
  sourceUserId = "user-alice",
) {
  return { sourceUserId, idempotencyKey, recipientWalletId, amountCents };
}

function balanceOf(walletId: string): number {
  const row = database
    .prepare("SELECT balance_cents AS balance FROM wallets WHERE id = ?")
    .get(walletId);
  return row && "balance" in row && typeof row.balance === "number"
    ? row.balance
    : Number.NaN;
}

function countRows(table: "payments" | "payment_keys"): number {
  const row = database
    .prepare(`SELECT count(*) AS count FROM ${table}`)
    .get();
  return row && "count" in row && typeof row.count === "number" ? row.count : -1;
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "payments-sqlite-"));
  path = join(directory, "wallet.sqlite");
  database = openDatabase(path, migrationsDirectory);
  users = new SqliteUsers(database);
  counter = 0;
  createUser("user-alice", 100_000);
  createUser("user-bob", 0);
  createUser("user-carol", 99_999_000);
  createUser("user-dave", 10);
});

afterEach(() => {
  if (database.isOpen) database.close();
  rmSync(directory, { recursive: true });
});

test("Successful contact payment commits debit, credit, payment and key together", () => {
  const result = transfers(database)(command("wallet-bob", 2_500));

  expect(result.outcome).toBe("created");
  expect(result.payment).toEqual({
    id: "payment-1",
    sourceWalletId: "wallet-alice",
    destinationWalletId: "wallet-bob",
    recipientType: "contact",
    amountCents: 2_500,
    currency: "PEN",
    status: "SUCCEEDED",
    createdAt: NOW,
  });
  expect(result.senderBalanceCents).toBe(97_500);
  expect(balanceOf("wallet-alice")).toBe(97_500);
  expect(balanceOf("wallet-bob")).toBe(2_500);
  expect(countRows("payments")).toBe(1);
  expect(countRows("payment_keys")).toBe(1);
});

test("Same key and same payload replays the committed payment without a second debit", () => {
  const pay = transfers(database);
  const first = pay(command("wallet-bob", 2_500));
  const second = pay(command("wallet-bob", 2_500));

  expect(second.outcome).toBe("replayed");
  expect(second.payment.id).toBe(first.payment.id);
  expect(second.senderBalanceCents).toBe(97_500);
  expect(balanceOf("wallet-alice")).toBe(97_500);
  expect(balanceOf("wallet-bob")).toBe(2_500);
  expect(countRows("payments")).toBe(1);
});

test("Changed payload on a committed key returns IDEMPOTENCY_CONFLICT with no second operation", () => {
  const pay = transfers(database);
  pay(command("wallet-bob", 2_500));

  expect(() => pay(command("wallet-bob", 3_000))).toThrow(IdempotencyConflict);
  expect(() => pay(command("wallet-carol", 2_500))).toThrow(IdempotencyConflict);
  expect(balanceOf("wallet-alice")).toBe(97_500);
  expect(countRows("payments")).toBe(1);
});

test("Invalid amounts are denied without changing balances or consuming the key", () => {
  const pay = transfers(database);

  for (const amount of [0, 1.5, MAX_AMOUNT_CENTS + 1, -10]) {
    expect(() => pay(command("wallet-bob", amount))).toThrow(InvalidPaymentAmount);
  }
  expect(balanceOf("wallet-alice")).toBe(100_000);
  expect(countRows("payment_keys")).toBe(0);
});

test("Self-directed payment is denied with SELF_TRANSFER", () => {
  expect(() => transfers(database)(command("wallet-alice", 100))).toThrow(
    SelfTransfer,
  );
  expect(countRows("payments")).toBe(0);
});

test("Payment to a wallet that is not a saved contact is denied with CONTACT_REQUIRED", () => {
  const pay = transfers(database, new FakeContacts([]));

  expect(() => pay(command("wallet-bob", 100))).toThrow(ContactRequired);
  expect(balanceOf("wallet-alice")).toBe(100_000);
});

test("Unknown recipient wallet is denied with RECIPIENT_NOT_FOUND", () => {
  expect(() => transfers(database)(command("wallet-missing", 100))).toThrow(
    RecipientNotFound,
  );
});

test("Insufficient sender funds leave both balances and records unchanged", () => {
  const pay = transfers(database, new FakeContacts(["user-alice>wallet-dave"]));

  expect(() => pay(command("wallet-dave", 50_000, "key-a"))).not.toThrow();
  expect(() => pay(command("wallet-dave", 50_000, "key-b"))).not.toThrow();
  expect(() => pay(command("wallet-dave", 1, "key-c"))).toThrow(InsufficientFunds);
  expect(balanceOf("wallet-alice")).toBe(0);
  expect(countRows("payments")).toBe(2);
  expect(countRows("payment_keys")).toBe(2);
});

test("Recipient balance over the storage cap returns BALANCE_LIMIT_EXCEEDED without mutation", () => {
  const pay = transfers(database, new FakeContacts(["user-alice>wallet-carol"]));

  expect(() => pay(command("wallet-carol", 2_000))).toThrow(BalanceLimitExceeded);
  expect(balanceOf("wallet-alice")).toBe(100_000);
  expect(balanceOf("wallet-carol")).toBe(99_999_000);
  expect(countRows("payments")).toBe(0);
});

test("Injected failure before commit rolls back every write and does not consume the key", () => {
  const failing = transfers(database, defaultContacts, () => {
    throw new Error("injected pre-commit failure");
  });

  expect(() => failing(command("wallet-bob", 2_500))).toThrow(
    "injected pre-commit failure",
  );
  expect(balanceOf("wallet-alice")).toBe(100_000);
  expect(balanceOf("wallet-bob")).toBe(0);
  expect(countRows("payments")).toBe(0);
  expect(countRows("payment_keys")).toBe(0);

  const retried = transfers(database)(command("wallet-bob", 2_500));
  expect(retried.outcome).toBe("created");
  expect(balanceOf("wallet-alice")).toBe(97_500);
});

test("Distinct keys competing for insufficient combined funds cannot overdraw", () => {
  const pay = transfers(database, new FakeContacts(["user-alice>wallet-dave"]));
  pay(command("wallet-dave", 50_000, "key-a"));
  pay(command("wallet-dave", 50_000, "key-b"));

  expect(() => pay(command("wallet-dave", 50_000, "key-c"))).toThrow(InsufficientFunds);
  expect(balanceOf("wallet-alice")).toBe(0);
  expect(balanceOf("wallet-dave")).toBe(100_010);
});

test("Duplicate key from another connection replays the single committed payment", () => {
  transfers(database)(command("wallet-bob", 2_500));
  const other = openDatabase(path, migrationsDirectory);
  try {
    const replay = transfers(other)(command("wallet-bob", 2_500));
    expect(replay.outcome).toBe("replayed");
    expect(balanceOf("wallet-alice")).toBe(97_500);
    expect(countRows("payments")).toBe(1);
  } finally {
    other.close();
  }
});

test("Busy writer returns STORAGE_UNAVAILABLE and leaves no partial movement", () => {
  const other = openDatabase(path, migrationsDirectory);
  other.exec("PRAGMA busy_timeout = 10");
  database.exec("BEGIN IMMEDIATE");
  try {
    expect(() => transfers(other)(command("wallet-bob", 2_500))).toThrow(
      StorageUnavailable,
    );
  } finally {
    database.exec("ROLLBACK");
    other.close();
  }
  expect(balanceOf("wallet-alice")).toBe(100_000);
  expect(balanceOf("wallet-bob")).toBe(0);
  expect(countRows("payment_keys")).toBe(0);
});

test("Retry after restart returns the original payment without a double debit", () => {
  transfers(database)(command("wallet-bob", 2_500));
  database.close();

  database = openDatabase(path, migrationsDirectory);
  const replay = transfers(database)(command("wallet-bob", 2_500));

  expect(replay.outcome).toBe("replayed");
  expect(replay.payment.id).toBe("payment-1");
  expect(balanceOf("wallet-alice")).toBe(97_500);
  expect(balanceOf("wallet-bob")).toBe(2_500);
  expect(countRows("payments")).toBe(1);
});

test("Sender-only key lookup and participant payment lookup deny unrelated users", () => {
  const result = transfers(database)(command("wallet-bob", 2_500));
  const ledger = new SqlitePayments(database);

  expect(ledger.findPaymentByRetryKey("user-alice", "key-1")).toEqual(
    result.payment,
  );
  expect(ledger.findPaymentByRetryKey("user-bob", "key-1")).toBeNull();
  expect(ledger.findPaymentForParticipant(result.payment.id, "user-alice")).toEqual(
    result.payment,
  );
  expect(ledger.findPaymentForParticipant(result.payment.id, "user-bob")).toEqual(
    result.payment,
  );
  expect(
    ledger.findPaymentForParticipant(result.payment.id, "user-carol"),
  ).toBeNull();
});

test("Ledger transaction rolls back and rethrows unexpected errors", () => {
  const ledger: PaymentLedger = new SqlitePayments(database);

  expect(() =>
    ledger.transact(() => {
      database.exec("CREATE TABLE rolled_back_marker (id INTEGER)");
      throw new Error("unexpected");
    }),
  ).toThrow("unexpected");
  expect(database.isTransaction).toBe(false);
  expect(
    database
      .prepare("SELECT name FROM sqlite_master WHERE name = 'rolled_back_marker'")
      .get(),
  ).toBeUndefined();
});
