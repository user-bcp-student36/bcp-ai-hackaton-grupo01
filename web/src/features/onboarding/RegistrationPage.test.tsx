// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import {
  registrationResponseSchema,
  type UserView,
} from "@wallet/contracts/onboarding";
import { sessionResponseSchema } from "@wallet/contracts/auth";
import { ApiError } from "../../lib/apiClient";
import { SessionProvider } from "../../lib/session";
import { RegistrationPage } from "./RegistrationPage";
import { resolveRegistrationOutcome } from "./registration-outcome";
import {
  describeRegistrationError,
  fieldErrorsFromIssues,
} from "./registration-feedback";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const TIMESTAMP = "2026-10-23T17:00:00.000Z";

type FormInput = {
  documentType: "DNI" | "CE";
  documentNumber: string;
  phone: string;
  email: string;
  password: string;
};

const VALID_DNI: FormInput = {
  documentType: "DNI",
  documentNumber: "12345678",
  phone: "912345678",
  email: "Ana@Example.com",
  password: "012345",
};

const VALID_CE: FormInput = {
  documentType: "CE",
  documentNumber: "ab1234567",
  phone: "912345678",
  email: "carlos@example.com",
  password: "000123",
};

function registeredUser(overrides: Partial<UserView> = {}): UserView {
  return {
    id: "user-1",
    documentType: "DNI",
    documentNumber: "12345678",
    phone: "+51912345678",
    email: "ana@example.com",
    walletId: "wallet-1",
    kycStatus: "activa",
    active: true,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

/** Contract-conforming 201 body, parsed by the shared schema. */
function createdBody(user: UserView): unknown {
  return registrationResponseSchema.parse({ user });
}

function jsonResponse(body: unknown, status: number): Promise<Response> {
  return Promise.resolve(Response.json(body, { status }));
}

function stubFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn<typeof fetch>(() => impl());
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof stubFetch>): unknown {
  const body = fetchMock.mock.calls[0]?.[1]?.body;
  if (typeof body !== "string") throw new Error("Expected a JSON string body");
  return JSON.parse(body);
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <MemoryRouter>
          <Routes>
            <Route path="/" element={<RegistrationPage />} />
            <Route path="/billetera" element={<h1>Pantalla de billetera</h1>} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>,
  );
}

async function fillForm(user: UserEvent, input: FormInput) {
  await user.selectOptions(
    screen.getByLabelText("Tipo de documento"),
    input.documentType,
  );
  await user.type(
    screen.getByLabelText("Número de documento"),
    input.documentNumber,
  );
  await user.type(screen.getByLabelText("Nombre completo"), "Ana Pérez");
  await user.type(screen.getByLabelText("Celular (Perú)"), input.phone);
  await user.type(screen.getByLabelText("Correo electrónico"), input.email);
  await user.type(
    screen.getByLabelText("Contraseña de 6 dígitos"),
    input.password,
  );
}

async function submit(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: "Crear cuenta" }));
}

function sessionBody(user: UserView): unknown {
  return sessionResponseSchema.parse({
    accessToken: "token-1",
    tokenType: "Bearer",
    expiresAt: "2026-10-23T18:00:00.000Z",
    user,
  });
}

test("Registers a DNI with normalized data and signs the user in without asking to log in", async () => {
  const fetchMock = vi.fn<typeof fetch>((input) =>
    typeof input === "string" && input.endsWith("/sessions")
      ? jsonResponse(sessionBody(registeredUser()), 200)
      : jsonResponse(createdBody(registeredUser()), 201),
  );
  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup();
  renderPage();

  await fillForm(user, VALID_DNI);
  await submit(user);

  expect(
    await screen.findByRole("heading", { name: "Pantalla de billetera" }),
  ).toBeVisible();
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringMatching(/\/users$/),
    expect.objectContaining({ method: "POST" }),
  );
  expect(sentBody(fetchMock)).toEqual({
    documentType: "DNI",
    documentNumber: "12345678",
    fullName: "Ana Pérez",
    phone: "+51912345678",
    email: "ana@example.com",
    password: "012345",
  });
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringMatching(/\/sessions$/),
    expect.objectContaining({ method: "POST" }),
  );
});

test("Falls back to the active result with a login link when the automatic sign-in fails", async () => {
  stubFetch(() => jsonResponse(createdBody(registeredUser()), 201));
  const user = userEvent.setup();
  renderPage();

  await fillForm(user, VALID_DNI);
  await submit(user);

  expect(
    await screen.findByRole("heading", { name: "Cuenta activa" }),
  ).toHaveFocus();
  expect(
    screen.getByRole("link", { name: "Ingresar para ver mi billetera" }),
  ).toHaveAttribute("href", "/ingresar");
});

test("Registers a CE with a leading-zero password and shows pending without a wallet", async () => {
  const fetchMock = stubFetch(() =>
    jsonResponse(
      createdBody(
        registeredUser({
          documentType: "CE",
          documentNumber: "AB1234567",
          phone: "+51912345678",
          email: "carlos@example.com",
          walletId: null,
          kycStatus: "pendiente",
          active: false,
        }),
      ),
      201,
    ),
  );
  const user = userEvent.setup();
  renderPage();

  await fillForm(user, VALID_CE);
  await submit(user);

  expect(
    await screen.findByRole("heading", { name: "Verificación pendiente" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "Cuenta activa" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Ingresar para ver mi billetera" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Ingresar para ver mi estado" }),
  ).toBeVisible();
  expect(sentBody(fetchMock)).toEqual({
    documentType: "CE",
    documentNumber: "AB1234567",
    fullName: "Ana Pérez",
    phone: "+51912345678",
    email: "carlos@example.com",
    password: "000123",
  });
});

test("Shows a rejected verification without a wallet", async () => {
  stubFetch(() =>
    jsonResponse(
      createdBody(
        registeredUser({
          walletId: null,
          kycStatus: "rechazada",
          active: false,
        }),
      ),
      201,
    ),
  );
  const user = userEvent.setup();
  renderPage();

  await fillForm(user, VALID_DNI);
  await submit(user);

  expect(
    await screen.findByRole("heading", { name: "Verificación rechazada" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "Cuenta activa" }),
  ).not.toBeInTheDocument();
});

test("Blocks a six-character password with five digits before calling the API", async () => {
  const fetchMock = stubFetch(() => jsonResponse({}, 500));
  const user = userEvent.setup();
  renderPage();

  await fillForm(user, { ...VALID_DNI, password: "12345" });
  await submit(user);

  const password = screen.getByLabelText("Contraseña de 6 dígitos");
  expect(password).toHaveAttribute("aria-invalid", "true");
  expect(password).toHaveAccessibleDescription(
    "La contraseña debe tener exactamente 6 dígitos.",
  );
  expect(fetchMock).not.toHaveBeenCalled();
});

test("Maps server 400 details to the matching field without a success view", async () => {
  stubFetch(() =>
    jsonResponse(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Datos inválidos.",
          details: [{ field: "email", code: "invalid_format" }],
        },
      },
      400,
    ),
  );
  const user = userEvent.setup();
  renderPage();

  await fillForm(user, VALID_DNI);
  await submit(user);

  expect(
    await screen.findByText("Revisa los campos marcados."),
  ).toHaveAttribute("role", "alert");
  expect(screen.getByLabelText("Correo electrónico")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(
    screen.queryByRole("heading", { name: "Cuenta activa" }),
  ).not.toBeInTheDocument();
});

test("Shows a conflict without naming which field is duplicated", async () => {
  stubFetch(() =>
    jsonResponse(
      {
        error: {
          code: "USER_ALREADY_EXISTS",
          message: "La cuenta ya existe.",
        },
      },
      409,
    ),
  );
  const user = userEvent.setup();
  renderPage();

  await fillForm(user, VALID_DNI);
  await submit(user);

  expect(
    await screen.findByText("Ya existe una cuenta registrada con estos datos."),
  ).toHaveAttribute("role", "alert");
  expect(screen.getByLabelText("Correo electrónico")).not.toHaveAttribute(
    "aria-invalid",
  );
  expect(screen.getByRole("button", { name: "Crear cuenta" })).toBeEnabled();
});

test("Shows a rate-limit message and keeps the form usable", async () => {
  stubFetch(() =>
    jsonResponse(
      { error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes." } },
      429,
    ),
  );
  const user = userEvent.setup();
  renderPage();

  await fillForm(user, VALID_DNI);
  await submit(user);

  expect(
    await screen.findByText(
      "Demasiados intentos. Espera un momento antes de volver a intentarlo.",
    ),
  ).toHaveAttribute("role", "alert");
  expect(screen.getByRole("button", { name: "Crear cuenta" })).toBeEnabled();
});

test("A technical 500 with null walletId never shows success and can be retried", async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementationOnce(() =>
      jsonResponse(
        {
          error: { code: "INTERNAL_ERROR", message: "Error interno." },
          walletId: null,
        },
        500,
      ),
    )
    .mockImplementationOnce(() =>
      jsonResponse(createdBody(registeredUser()), 201),
    );
  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup();
  renderPage();

  await fillForm(user, VALID_DNI);
  await submit(user);

  expect(
    await screen.findByText(
      "Tu registro no se completó por un error técnico. Intenta de nuevo en unos minutos.",
    ),
  ).toHaveAttribute("role", "alert");
  expect(
    screen.queryByRole("heading", { name: "Cuenta activa" }),
  ).not.toBeInTheDocument();

  await submit(user);

  expect(
    await screen.findByRole("heading", { name: "Cuenta activa" }),
  ).toBeVisible();
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

test("A network failure shows a technical error and no result", async () => {
  stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
  const user = userEvent.setup();
  renderPage();

  await fillForm(user, VALID_DNI);
  await submit(user);

  expect(
    await screen.findByText(
      "No pudimos completar el registro. Revisa tu conexión e intenta de nuevo.",
    ),
  ).toHaveAttribute("role", "alert");
  expect(
    screen.queryByRole("heading", { name: "Cuenta activa" }),
  ).not.toBeInTheDocument();
});

test("An activa response without a wallet is never shown as active", async () => {
  stubFetch(() =>
    jsonResponse(
      createdBody(registeredUser({ walletId: null, active: false })),
      201,
    ),
  );
  const user = userEvent.setup();
  renderPage();

  await fillForm(user, VALID_DNI);
  await submit(user);

  expect(
    await screen.findByText(
      "No pudimos confirmar el resultado del registro. Revisa tu conexión e intenta de nuevo.",
    ),
  ).toHaveAttribute("role", "alert");
  expect(
    screen.queryByRole("heading", { name: "Cuenta activa" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Crear cuenta" })).toBeEnabled();
});

test("The button shows progress and is disabled while the request is in flight", async () => {
  let resolveRequest: (response: Response) => void = () => undefined;
  stubFetch(
    () =>
      new Promise<Response>((resolve) => {
        resolveRequest = resolve;
      }),
  );
  const user = userEvent.setup();
  renderPage();

  await fillForm(user, VALID_DNI);
  await submit(user);

  const pending = await screen.findByRole("button", {
    name: "Creando cuenta…",
  });
  expect(pending).toBeDisabled();

  resolveRequest(Response.json(createdBody(registeredUser()), { status: 201 }));
  expect(
    await screen.findByText("Cuenta creada. Entrando a tu billetera…"),
  ).toBeVisible();
});

test("Labels every control, shows the demo disclaimer and submits from the keyboard", async () => {
  const fetchMock = stubFetch(() =>
    jsonResponse(createdBody(registeredUser()), 201),
  );
  const user = userEvent.setup();
  renderPage();

  expect(
    screen.getByRole("combobox", { name: "Tipo de documento" }),
  ).toBeVisible();
  expect(
    screen.getByRole("textbox", { name: "Número de documento" }),
  ).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Celular (Perú)" })).toBeVisible();
  expect(
    screen.getByRole("textbox", { name: "Correo electrónico" }),
  ).toBeVisible();
  expect(screen.getByLabelText("Contraseña de 6 dígitos")).toHaveAttribute(
    "type",
    "password",
  );
  expect(
    screen.getByText(/Demo local: identidades y fondos ficticios/),
  ).toBeVisible();

  await fillForm(user, VALID_DNI);
  await user.keyboard("{Enter}");

  expect(
    await screen.findByRole("heading", { name: "Cuenta activa" }),
  ).toBeVisible();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

describe("resolveRegistrationOutcome", () => {
  const activeUser = registeredUser();

  test("activa with a wallet and active flag is the only active outcome", () => {
    expect(resolveRegistrationOutcome(activeUser)).toEqual({ kind: "active" });
  });

  test("pendiente and rechazada without a wallet are inactive outcomes", () => {
    const inactive = { ...activeUser, walletId: null, active: false };
    expect(
      resolveRegistrationOutcome({ ...inactive, kycStatus: "pendiente" }),
    ).toEqual({ kind: "pending" });
    expect(
      resolveRegistrationOutcome({ ...inactive, kycStatus: "rechazada" }),
    ).toEqual({ kind: "rejected" });
  });

  test("responses that contradict the active rule are unconfirmed", () => {
    expect(
      resolveRegistrationOutcome({
        ...activeUser,
        walletId: null,
        active: false,
      }),
    ).toEqual({ kind: "unconfirmed" });
    expect(
      resolveRegistrationOutcome({ ...activeUser, kycStatus: "pendiente" }),
    ).toEqual({ kind: "unconfirmed" });
    expect(
      resolveRegistrationOutcome({
        ...activeUser,
        kycStatus: "rechazada",
        active: false,
      }),
    ).toEqual({ kind: "unconfirmed" });
  });
});

describe("fieldErrorsFromIssues", () => {
  test("maps known field paths and ignores unknown or root paths", () => {
    expect(
      fieldErrorsFromIssues([
        { path: ["password"] },
        { path: ["unknownField"] },
        { path: [] },
      ]),
    ).toEqual({
      password: "La contraseña debe tener exactamente 6 dígitos.",
    });
  });
});

describe("describeRegistrationError", () => {
  test("network and unknown errors get a technical retry message", () => {
    expect(describeRegistrationError(new TypeError("Failed to fetch"))).toEqual(
      {
        message:
          "No pudimos completar el registro. Revisa tu conexión e intenta de nuevo.",
        fieldErrors: {},
      },
    );
  });

  test("400 maps only known detail fields", () => {
    const feedback = describeRegistrationError(
      new ApiError("VALIDATION_ERROR", "Datos inválidos.", 400, [
        { field: "phone", code: "invalid_format" },
        { field: "walletId", code: "unexpected" },
      ]),
    );
    expect(feedback.message).toBe("Revisa los campos marcados.");
    expect(Object.keys(feedback.fieldErrors)).toEqual(["phone"]);
  });

  test("409 never names a field", () => {
    const feedback = describeRegistrationError(
      new ApiError("USER_ALREADY_EXISTS", "La cuenta ya existe.", 409),
    );
    expect(feedback.fieldErrors).toEqual({});
  });

  test("unexpected statuses fall back to the technical retry message", () => {
    const feedback = describeRegistrationError(
      new ApiError("HTTP_ERROR", "No se pudo completar la solicitud.", 404),
    );
    expect(feedback.message).toBe(
      "No pudimos completar el registro. Revisa tu conexión e intenta de nuevo.",
    );
  });
});
