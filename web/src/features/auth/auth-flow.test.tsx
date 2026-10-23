// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import {
  accountResponseSchema,
  sessionResponseSchema,
} from "@wallet/contracts/auth";
import type { UserView, WalletView } from "@wallet/contracts/onboarding";
import { App } from "../../App";
import { SESSION_EXPIRED_NOTICE } from "../../lib/session";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const PASSWORD = "012345";
const TIMESTAMP = "2026-10-23T17:00:00.000Z";
const EXPIRES_AT = "2026-10-23T18:00:00.000Z";

type Account = {
  token: string;
  user: UserView;
  wallet: WalletView | null;
  sessionValid?: boolean;
};

function userView(overrides: Partial<UserView> = {}): UserView {
  return {
    id: "user-ana",
    documentType: "DNI",
    documentNumber: "12345678",
    phone: "+51912345678",
    email: "ana@example.com",
    walletId: "wallet-ana",
    kycStatus: "activa",
    active: true,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

const ANA: Account = {
  token: "token-ana",
  user: userView(),
  wallet: { id: "wallet-ana", currency: "PEN", balanceCents: 15000 },
};
const BRUNO: Account = {
  token: "token-bruno",
  user: userView({
    id: "user-bruno",
    documentNumber: "87654321",
    email: "bruno@example.com",
    walletId: "wallet-bruno",
  }),
  wallet: { id: "wallet-bruno", currency: "PEN", balanceCents: 2000 },
};

function json(body: unknown, status: number): Promise<Response> {
  return Promise.resolve(Response.json(body, { status }));
}

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

function stubApi(accounts: readonly Account[]) {
  const revoked = new Set<string>();
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const path = new URL(urlOf(input), "http://localhost").pathname;
    const method = init?.method ?? "GET";

    if (method === "POST" && path === "/api/v1/sessions") {
      const body = JSON.parse(bodyOf(init)) as {
        documentNumber: string;
        password: string;
      };
      const account = accounts.find(
        (candidate) => candidate.user.documentNumber === body.documentNumber,
      );
      if (!account || body.password !== PASSWORD) {
        return json(
          errorBody(
            "INVALID_CREDENTIALS",
            "Documento o contraseña incorrectos.",
          ),
          401,
        );
      }
      return json(
        sessionResponseSchema.parse({
          accessToken: account.token,
          tokenType: "Bearer",
          expiresAt: EXPIRES_AT,
          user: account.user,
        }),
        201,
      );
    }

    const token = authorizationOf(init) ?? "";
    const account = accounts.find(
      (candidate) =>
        candidate.token === token &&
        candidate.sessionValid !== false &&
        !revoked.has(token),
    );
    if (method === "GET" && path === "/api/v1/me") {
      if (!account) {
        return json(errorBody("UNAUTHENTICATED", "Sesión no válida."), 401);
      }
      return json(
        accountResponseSchema.parse({
          user: account.user,
          wallet: account.wallet,
        }),
        200,
      );
    }
    if (method === "DELETE" && path === "/api/v1/sessions/current") {
      if (!account) {
        return json(errorBody("UNAUTHENTICATED", "Sesión no válida."), 401);
      }
      revoked.add(token);
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return json(errorBody("NOT_FOUND", "Recurso no encontrado."), 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function authorizationOf(init: RequestInit | undefined): string | undefined {
  const headers = init?.headers as Record<string, string> | undefined;
  return headers?.Authorization?.replace(/^Bearer /, "");
}

function recordStorageWrites(): string[] {
  const writes: string[] = [];
  const storage = {
    length: 0,
    getItem: () => null,
    key: () => null,
    removeItem: () => undefined,
    clear: () => undefined,
    setItem: (key: string) => {
      writes.push(key);
    },
  };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("sessionStorage", storage);
  return writes;
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

function bodyOf(init: RequestInit | undefined): string {
  return typeof init?.body === "string" ? init.body : "";
}

function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function login(
  documentNumber: string,
  password = PASSWORD,
  documentType: "DNI" | "CE" = "DNI",
) {
  const user = userEvent.setup();
  await user.selectOptions(
    screen.getByLabelText("Tipo de documento"),
    documentType,
  );
  await user.type(screen.getByLabelText("Número de documento"), documentNumber);
  await user.type(screen.getByLabelText("Contraseña de 6 dígitos"), password);
  await user.click(screen.getByRole("button", { name: "Ingresar" }));
}

describe("Login form", () => {
  test("Logs in, shows the active balance and keeps the token out of storage and the URL", async () => {
    const storageWrites = recordStorageWrites();
    const fetchMock = stubApi([ANA]);
    renderAt("/ingresar");

    await login("12345678");

    expect(
      await screen.findByRole("heading", { name: "Mi billetera" }),
    ).toBeVisible();
    expect(await screen.findByText(/150\.00/)).toBeVisible();
    expect(storageWrites).toEqual([]);
    expect(window.location.href).not.toContain(ANA.token);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({
        documentType: "DNI",
        documentNumber: "12345678",
        password: PASSWORD,
      }),
    );
  });

  test("Shows one generic message for wrong credentials and clears the password", async () => {
    stubApi([ANA]);
    renderAt("/ingresar");

    await login("12345678", "999999");

    expect(
      await screen.findByText("Documento o contraseña incorrectos."),
    ).toHaveAttribute("role", "alert");
    expect(screen.getByLabelText("Contraseña de 6 dígitos")).toHaveValue("");
    expect(
      screen.queryByRole("heading", { name: "Mi billetera" }),
    ).not.toBeInTheDocument();
  });

  test("Blocks a five-digit password before calling the API", async () => {
    const fetchMock = stubApi([ANA]);
    renderAt("/ingresar");

    await login("12345678", "12345");

    expect(screen.getByLabelText("Contraseña de 6 dígitos")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("Shows a rate-limit message from a 429 without repeating the document", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        json(errorBody("RATE_LIMITED", "Demasiadas solicitudes."), 429),
      ),
    );
    renderAt("/ingresar");

    await login("12345678");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Demasiados intentos");
    expect(alert).not.toHaveTextContent("12345678");
  });
});

describe("Wallet view", () => {
  test("Shows the non-active status and no balance for a pending user", async () => {
    stubApi([
      {
        token: "token-pending",
        user: userView({
          documentNumber: "AB1234567",
          documentType: "CE",
          walletId: null,
          kycStatus: "pendiente",
          active: false,
        }),
        wallet: null,
      },
    ]);
    renderAt("/ingresar");

    await login("AB1234567", PASSWORD, "CE");

    expect(
      await screen.findByText(/Tu verificación está pendiente/),
    ).toBeVisible();
    expect(screen.queryByText(/Saldo disponible/)).not.toBeInTheDocument();
  });

  test("An expired session returns to login with a notice and no account data", async () => {
    stubApi([{ ...ANA, sessionValid: false }]);
    renderAt("/ingresar");

    await login("12345678");

    expect(await screen.findByText(SESSION_EXPIRED_NOTICE)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Ingresar" })).toBeVisible();
    expect(screen.queryByText(/S\/\s?150/)).not.toBeInTheDocument();
  });

  test("Logout revokes the session and the next user never sees the previous balance", async () => {
    const fetchMock = stubApi([ANA, BRUNO]);
    const user = userEvent.setup();
    renderAt("/ingresar");

    await login("12345678");
    expect(await screen.findByText(/150\.00/)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(
      await screen.findByRole("heading", { name: "Ingresar" }),
    ).toBeVisible();
    const deleteCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        init?.method === "DELETE" && urlOf(url).endsWith("/sessions/current"),
    );
    expect(authorizationOf(deleteCall?.[1])).toBe(ANA.token);

    await login("87654321");

    expect(await screen.findByText(/20\.00/)).toBeVisible();
    expect(screen.queryByText(/150/)).not.toBeInTheDocument();
  });
});
