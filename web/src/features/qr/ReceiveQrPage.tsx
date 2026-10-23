import { useState, type SyntheticEvent } from "react";
import { amountFilter } from "../../lib/inputFilters";
import { Link } from "react-router";
import { useMutation } from "@tanstack/react-query";
import QRCode from "qrcode";
import { ApiError } from "../../lib/apiClient";
import { useSession } from "../../lib/session";
import { PageShell } from "../../ui/PageShell";
import { Illustration } from "../../ui/Illustration";
import { StatusMessage } from "../../ui/StatusMessage";
import { TextField } from "../../ui/TextField";
import { formatPenCents, parsePenAmountToCents } from "../payments/amount";
import { createQr } from "./qr-api";

const QR_IMAGE_SIZE_PX = 260;

const ERROR_MESSAGES: Partial<Record<string, string>> = {
  VALIDATION_ERROR: "El monto no es válido o supera el máximo permitido.",
  UNAUTHENTICATED: "Tu sesión venció. Ingresa de nuevo.",
  RATE_LIMITED: "Demasiados intentos. Intenta de nuevo en unos minutos.",
};
const GENERIC_ERROR = "No se pudo crear el código QR. Intenta de nuevo.";

type Generated = {
  image: string;
  amountCents: number | null;
  expiresAt: string;
};

export function ReceiveQrPage() {
  const { session } = useSession();
  if (!session) {
    return (
      <PageShell title="Cobrar con QR">
        <StatusMessage tone="info">
          Inicia sesión para cobrar con QR.
        </StatusMessage>
        <Link className="button-link" to="/ingresar">
          Ingresar
        </Link>
      </PageShell>
    );
  }
  return <ReceiveQrForm token={session.token} />;
}

function ReceiveQrForm({ token }: { token: string }) {
  const [amountText, setAmountText] = useState("");
  const [amountError, setAmountError] = useState<string>();
  const [generated, setGenerated] = useState<Generated>();

  const create = useMutation({
    mutationFn: async (amountCents: number | undefined): Promise<Generated> => {
      const { qr } = await createQr({ amountCents }, token);
      const image = await QRCode.toDataURL(qr.payload, {
        width: QR_IMAGE_SIZE_PX,
        margin: 1,
      });
      return { image, amountCents: qr.amountCents, expiresAt: qr.expiresAt };
    },
    onSuccess: setGenerated,
  });

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setAmountError(undefined);
    const hasAmount = amountText.trim() !== "";
    const parsed = hasAmount ? parsePenAmountToCents(amountText) : undefined;
    if (parsed && !parsed.ok) {
      setAmountError(parsed.message);
      return;
    }
    create.mutate(parsed?.ok ? parsed.cents : undefined);
  }

  const failure = create.error
    ? create.error instanceof ApiError
      ? (ERROR_MESSAGES[create.error.code] ?? GENERIC_ERROR)
      : GENERIC_ERROR
    : undefined;

  return (
    <PageShell title="Cobrar con QR">
      <Illustration name="receive" />
      <form onSubmit={handleSubmit} noValidate>
        <TextField
          id="qr-amount"
          label="Monto a cobrar en soles (opcional)"
          inputMode="decimal"
          placeholder="Déjalo vacío para que el pagador elija"
          autoComplete="off"
          value={amountText}
          error={amountError}
          onChange={(event) => {
            setAmountText(amountFilter(event.target.value));
          }}
        />
        <button type="submit" disabled={create.isPending}>
          {create.isPending ? "Generando…" : "Generar QR"}
        </button>
      </form>
      {failure ? <StatusMessage tone="error">{failure}</StatusMessage> : null}
      {generated ? (
        <section className="qr-card" aria-label="Tu código QR">
          <img
            src={generated.image}
            alt="Código QR para cobrar"
            width={QR_IMAGE_SIZE_PX}
          />
          <p>
            {generated.amountCents === null
              ? "Monto abierto: el pagador elige cuánto."
              : `Monto: ${formatPenCents(generated.amountCents)}`}
          </p>
          <p>
            Vence a las{" "}
            {new Date(generated.expiresAt).toLocaleTimeString("es-PE")}.
          </p>
        </section>
      ) : null}
    </PageShell>
  );
}
