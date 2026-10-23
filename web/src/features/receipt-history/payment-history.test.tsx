// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { PaymentHistoryPage } from "./PaymentHistoryPage";
import { PaymentReceiptPage } from "./PaymentReceiptPage";
import { announcePaymentSucceeded } from "./payment-events";
import type { PaymentView, ReceiptSession } from "./paymentsClient";

const SESSION: ReceiptSession = {
  accessToken: "token-ana",
  walletId: "wallet-ana",
};

const RECEIVED: PaymentView = {
  id: "pay-0002",
  sourceWalletId: "wallet-luis",
  destinationWalletId: "wallet-ana",
  recipientType: "contact",
  amountCents: 10000,
  currency: "PEN",
  status: "SUCCEEDED",
  createdAt: "2026-10-21T14:30:00.000Z",
  counterpartyName: "Andrés K***",
};

const SENT: PaymentView = {
  id: "pay-0001",
  sourceWalletId: "wallet-ana",
  destinationWalletId: "wallet-luis",
  recipientType: "contact",
  amountCents: 2550,
  currency: "PEN",
  status: "SUCCEEDED",
  createdAt: "2026-10-20T15:04:00.000Z",
  counterpartyName: "María Q***",
};

const UNRELATED: PaymentView = {
  id: "pay-9999",
  sourceWalletId: "wallet-carla",
  destinationWalletId: "wallet-luis",
  recipientType: "contact",
  amountCents: 500,
  currency: "PEN",
  status: "SUCCEEDED",
  createdAt: "2026-10-19T10:00:00.000Z",
  counterpartyName: "Luis P***",
};

type Handler = (
  url: string,
  init: RequestInit | undefined,
) => Response | Promise<Response>;

function stubApi(handler: Handler) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) =>
    Promise.resolve(handler(url, init)),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function renderAt(path: string, session: ReceiptSession | null = SESSION) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/movimientos"
            element={<PaymentHistoryPage session={session} />}
          />
          <Route
            path="/movimientos/:paymentId"
            element={<PaymentReceiptPage session={session} />}
          />
          <Route path="/ingresar" element={<p>Pantalla de ingreso</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("payment history (6.1)", () => {
  test("lists both directions, newest first, with PEN amounts and the fictitious-money note", async () => {
    stubApi((url) => {
      if (url.endsWith("/api/v1/payments")) {
        return json({ payments: [RECEIVED, SENT] });
      }
      throw new Error(`unexpected ${url}`);
    });

    renderAt("/movimientos");

    const list = await screen.findByRole("list", { name: "Movimientos" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Recibido");
    expect(rows[0]).toHaveTextContent(/S\/\s?100\.00/);
    expect(rows[1]).toHaveTextContent("Enviado");
    expect(rows[1]).toHaveTextContent(/S\/\s?25\.50/);
    expect(
      screen.getByText(/Montos en soles \(PEN\) de fondos ficticios/),
    ).toBeVisible();
  });

  test("sends the bearer token from the session and nothing else", async () => {
    const fetchMock = stubApi(() => json({ payments: [] }));

    renderAt("/movimientos");

    await screen.findByText("Aún no tienes movimientos.");
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(init.headers).toMatchObject({
      Authorization: "Bearer token-ana",
    });
  });

  test("hides a row whose wallet is not a participant, rather than showing someone else's payment", async () => {
    stubApi(() => json({ payments: [UNRELATED, SENT] }));

    renderAt("/movimientos");

    const list = await screen.findByRole("list", { name: "Movimientos" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByText("Referencia: pay-9999")).not.toBeInTheDocument();
  });
});

describe("history states (6.2)", () => {
  test("shows a loading state and no success content until the response arrives", () => {
    stubApi(() => new Promise<Response>(() => {}));

    renderAt("/movimientos");

    expect(screen.getByText("Cargando movimientos…")).toBeVisible();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Aún no tienes movimientos."),
    ).not.toBeInTheDocument();
  });

  test("shows the empty state for an empty history", async () => {
    stubApi(() => json({ payments: [] }));

    renderAt("/movimientos");

    expect(await screen.findByText("Aún no tienes movimientos.")).toBeVisible();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  test("shows an error with retry and no invented rows when the API fails", async () => {
    let healthy = false;
    stubApi(() =>
      healthy
        ? json({ payments: [SENT] })
        : json({ error: { code: "INTERNAL", message: "boom" } }, 500),
    );

    renderAt("/movimientos");

    // 5xx is retried twice with TanStack's backoff (about 3 s) before the error shows.
    expect(
      await screen.findByRole("alert", {}, { timeout: 6000 }),
    ).toHaveTextContent("No pudimos cargar tus movimientos.");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByText(/S\//)).not.toBeInTheDocument();

    healthy = true;
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText(/S\/\s?25\.50/)).toBeVisible();
  }, 15_000);

  test("an expired session asks the user to sign in again", async () => {
    stubApi(() =>
      json({ error: { code: "UNAUTHENTICATED", message: "x" } }, 401),
    );

    renderAt("/movimientos");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tu sesión venció.",
    );
    expect(
      screen.getByRole("link", { name: "Vuelve a ingresar" }),
    ).toHaveAttribute("href", "/ingresar");
  });

  test("without a session it asks to sign in and sends no request", () => {
    const fetchMock = stubApi(() => json({ payments: [] }));

    renderAt("/movimientos", null);

    expect(
      screen.getByText("Inicia sesión para ver tus movimientos."),
    ).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("a payment-success event refetches the history", async () => {
    let payments: PaymentView[] = [];
    const fetchMock = stubApi(() => json({ payments }));

    renderAt("/movimientos");
    expect(await screen.findByText("Aún no tienes movimientos.")).toBeVisible();

    payments = [SENT];
    act(() => {
      announcePaymentSucceeded();
    });

    expect(await screen.findByText(/S\/\s?25\.50/)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("receipt (6.1, 6.3)", () => {
  test("shows the receipt with PEN amount, direction, status and the fictitious-money disclaimer", async () => {
    stubApi((url) => {
      if (url.endsWith("/payments/pay-0002/receipt")) {
        return json({ receipt: RECEIVED });
      }
      throw new Error(`unexpected ${url}`);
    });

    renderAt("/movimientos/pay-0002");

    const receipt = await screen.findByRole("article");
    expect(
      within(receipt).getByRole("heading", {
        name: "Comprobante de transferencia",
      }),
    ).toBeVisible();
    expect(within(receipt).getByText(/S\/\s?100\.00/)).toBeVisible();
    expect(within(receipt).getByText("Recibido")).toBeVisible();
    expect(within(receipt).getByText("Completado")).toBeVisible();
    expect(within(receipt).getByText(/Fondos ficticios/)).toBeVisible();
    expect(within(receipt).getByText(/no es prueba fiscal/)).toBeVisible();
  });

  test("the history row and its receipt show the same reference, amount and direction", async () => {
    stubApi((url) => {
      if (url.endsWith("/api/v1/payments")) return json({ payments: [SENT] });
      if (url.endsWith("/payments/pay-0001/receipt")) {
        return json({ receipt: SENT });
      }
      throw new Error(`unexpected ${url}`);
    });

    renderAt("/movimientos");

    const list = await screen.findByRole("list", { name: "Movimientos" });
    const row = within(list).getByRole("listitem");
    const historyText = row.textContent;
    expect(historyText).toContain("Referencia: pay-0001");

    await userEvent.click(
      within(row).getByRole("link", { name: "Ver comprobante" }),
    );

    const receipt = await screen.findByRole("article");
    expect(within(receipt).getByText("pay-0001")).toBeVisible();
    expect(within(receipt).getByText(/S\/\s?25\.50/)).toBeVisible();
    expect(within(receipt).getByText("Enviado")).toBeVisible();
    expect(historyText).toMatch(/S\/\s?25\.50/);
    expect(historyText).toContain("Enviado");
  });

  test("a receipt for a payment the wallet is not part of is denied as not found", async () => {
    stubApi((url) => {
      if (url.endsWith("/payments/pay-9999/receipt")) {
        return json(
          { error: { code: "PAYMENT_NOT_FOUND", message: "x" } },
          404,
        );
      }
      throw new Error(`unexpected ${url}`);
    });

    renderAt("/movimientos/pay-9999");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No encontramos este comprobante.",
    );
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.queryByText(/S\//)).not.toBeInTheDocument();
  });

  test("a 200 receipt that does not involve this wallet is still denied on the client", async () => {
    stubApi(() => json({ receipt: UNRELATED }));

    renderAt("/movimientos/pay-9999");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No encontramos este comprobante.",
    );
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.queryByText(/S\//)).not.toBeInTheDocument();
    expect(screen.queryByText("pay-9999")).not.toBeInTheDocument();
  });

  test("the receipt shows a loading state first", () => {
    stubApi(() => new Promise<Response>(() => {}));

    renderAt("/movimientos/pay-0002");

    expect(screen.getByText("Cargando comprobante…")).toBeVisible();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });
});
