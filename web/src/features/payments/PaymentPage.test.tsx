// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import {
  clearPaymentAttempt,
  hasUnresolvedPaymentAttempt,
} from "./payment-attempt";
import { PaymentPage, type RetryPolicy } from "./PaymentPage";

const ANA_WALLET = "wallet-demo-ana";
const OWNER = "owner-a";
const OTHER_OWNER = "owner-b";

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

function paymentJson(): unknown {
  return {
    payment: {
      id: "payment-1",
      sourceWalletId: "wallet-owner",
      destinationWalletId: ANA_WALLET,
      recipientType: "contact",
      amountCents: 2550,
      currency: "PEN",
      status: "SUCCEEDED",
      createdAt: "2026-10-23T17:00:00.000Z",
    },
  };
}

function json(body: unknown, status: number): Promise<Response> {
  return Promise.resolve(Response.json(body, { status }));
}

function networkFailure(): Promise<Response> {
  return Promise.reject(new TypeError("Failed to fetch"));
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

function stubFetch(
  handler: (url: string, init: RequestInit) => Promise<Response>,
) {
  const fetchMock = vi.fn<typeof fetch>((input, init) =>
    handler(urlOf(input), init ?? {}),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Answers each request in order; running out of answers fails the test. */
function sequence(...responses: Array<() => Promise<Response>>) {
  const queue = [...responses];
  return (): Promise<Response> => {
    const next = queue.shift();
    if (!next) throw new Error("Unexpected extra request");
    return next();
  };
}

function requestsOf(fetchMock: ReturnType<typeof stubFetch>) {
  return fetchMock.mock.calls.map(([input, init]) => ({
    url: urlOf(input),
    method: init?.method ?? "GET",
    key: (init?.headers as Record<string, string> | undefined)?.[
      "Idempotency-Key"
    ],
    body:
      typeof init?.body === "string"
        ? (JSON.parse(init.body) as unknown)
        : undefined,
  }));
}

const TEST_CONTACTS = [
  { walletId: ANA_WALLET, name: "Ana Quispe" },
  { walletId: "wallet-demo-carlos", name: "Carlos Huamán" },
];
const ACCESS_TOKEN = "token-owner-a";

function renderPage(
  ownerUserId: string = OWNER,
  retryPolicy: RetryPolicy = { maxRetries: 0, delayMs: 0 },
) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PaymentPage
          ownerUserId={ownerUserId}
          accessToken={ACCESS_TOKEN}
          contacts={TEST_CONTACTS}
          retryPolicy={retryPolicy}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function payNow(user: UserEvent, amount: string) {
  await user.selectOptions(screen.getByLabelText("Destinatario"), ANA_WALLET);
  await user.type(screen.getByLabelText("Monto en soles (PEN)"), amount);
  await user.click(screen.getByRole("button", { name: "Pagar" }));
}

test("Sends the signed-in user's bearer token with the payment", async () => {
  const fetchMock = stubFetch(() => json(paymentJson(), 201));
  const user = userEvent.setup();
  renderPage();

  await payNow(user, "10");

  await screen.findByRole("heading", { name: "Pago realizado" });
  const [, init] = fetchMock.mock.calls[0] ?? [];
  expect((init?.headers as Record<string, string>).Authorization).toBe(
    `Bearer ${ACCESS_TOKEN}`,
  );
});

test("Sends the amount in cents with one idempotency key", async () => {
  const fetchMock = stubFetch(() => json(paymentJson(), 201));
  const user = userEvent.setup();
  renderPage();

  await payNow(user, "25.50");

  expect(
    await screen.findByRole("heading", { name: "Pago realizado" }),
  ).toBeVisible();
  const [request] = requestsOf(fetchMock);
  expect(request?.url).toMatch(/\/payments$/);
  expect(request).toMatchObject({
    method: "POST",
    body: {
      recipientType: "contact",
      recipientWalletId: ANA_WALLET,
      amountCents: 2550,
      currency: "PEN",
    },
  });
  expect(request?.key).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(sessionStorage.length).toBe(0);
});

test("Refreshes the cached wallet balance after a successful payment", async () => {
  stubFetch(() => json(paymentJson(), 201));
  const user = userEvent.setup();
  const queryClient = new QueryClient();
  const accountKey = ["account", OWNER];
  queryClient.setQueryData(accountKey, { wallet: { balanceCents: 5000 } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PaymentPage
          ownerUserId={OWNER}
          accessToken={ACCESS_TOKEN}
          contacts={TEST_CONTACTS}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  await payNow(user, "10");

  await screen.findByRole("heading", { name: "Pago realizado" });
  expect(queryClient.getQueryState(accountKey)?.isInvalidated).toBe(true);
});

test("Rejects an invalid amount without sending anything", async () => {
  const fetchMock = stubFetch(() => json(paymentJson(), 201));
  const user = userEvent.setup();
  renderPage();

  await payNow(user, ".");

  expect(
    screen.getByText(
      "Ingresa un monto en soles, con hasta dos decimales. Ej.: 25.50",
    ),
  ).toBeVisible();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("Sends a single request when pay is double clicked", async () => {
  const fetchMock = stubFetch(() => new Promise<Response>(() => undefined));
  const user = userEvent.setup();
  renderPage();

  await user.selectOptions(screen.getByLabelText("Destinatario"), ANA_WALLET);
  await user.type(screen.getByLabelText("Monto en soles (PEN)"), "25.50");
  await user.dblClick(screen.getByRole("button", { name: "Pagar" }));

  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("Keeps a lost response as unknown and resolves it with the same key", async () => {
  const fetchMock = stubFetch(
    sequence(
      networkFailure,
      () =>
        json(
          { error: { code: "PAYMENT_NOT_FOUND", message: "No encontrado." } },
          404,
        ),
      () => json(paymentJson(), 201),
    ),
  );
  const user = userEvent.setup();
  renderPage();

  await payNow(user, "25.50");

  expect(
    await screen.findByRole("heading", { name: "Resultado por confirmar" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Pagar" }),
  ).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Consultar resultado" }));

  expect(
    await screen.findByRole("heading", { name: "Pago realizado" }),
  ).toBeVisible();
  const [sent, lookup, retried] = requestsOf(fetchMock);
  const key = sent?.key ?? "";
  expect(lookup?.url).toContain(`/payments/by-key/${key}`);
  expect(retried).toMatchObject({
    method: "POST",
    key: sent?.key,
    body: sent?.body,
  });
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

test("Clears the attempt after a business rejection so the next payment gets a new key", async () => {
  const fetchMock = stubFetch(
    sequence(
      () =>
        json(
          {
            error: {
              code: "INSUFFICIENT_FUNDS",
              message: "Saldo insuficiente.",
            },
          },
          409,
        ),
      () => json(paymentJson(), 201),
    ),
  );
  const user = userEvent.setup();
  renderPage();

  await payNow(user, "25.50");

  expect(
    await screen.findByText("Saldo insuficiente para este pago."),
  ).toBeVisible();
  expect(sessionStorage.length).toBe(0);

  await user.click(screen.getByRole("button", { name: "Pagar" }));

  expect(
    await screen.findByRole("heading", { name: "Pago realizado" }),
  ).toBeVisible();
  const [first, second] = requestsOf(fetchMock);
  expect(second?.key).not.toBe(first?.key);
});

test("Retries a provider timeout automatically with the same key and succeeds", async () => {
  const timeout = () =>
    json(
      {
        error: {
          code: "PROVIDER_TIMEOUT",
          message: "El proveedor no respondió a tiempo.",
        },
      },
      503,
    );
  const notFound = () =>
    json(
      { error: { code: "PAYMENT_NOT_FOUND", message: "No encontrado." } },
      404,
    );
  const fetchMock = stubFetch(
    sequence(timeout, notFound, () => json(paymentJson(), 201)),
  );
  const user = userEvent.setup();
  renderPage(OWNER, { maxRetries: 2, delayMs: 0 });

  await payNow(user, "25.50");

  expect(
    await screen.findByRole("heading", { name: "Pago realizado" }),
  ).toBeVisible();
  const [first, lookup, retried] = requestsOf(fetchMock);
  expect(lookup?.url).toContain(`/payments/by-key/${first?.key ?? ""}`);
  expect(retried?.key).toBe(first?.key);
});

test("Stops after the retry limit and offers a manual check", async () => {
  const timeout = () =>
    json(
      {
        error: {
          code: "PROVIDER_TIMEOUT",
          message: "El proveedor no respondió a tiempo.",
        },
      },
      503,
    );
  stubFetch(() => timeout());
  const user = userEvent.setup();
  renderPage(OWNER, { maxRetries: 1, delayMs: 0 });

  await payNow(user, "25.50");

  expect(
    await screen.findByRole("heading", { name: "Resultado por confirmar" }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Consultar resultado" }),
  ).toBeVisible();
});

test("Shows a clear message when the provider declines and frees the form", async () => {
  stubFetch(() =>
    json(
      {
        error: {
          code: "PAYMENT_DECLINED",
          message: "El proveedor rechazó el pago.",
        },
      },
      409,
    ),
  );
  const user = userEvent.setup();
  renderPage();

  await payNow(user, "25.50");

  expect(await screen.findByText(/El proveedor rechazó el pago/)).toBeVisible();
  expect(sessionStorage.length).toBe(0);
  expect(screen.getByRole("button", { name: "Pagar" })).toBeVisible();
});

test("Restores an unresolved attempt for its own user only", async () => {
  stubFetch(() => networkFailure());
  const user = userEvent.setup();
  const original = renderPage(OWNER);

  await payNow(user, "25.50");
  expect(
    await screen.findByRole("heading", { name: "Resultado por confirmar" }),
  ).toBeVisible();
  original.unmount();

  const otherUser = renderPage(OTHER_OWNER);
  expect(
    screen.queryByRole("heading", { name: "Resultado por confirmar" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Pagar" })).toBeVisible();
  otherUser.unmount();

  renderPage(OWNER);
  expect(
    screen.getByRole("heading", { name: "Resultado por confirmar" }),
  ).toBeVisible();

  clearPaymentAttempt(OWNER);
  expect(hasUnresolvedPaymentAttempt(OWNER)).toBe(false);
});
