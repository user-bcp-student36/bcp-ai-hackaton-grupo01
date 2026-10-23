// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { formatPenCents, parsePenAmountToCents } from "./amount";

describe("parsePenAmountToCents", () => {
  test.each([
    ["25", 2500],
    ["25.5", 2550],
    ["0.01", 1],
    ["0.29", 29],
    ["1234.56", 123456],
  ])("Converts %s to %i cents without float arithmetic", (input, cents) => {
    expect(parsePenAmountToCents(input)).toEqual({ ok: true, cents });
  });

  test.each(["", "0", "0.00", "-1", "1,50", "1.234", "1e3", "abc", "1."])(
    "Rejects the invalid amount %j",
    (input) => {
      expect(parsePenAmountToCents(input).ok).toBe(false);
    },
  );
});

test("Formats cents for display with a thousands separator", () => {
  expect(formatPenCents(123456)).toBe("S/ 1,234.56");
});
