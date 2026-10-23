// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UserView } from "@wallet/contracts/onboarding";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter, useLocation } from "react-router";
import { ApiError } from "../../lib/apiClient";
import type { ContactsClient, ContactView } from "./contactsClient";
import { SessionProvider, useSession, type ActiveSession } from "../../lib/session";
import { ContactsPage } from "./ContactsPage";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const TIMESTAMP = "2026-10-23T10:00:00.000Z";

function sessionFor(id: string): ActiveSession {
  const user: UserView = {
    id,
    documentType: "DNI",
    documentNumber: "12345678",
    phone: "+51912345678",
    email: `${id}@example.com`,
    walletId: `wallet-${id}`,
    kycStatus: "activa",
    active: true,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
  return { token: `token-${id}`, expiresAt: "2026-10-23T12:00:00.000Z", user };
}

function SessionControls() {
  const { signIn, logout } = useSession();
  return (
    <>
      <button type="button" onClick={() => { signIn(sessionFor("ana")); }}>
        Entrar como Ana
      </button>
      <button type="button" onClick={() => { signIn(sessionFor("beto")); }}>
        Entrar como Beto
      </button>
      <button type="button" onClick={() => void logout()}>
        Salir
      </button>
    </>
  );
}

function LocationProbe() {
  const location = useLocation();
  return <p>{location.pathname + location.search}</p>;
}

function renderPage(client: ContactsClient, { signedIn = true } = {}) {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))));
  const queryClient = new QueryClient();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <MemoryRouter>
          <SessionControls />
          <LocationProbe />
          <ContactsPage client={client} />
        </MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>,
  );
  if (signedIn) {
    return userEvent.click(screen.getByRole("button", { name: "Entrar como Ana" })).then(() => view);
  }
  return Promise.resolve(view);
}

const SAVED: ContactView = {
  id: "c1",
  phone: "+51999999999",
  walletId: "w1",
  createdAt: "2026-10-23T10:00:00.000Z",
};

function fakeClient(overrides: Partial<ContactsClient> = {}): ContactsClient {
  return {
    lookupRecipient: vi.fn(() =>
      Promise.reject(new ApiError("RECIPIENT_NOT_FOUND", "x", 404)),
    ),
    addContact: vi.fn(() => Promise.resolve(SAVED)),
    listContacts: vi.fn(() => Promise.resolve([])),
    ...overrides,
  };
}

async function searchPhone(phone: string) {
  await userEvent.type(screen.getByLabelText("Celular del destinatario"), phone);
  await userEvent.click(screen.getByRole("button", { name: "Buscar y pagar" }));
}

test("a found recipient is saved and opens the payment form", async () => {
  const addContact = vi.fn(() => Promise.resolve(SAVED));
  const client = fakeClient({
    lookupRecipient: vi.fn(() =>
      Promise.resolve({ phone: "+51999999999", walletId: "w1" }),
    ),
    addContact,
  });
  await renderPage(client);

  await searchPhone("999999999");

  expect(await screen.findByText("/pagos?to=w1")).toBeVisible();
  expect(addContact).toHaveBeenCalledWith("w1");
});

test("a failed save keeps the user on contacts with feedback", async () => {
  const client = fakeClient({
    lookupRecipient: () => Promise.resolve({ phone: SAVED.phone, walletId: SAVED.walletId }),
    addContact: () => Promise.reject(new TypeError("Failed to fetch")),
  });
  await renderPage(client);

  await searchPhone("999999999");

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No se pudo completar la acción. Intenta de nuevo.",
  );
  expect(screen.getByText("/")).toBeVisible();
});

test("a missing recipient shows feedback and selects nobody", async () => {
  await renderPage(fakeClient());

  await searchPhone("999999999");

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No encontramos un destinatario activo con ese número.",
  );
  expect(screen.queryByText(/Destinatario seleccionado/)).not.toBeInTheDocument();
});

test("an unexpected lookup failure shows the generic message", async () => {
  const client = fakeClient({
    lookupRecipient: vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
  });
  await renderPage(client);

  await searchPhone("999999999");

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No se pudo completar la acción. Intenta de nuevo.",
  );
});

test("an empty contact list shows the empty state", async () => {
  await renderPage(fakeClient());

  expect(await screen.findByText("Aún no tienes contactos guardados.")).toBeVisible();
});

test("a failed contact list can be retried", async () => {
  const listContacts = vi
    .fn<ContactsClient["listContacts"]>()
    .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockResolvedValueOnce([SAVED]);
  await renderPage(fakeClient({ listContacts }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No se pudieron cargar tus contactos.",
  );
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  expect(await screen.findByText(SAVED.phone)).toBeVisible();
});

test("selecting a saved contact makes it the recipient", async () => {
  await renderPage(fakeClient({ listContacts: () => Promise.resolve([SAVED]) }));

  await userEvent.click(await screen.findByRole("button", { name: `Seleccionar ${SAVED.phone}` }));

  expect(screen.getByText(`Destinatario seleccionado: ${SAVED.phone}`)).toBeVisible();
});

test("contacts require login and send no request while signed out", async () => {
  const listContacts = vi.fn(() => Promise.resolve([]));
  await renderPage(fakeClient({ listContacts }), { signedIn: false });

  expect(screen.getByText("Inicia sesión para ver tus contactos.")).toBeVisible();
  expect(screen.getByRole("link", { name: "Ingresar" })).toHaveAttribute("href", "/ingresar");
  expect(listContacts).not.toHaveBeenCalled();
});

test("logout clears the contact query state", async () => {
  await renderPage(
    fakeClient({
      listContacts: () => Promise.resolve([SAVED]),
    }),
  );
  await userEvent.click(await screen.findByRole("button", { name: `Seleccionar ${SAVED.phone}` }));

  await userEvent.click(screen.getByRole("button", { name: "Salir" }));

  expect(await screen.findByText("Inicia sesión para ver tus contactos.")).toBeVisible();
  expect(screen.queryByText(SAVED.phone)).not.toBeInTheDocument();
  expect(screen.queryByText(/Destinatario seleccionado/)).not.toBeInTheDocument();
});

test("switching accounts discards the previous account contacts and selection", async () => {
  const listContacts = vi
    .fn<ContactsClient["listContacts"]>()
    .mockResolvedValueOnce([SAVED])
    .mockResolvedValueOnce([]);
  await renderPage(fakeClient({ listContacts }));
  await userEvent.click(await screen.findByRole("button", { name: `Seleccionar ${SAVED.phone}` }));

  await userEvent.click(screen.getByRole("button", { name: "Entrar como Beto" }));

  expect(await screen.findByText("Aún no tienes contactos guardados.")).toBeVisible();
  expect(screen.queryByText(SAVED.phone)).not.toBeInTheDocument();
  expect(screen.queryByText(/Destinatario seleccionado/)).not.toBeInTheDocument();
  expect(listContacts).toHaveBeenCalledTimes(2);
});

test("a Pagar link on each saved contact opens its payment form", async () => {
  await renderPage(fakeClient({ listContacts: () => Promise.resolve([SAVED]) }));

  expect(await screen.findByRole("link", { name: `Pagar a ${SAVED.phone}` })).toHaveAttribute(
    "href",
    "/pagos?to=w1",
  );
});
