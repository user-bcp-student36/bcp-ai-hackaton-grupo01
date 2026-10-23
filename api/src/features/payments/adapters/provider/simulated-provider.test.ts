import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, test } from "vitest";
import { migrationsDirectory, openDatabase } from "../../../../shared/database.js";
import { seedFailingRecipients } from "../../../../seeds/failing-recipients.js";
import { SqliteUsers } from "../../../onboarding/adapters/persistence/sqlite-users.js";
import type { ContactReader } from "../../application/ports.js";
import { transferPayment } from "../../application/transfer.js";
import { PaymentDeclined, ProviderTimeout } from "../../domain/payment.js";
import { SqlitePayments } from "../persistence/sqlite-payments.js";
import { SimulatedPaymentProvider } from "./simulated-provider.js";

const NOW = "2026-10-23T16:00:00.000Z";
const PAYER = "user-payer";
const OPENING_CENTS = 100_000;

const everyoneIsAContact: ContactReader = {
  hasSavedContactWallet: () => true,
};

let directory: string;
let database: DatabaseSync;
let payerPayments: ReturnType<typeof buildTransfer>;

function buildTransfer(db: DatabaseSync) {
  let counter = 0;
  return transferPayment({
    ledger: new SqlitePayments(db),
    contacts: everyoneIsAContact,
    provider: new SimulatedPaymentProvider(db),
    maxAmountCents: 50_000,
    now: () => NOW,
    newId: () => `payment-${String((counter += 1))}`,
  });
}

function pay(walletId: string, key: string) {
  return payerPayments({
    sourceUserId: PAYER,
    idempotencyKey: key,
    recipientWalletId: walletId,
    amountCents: 1_000,
  });
}

function balanceOf(walletId: string): number {
  const row = database
    .prepare("SELECT balance_cents AS balance FROM wallets WHERE id = ?")
    .get(walletId);
  return row && "balance" in row && typeof row.balance === "number"
    ? row.balance
    : Number.NaN;
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "simulated-provider-"));
  database = openDatabase(join(directory, "wallet.sqlite"), migrationsDirectory);
  new SqliteUsers(database).create(
    {
      id: PAYER,
      documentType: "DNI",
      documentNumber: "doc-payer",
      phone: "phone-payer",
      email: "payer@example.test",
      walletId: "wallet-payer",
      kycStatus: "activa",
      active: true,
      createdAt: NOW,
      updatedAt: NOW,
    },
    "hash-unused",
    OPENING_CENTS,
  );
  seedFailingRecipients(database);
  payerPayments = buildTransfer(database);
});

afterEach(() => {
  if (database.isOpen) database.close();
  rmSync(directory, { recursive: true, force: true });
});

test("A declined recipient rejects the payment and moves no money", () => {
  expect(() => pay("seed-wallet-declined", "key-1")).toThrow(PaymentDeclined);
  expect(balanceOf("wallet-payer")).toBe(OPENING_CENTS);
  expect(balanceOf("seed-wallet-declined")).toBe(OPENING_CENTS);
});

test("A timeout recipient fails every attempt and never consumes the key", () => {
  expect(() => pay("seed-wallet-timeout", "key-1")).toThrow(ProviderTimeout);
  expect(() => pay("seed-wallet-timeout", "key-1")).toThrow(ProviderTimeout);
  expect(balanceOf("wallet-payer")).toBe(OPENING_CENTS);
});

test("An intermittent recipient fails once, then the same key succeeds and replays", () => {
  expect(() => pay("seed-wallet-intermittent", "key-1")).toThrow(ProviderTimeout);
  expect(balanceOf("wallet-payer")).toBe(OPENING_CENTS);

  const created = pay("seed-wallet-intermittent", "key-1");
  expect(created.outcome).toBe("created");
  const replayed = pay("seed-wallet-intermittent", "key-1");
  expect(replayed.outcome).toBe("replayed");
  expect(balanceOf("wallet-payer")).toBe(OPENING_CENTS - 1_000);
});

test("Seeding twice keeps one failing recipient per mode", () => {
  seedFailingRecipients(database);
  const row = database.prepare("SELECT count(*) AS count FROM simulated_failures").get();
  expect(row).toMatchObject({ count: 3 });
});
