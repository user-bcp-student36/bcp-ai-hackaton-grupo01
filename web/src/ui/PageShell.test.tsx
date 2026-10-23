// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { SessionProvider, useSession } from "../lib/session";
import { PageShell } from "./PageShell";

const SESSION = {
  token: "t",
  expiresAt: "2030-01-01T00:00:00.000Z",
  user: {} as never,
};

function SignIn() {
  const { signIn } = useSession();
  return (
    <button
      onClick={() => {
        signIn(SESSION);
      }}
    >
      entrar
    </button>
  );
}

afterEach(cleanup);

function renderShell(signedIn: boolean) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SessionProvider>
        <MemoryRouter>
          {signedIn ? <SignIn /> : null}
          <PageShell>contenido</PageShell>
        </MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>,
  );
}

test("without a session the top bar only shows Inicio", () => {
  renderShell(false);
  expect(screen.getByRole("link", { name: "Inicio" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Contactos" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Pagos" })).toBeNull();
});

test("with a session the top bar shows every link", async () => {
  renderShell(true);
  await userEvent.click(screen.getByRole("button", { name: "entrar" }));
  expect(screen.getByRole("link", { name: "Contactos" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Pagos" })).toBeTruthy();
});
