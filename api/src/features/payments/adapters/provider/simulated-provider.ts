import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { PaymentDeclined, ProviderTimeout } from "../../domain/payment.js";
import type { PaymentProvider } from "../../application/ports.js";

const modeRow = z.object({ mode: z.enum(["declined", "timeout", "intermittent"]) });

// Demo only: wallets listed in simulated_failures fail on purpose. Intermittent wallets
// fail the first attempt of each idempotency key, so a retry with the same key succeeds.
// Attempt counts live in memory and reset when the API restarts.
export class SimulatedPaymentProvider implements PaymentProvider {
  private readonly failedKeys = new Set<string>();

  constructor(private readonly database: DatabaseSync) {}

  authorize(input: {
    sourceUserId: string;
    idempotencyKey: string;
    recipientWalletId: string;
  }): void {
    const row = this.database
      .prepare("SELECT mode FROM simulated_failures WHERE wallet_id = ?")
      .get(input.recipientWalletId);
    if (row === undefined) return;

    const { mode } = modeRow.parse(row);
    if (mode === "declined") throw new PaymentDeclined();
    if (mode === "timeout") throw new ProviderTimeout();

    const attemptId = `${input.sourceUserId}:${input.idempotencyKey}`;
    if (this.failedKeys.has(attemptId)) return;
    this.failedKeys.add(attemptId);
    throw new ProviderTimeout();
  }
}
