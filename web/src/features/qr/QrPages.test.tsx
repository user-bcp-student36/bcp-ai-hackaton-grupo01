// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UserView } from "@wallet/contracts/onboarding";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter, useLocation } from "react-router";
import {
  SessionProvider,
  useSession,
  type ActiveSession,
} from "../../lib/session";
import { ReceiveQrPage } from "./ReceiveQrPage";
import { ScanQrPage } from "./ScanQrPage";

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn(() => Promise.resolve("data:image/png;base64,QR")),
  },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const TIMESTAMP = "2026-10-23T10:00:00.000Z";
const FAR_FUTURE = "2099-01-01T00:00:00.000Z";
const RECEIVER_WALLET = "wallet-receiver";

const user: UserView = {
  id: "ana",
  documentType: "DNI",
  documentNumber: "12345678",
  phone: "+51912345678",
  email: "ana@example.com",
  walletId: "wallet-ana",
  kycStatus: "activa",
  active: true,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
};
const session: ActiveSession = {
  token: "token-ana",
  expiresAt: FAR_FUTURE,
  user,
};

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function SignedIn({ children }: { children: React.ReactNode }) {
  const { session: current, signIn } = useSession();
  return current ? (
    children
  ) : (
    <button
      type="button"
      onClick={() => {
        signIn(session);
      }}
    >
      Entrar
    </button>
  );
}

function LocationProbe() {
  const location = useLocation();
  return <p>{location.pathname + location.search}</p>;
}

async function renderSignedIn(
  page: React.ReactNode,
  fetchMock: ReturnType<typeof vi.fn>,
) {
  vi.stubGlobal("fetch", fetchMock);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SessionProvider>
        <MemoryRouter>
          <SignedIn>
            {page}
            <LocationProbe />
          </SignedIn>
        </MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
}

test("a fixed-amount QR shows the image and the amount", async () => {
  const fetchMock = vi.fn(() =>
    jsonResponse(201, {
      qr: {
        id: "q1",
        payload: "altoque-qr:q1",
        amountCents: 1500,
        expiresAt: FAR_FUTURE,
      },
    }),
  );
  await renderSignedIn(<ReceiveQrPage />, fetchMock);

  await userEvent.type(screen.getByLabelText(/Monto a cobrar/), "15");
  await userEvent.click(screen.getByRole("button", { name: "Generar QR" }));

  expect(
    await screen.findByAltText("Código QR para cobrar"),
  ).toBeInTheDocument();
  expect(screen.getByText("Monto: S/ 15.00")).toBeInTheDocument();
  const body = JSON.parse(
    (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
      .body as string,
  ) as unknown;
  expect(body).toEqual({ amountCents: 1500 });
});

test("an open-amount QR says the payer chooses", async () => {
  await renderSignedIn(
    <ReceiveQrPage />,
    vi.fn(() =>
      jsonResponse(201, {
        qr: {
          id: "q2",
          payload: "altoque-qr:q2",
          amountCents: null,
          expiresAt: FAR_FUTURE,
        },
      }),
    ),
  );

  await userEvent.click(screen.getByRole("button", { name: "Generar QR" }));

  expect(
    await screen.findByText(/el pagador elige cuánto/),
  ).toBeInTheDocument();
});

test("an invalid receive amount is rejected before calling the API", async () => {
  const fetchMock = vi.fn();
  await renderSignedIn(<ReceiveQrPage />, fetchMock);

  await userEvent.type(screen.getByLabelText(/Monto a cobrar/), "0");
  await userEvent.click(screen.getByRole("button", { name: "Generar QR" }));

  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("pasting a fixed-amount QR saves the receiver and opens the prefilled payment", async () => {
  const fetchMock = vi.fn((url: string) =>
    url.endsWith("/qrs/resolve")
      ? jsonResponse(200, {
          qr: {
            id: "q1",
            recipientWalletId: RECEIVER_WALLET,
            recipientPhone: "+51987000001",
            amountCents: 2050,
            expiresAt: FAR_FUTURE,
          },
        })
      : jsonResponse(201, {
          contact: {
            id: "c1",
            phone: "+51987000001",
            displayName: "Andrés K***",
            walletId: RECEIVER_WALLET,
            createdAt: TIMESTAMP,
          },
        }),
  );
  await renderSignedIn(<ScanQrPage />, fetchMock);

  await userEvent.type(screen.getByLabelText(/pega el texto/), "altoque-qr:q1");
  await userEvent.click(
    screen.getByRole("button", { name: "Continuar al pago" }),
  );

  expect(
    await screen.findByText(`/pagos?to=${RECEIVER_WALLET}&amount=2050`),
  ).toBeInTheDocument();
});

test("pasting an open-amount QR opens the payment without an amount", async () => {
  const fetchMock = vi.fn((url: string) =>
    url.endsWith("/qrs/resolve")
      ? jsonResponse(200, {
          qr: {
            id: "q2",
            recipientWalletId: RECEIVER_WALLET,
            recipientPhone: "+51987000001",
            amountCents: null,
            expiresAt: FAR_FUTURE,
          },
        })
      : jsonResponse(201, {
          contact: {
            id: "c1",
            phone: "+51987000001",
            displayName: "Andrés K***",
            walletId: RECEIVER_WALLET,
            createdAt: TIMESTAMP,
          },
        }),
  );
  await renderSignedIn(<ScanQrPage />, fetchMock);

  await userEvent.type(screen.getByLabelText(/pega el texto/), "altoque-qr:q2");
  await userEvent.click(
    screen.getByRole("button", { name: "Continuar al pago" }),
  );

  expect(
    await screen.findByText(`/pagos?to=${RECEIVER_WALLET}`),
  ).toBeInTheDocument();
});

test("an expired QR shows a clear message and stays on the page", async () => {
  await renderSignedIn(
    <ScanQrPage />,
    vi.fn(() =>
      jsonResponse(410, {
        error: { code: "QR_EXPIRED", message: "El código QR venció." },
      }),
    ),
  );

  await userEvent.type(
    screen.getByLabelText(/pega el texto/),
    "altoque-qr:old",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Continuar al pago" }),
  );

  expect(
    await screen.findByText("El código QR venció. Pide uno nuevo."),
  ).toBeInTheDocument();
});

test("without camera support the user is told to paste the QR text", async () => {
  await renderSignedIn(<ScanQrPage />, vi.fn());

  await userEvent.click(
    screen.getByRole("button", { name: "Escanear con la cámara" }),
  );

  expect(
    await screen.findByText(/Pega el texto del código QR/),
  ).toBeInTheDocument();
  expect(screen.getByLabelText(/pega el texto/)).toBeInTheDocument();
});
