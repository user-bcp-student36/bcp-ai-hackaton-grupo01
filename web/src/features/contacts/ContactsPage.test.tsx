// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router";
import { ApiError } from "../../lib/apiClient";
import type { ContactsClient, ContactView } from "./contactsClient";
import { ContactsPage } from "./ContactsPage";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderPage(client: ContactsClient) {
  return render(
    <MemoryRouter>
      <ContactsPage client={client} />
    </MemoryRouter>,
  );
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
  await userEvent.click(screen.getByRole("button", { name: "Buscar" }));
}

test("lookup finds a recipient and saves it as a contact", async () => {
  const addContact = vi.fn(() => Promise.resolve(SAVED));
  const client = fakeClient({
    lookupRecipient: vi.fn(() =>
      Promise.resolve({ phone: "+51999999999", walletId: "w1" }),
    ),
    addContact,
  });
  renderPage(client);

  await searchPhone("999999999");
  expect(await screen.findByText("Destinatario encontrado: +51999999999")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Guardar contacto" }));

  expect(addContact).toHaveBeenCalledWith("w1");
  expect(await screen.findByText("Contacto guardado.")).toBeVisible();
});

test("a missing recipient shows feedback and selects nobody", async () => {
  renderPage(fakeClient());

  await searchPhone("999999999");

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No encontramos un destinatario activo con ese número.",
  );
  expect(screen.queryByRole("button", { name: "Guardar contacto" })).not.toBeInTheDocument();
  expect(screen.queryByText(/Destinatario seleccionado/)).not.toBeInTheDocument();
});

test("an unexpected lookup failure shows the generic message", async () => {
  const client = fakeClient({
    lookupRecipient: vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
  });
  renderPage(client);

  await searchPhone("999999999");

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No se pudo completar la acción. Intenta de nuevo.",
  );
});

test("an empty contact list shows the empty state", async () => {
  renderPage(fakeClient());

  expect(await screen.findByText("Aún no tienes contactos guardados.")).toBeVisible();
});

test("a failed contact list can be retried", async () => {
  const listContacts = vi
    .fn<ContactsClient["listContacts"]>()
    .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockResolvedValueOnce([SAVED]);
  renderPage(fakeClient({ listContacts }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No se pudieron cargar tus contactos.",
  );
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  expect(await screen.findByText(SAVED.phone)).toBeVisible();
});

test("selecting a saved contact makes it the recipient", async () => {
  renderPage(fakeClient({ listContacts: () => Promise.resolve([SAVED]) }));

  await userEvent.click(await screen.findByRole("button", { name: `Seleccionar ${SAVED.phone}` }));

  expect(screen.getByText(`Destinatario seleccionado: ${SAVED.phone}`)).toBeVisible();
});

test("saving an existing contact keeps a single list entry", async () => {
  const client = fakeClient({
    listContacts: () => Promise.resolve([SAVED]),
    lookupRecipient: () => Promise.resolve({ phone: SAVED.phone, walletId: SAVED.walletId }),
  });
  renderPage(client);
  await screen.findByRole("list", { name: "Mis contactos" });

  await searchPhone("999999999");
  await userEvent.click(await screen.findByRole("button", { name: "Guardar contacto" }));

  await waitFor(() => {
    expect(screen.getByText("Contacto guardado.")).toBeVisible();
  });
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
});
