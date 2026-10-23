import { describe, expect, test } from "vitest";
import { directionFor, formatPen } from "./format";
import type { PaymentView } from "./paymentsClient";

const PAYMENT: PaymentView = {
  id: "pay-1",
  sourceWalletId: "wallet-a",
  destinationWalletId: "wallet-b",
  recipientType: "contact",
  amountCents: 12345,
  currency: "PEN",
  status: "SUCCEEDED",
  createdAt: "2026-10-21T14:30:00.000Z",
  counterpartyName: "Andrés K***",
};

describe("directionFor", () => {
  test("is incoming for the destination wallet and outgoing for the source", () => {
    expect(directionFor(PAYMENT, "wallet-b")).toBe("incoming");
    expect(directionFor(PAYMENT, "wallet-a")).toBe("outgoing");
  });

  test("is undefined for a wallet that is not a participant", () => {
    expect(directionFor(PAYMENT, "wallet-c")).toBeUndefined();
  });
});

describe("formatPen", () => {
  test("formats integer céntimos as PEN without float arithmetic on the input", () => {
    expect(formatPen(12345)).toMatch(/S\/\s?123\.45/);
    expect(formatPen(2550)).toMatch(/S\/\s?25\.50/);
    expect(formatPen(5)).toMatch(/S\/\s?0\.05/);
  });
});
