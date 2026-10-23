import { useCallback, useRef, useState, type SyntheticEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QR_PAYLOAD_PREFIX } from "@wallet/contracts/qr";
import { ApiError } from "../../lib/apiClient";
import { useSession } from "../../lib/session";
import { PageShell } from "../../ui/PageShell";
import { Illustration } from "../../ui/Illustration";
import { StatusMessage } from "../../ui/StatusMessage";
import { TextField } from "../../ui/TextField";
import { createContactsClient } from "../contacts/contactsClient";
import { resolveQr } from "./qr-api";
import { useQrScanner } from "./useQrScanner";

const ERROR_MESSAGES: Partial<Record<string, string>> = {
  VALIDATION_ERROR: "Ese texto no es un código QR de Altoque.",
  QR_NOT_FOUND: "No encontramos ese código QR.",
  QR_EXPIRED: "El código QR venció. Pide uno nuevo.",
  SELF_QR: "No puedes pagar tu propio código QR.",
  UNAUTHENTICATED: "Tu sesión venció. Ingresa de nuevo.",
  RATE_LIMITED: "Demasiados intentos. Intenta de nuevo en unos minutos.",
};
const GENERIC_ERROR = "No se pudo leer el código QR. Intenta de nuevo.";
const CAMERA_FALLBACK =
  "No pudimos usar la cámara. Pega el texto del código QR para continuar.";

export function ScanQrPage() {
  const { session } = useSession();
  if (!session) {
    return (
      <PageShell title="Pagar con QR">
        <StatusMessage tone="info">
          Inicia sesión para pagar con QR.
        </StatusMessage>
        <Link className="button-link" to="/ingresar">
          Ingresar
        </Link>
      </PageShell>
    );
  }
  return <ScanQrForm token={session.token} userId={session.user.id} />;
}

function ScanQrForm({ token, userId }: { token: string; userId: string }) {
  const [payload, setPayload] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Saving the receiver makes them payable; the payment form then opens prefilled.
  const resolve = useMutation({
    mutationFn: async (text: string) => {
      const { qr } = await resolveQr(text.trim(), token);
      await createContactsClient(token).addContact(qr.recipientWalletId);
      return qr;
    },
    onSuccess: (qr) => {
      queryClient.removeQueries({ queryKey: ["contacts", userId] });
      const params = new URLSearchParams({ to: qr.recipientWalletId });
      if (qr.amountCents !== null) params.set("amount", String(qr.amountCents));
      void navigate(`/pagos?${params.toString()}`);
    },
  });
  const { mutate } = resolve;

  const handleDetect = useCallback(
    (rawValue: string) => {
      setIsScanning(false);
      setPayload(rawValue);
      mutate(rawValue);
    },
    [mutate],
  );
  const scanner = useQrScanner(videoRef, isScanning, handleDetect);

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    mutate(payload);
  }

  const failure = resolve.error
    ? resolve.error instanceof ApiError
      ? (ERROR_MESSAGES[resolve.error.code] ?? GENERIC_ERROR)
      : GENERIC_ERROR
    : undefined;
  const cameraFailed = scanner === "denied" || scanner === "unsupported";

  return (
    <PageShell title="Pagar con QR">
      <Illustration name="scan" />
      {isScanning && !cameraFailed ? (
        <div className="camera-frame is-rear">
          <video
            ref={videoRef}
            muted
            playsInline
            aria-label="Cámara para leer el QR"
          />
        </div>
      ) : null}
      {cameraFailed ? (
        <StatusMessage tone="info">{CAMERA_FALLBACK}</StatusMessage>
      ) : null}
      <button
        type="button"
        onClick={() => {
          setIsScanning((current) => !current);
        }}
      >
        {isScanning ? "Cerrar cámara" : "Escanear con la cámara"}
      </button>
      <form onSubmit={handleSubmit} noValidate>
        <TextField
          id="qr-payload"
          label="O pega el texto del código QR"
          placeholder={`${QR_PAYLOAD_PREFIX}…`}
          autoComplete="off"
          value={payload}
          onChange={(event) => {
            setPayload(event.target.value);
          }}
        />
        <button
          type="submit"
          disabled={resolve.isPending || payload.trim() === ""}
        >
          {resolve.isPending ? "Leyendo…" : "Continuar al pago"}
        </button>
      </form>
      {failure ? <StatusMessage tone="error">{failure}</StatusMessage> : null}
    </PageShell>
  );
}
