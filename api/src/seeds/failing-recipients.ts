import type { DatabaseSync } from "node:sqlite";
import { seedReceivingUser, type SeedRecipient } from "./contacts.js";

type FailureMode = "declined" | "timeout" | "intermittent";

// Demo recipients whose payments fail on purpose. Search them by phone, then pay.
export const FAILING_RECIPIENTS: readonly (SeedRecipient & {
  readonly mode: FailureMode;
})[] = [
  {
    userId: "seed-user-declined",
    walletId: "seed-wallet-declined",
    documentNumber: "70000002",
    phone: "+51900000002",
    email: "declined@example.com",
    openingBalanceCents: 100_000,
    mode: "declined",
  },
  {
    userId: "seed-user-timeout",
    walletId: "seed-wallet-timeout",
    documentNumber: "70000003",
    phone: "+51900000003",
    email: "timeout@example.com",
    openingBalanceCents: 100_000,
    mode: "timeout",
  },
  {
    userId: "seed-user-intermittent",
    walletId: "seed-wallet-intermittent",
    documentNumber: "70000004",
    phone: "+51900000004",
    email: "intermittent@example.com",
    openingBalanceCents: 100_000,
    mode: "intermittent",
  },
];

export function seedFailingRecipients(database: DatabaseSync): void {
  for (const { mode, ...recipient } of FAILING_RECIPIENTS) {
    seedReceivingUser(database, recipient);
    database
      .prepare(
        "INSERT OR REPLACE INTO simulated_failures (wallet_id, mode) VALUES (?, ?)",
      )
      .run(recipient.walletId, mode);
  }
}
