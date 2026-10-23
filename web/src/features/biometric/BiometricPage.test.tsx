// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router";
import { SessionProvider } from "../../lib/session";
import { BiometricPage } from "./BiometricPage";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const PROFILE = {
  documentNumber: "72193412",
  fullName: "Andrés Koga",
  phone: "+51987000001",
  email: "andres.koga@example.com",
  hasAccount: false,
};

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function renderPage(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SessionProvider>
        <MemoryRouter>
          <BiometricPage />
        </MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>,
  );
}

test("only the DNI is requested first, then the preloaded data is shown", async () => {
  renderPage(vi.fn(() => jsonResponse(200, PROFILE)));

  await userEvent.type(screen.getByLabelText("DNI"), "72193412");
  await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

  expect(await screen.findByText("Andrés Koga")).toBeVisible();
  expect(screen.getByText("+51987000001")).toBeVisible();
  expect(screen.getByText("andres.koga@example.com")).toBeVisible();
  expect(screen.getByLabelText("Crea tu contraseña de 6 dígitos")).toBeVisible();
  expect(
    screen.getByText("Este navegador no permite usar la cámara."),
  ).toBeVisible();
});

test("a DNI that is not enabled shows feedback", async () => {
  renderPage(
    vi.fn(() =>
      jsonResponse(404, {
        error: { code: "BIOMETRIC_NOT_ENABLED", message: "x" },
      }),
    ),
  );

  await userEvent.type(screen.getByLabelText("DNI"), "11111111");
  await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Este DNI no tiene acceso biométrico habilitado en la demo.",
  );
});

test("an invalid DNI is rejected without calling the API", async () => {
  const fetchMock = vi.fn(() => jsonResponse(200, PROFILE));
  renderPage(fetchMock);

  await userEvent.type(screen.getByLabelText("DNI"), "123");
  await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

  expect(screen.getByRole("alert")).toHaveTextContent("Ingresa un DNI de 8 dígitos.");
  expect(fetchMock).not.toHaveBeenCalled();
});
