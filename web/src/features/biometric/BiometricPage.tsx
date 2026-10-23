import { useRef, useState, type SyntheticEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import {
  type BiometricProfileResponse,
} from "@wallet/contracts/biometric";
import { passwordSchema } from "@wallet/contracts/onboarding";
import { ApiError } from "../../lib/apiClient";
import { useSession } from "../../lib/session";
import { PageShell } from "../../ui/PageShell";
import { StatusMessage } from "../../ui/StatusMessage";
import { TextField } from "../../ui/TextField";
import { enterWithBiometrics, fetchBiometricProfile } from "./biometric-api";
import { useCamera } from "./useCamera";

const DNI_MESSAGE = "Ingresa un DNI de 8 dígitos.";
const PASSWORD_MESSAGE = "La contraseña debe tener exactamente 6 dígitos.";
const NOT_ENABLED_MESSAGE =
  "Este DNI no tiene acceso biométrico habilitado en la demo.";
const CREDENTIALS_MESSAGE = "La contraseña es incorrecta.";
const RATE_LIMITED_MESSAGE = "Demasiados intentos. Espera unos minutos.";
const CONNECTION_MESSAGE = "No se pudo conectar con el servicio local.";
const CAMERA_MESSAGES = {
  idle: "",
  starting: "Abriendo la cámara…",
  ready: "Encuadra tu rostro y presiona el botón.",
  denied: "Permite el acceso a la cámara en tu navegador para continuar.",
  unsupported: "Este navegador no permite usar la cámara.",
} as const;

function describeError(error: Error): string {
  if (!(error instanceof ApiError)) return CONNECTION_MESSAGE;
  if (error.code === "BIOMETRIC_NOT_ENABLED") return NOT_ENABLED_MESSAGE;
  if (error.code === "INVALID_CREDENTIALS") return CREDENTIALS_MESSAGE;
  if (error.code === "RATE_LIMITED") return RATE_LIMITED_MESSAGE;
  return error.message;
}

export function BiometricPage() {
  const [documentNumber, setDocumentNumber] = useState("");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState<BiometricProfileResponse>();
  const [fieldError, setFieldError] = useState<string>();
  const { signIn } = useSession();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const camera = useCamera(videoRef, profile !== undefined);

  const lookup = useMutation({
    mutationFn: fetchBiometricProfile,
    onSuccess: setProfile,
  });
  const enter = useMutation({
    mutationFn: enterWithBiometrics,
    onSuccess: (session) => {
      signIn({
        token: session.accessToken,
        expiresAt: session.expiresAt,
        user: session.user,
      });
      void navigate("/billetera", { replace: true });
    },
    onError: () => {
      setPassword("");
    },
  });

  function handleLookup(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lookup.isPending) return;
    const dni = documentNumber.trim();
    if (!/^[0-9]{8}$/.test(dni)) {
      setFieldError(DNI_MESSAGE);
      return;
    }
    setFieldError(undefined);
    lookup.mutate(dni);
  }

  function handleEnter(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || enter.isPending) return;
    if (!passwordSchema.safeParse(password).success) {
      setFieldError(PASSWORD_MESSAGE);
      return;
    }
    const faceImage = camera.captureFrame();
    if (!faceImage) {
      setFieldError(CAMERA_MESSAGES[camera.state]);
      return;
    }
    setFieldError(undefined);
    enter.mutate({
      documentNumber: profile.documentNumber,
      password,
      faceImage,
    });
  }

  function reset() {
    setProfile(undefined);
    setPassword("");
    setFieldError(undefined);
    lookup.reset();
    enter.reset();
  }

  if (!profile) {
    return (
      <PageShell title="Acceso biométrico">
        <p>Ingresa tu DNI. Tus demás datos se cargan automáticamente.</p>
        <form onSubmit={handleLookup} noValidate aria-busy={lookup.isPending}>
          <TextField
            id="biometric-dni"
            label="DNI"
            inputMode="numeric"
            autoComplete="off"
            value={documentNumber}
            error={fieldError}
            onChange={(event) => {
              setDocumentNumber(event.target.value);
            }}
          />
          {lookup.isError ? (
            <StatusMessage tone="error">{describeError(lookup.error)}</StatusMessage>
          ) : null}
          <div className="form-actions">
            <button type="submit" disabled={lookup.isPending}>
              {lookup.isPending ? "Buscando…" : "Continuar"}
            </button>
            <Link className="button-link button-secondary" to="/ingresar">
              Usar contraseña
            </Link>
          </div>
        </form>
      </PageShell>
    );
  }

  const isUnavailable = camera.state === "denied" || camera.state === "unsupported";
  return (
    <PageShell title="Acceso biométrico">
      <section className="card" aria-label="Datos precargados">
        <h2>{profile.fullName}</h2>
        <dl className="profile-data">
          <dt>DNI</dt>
          <dd>{profile.documentNumber}</dd>
          <dt>Celular</dt>
          <dd>{profile.phone}</dd>
          <dt>Correo</dt>
          <dd>{profile.email}</dd>
        </dl>
        <p>
          {profile.hasAccount
            ? "Ya tienes cuenta: verifica tu rostro para ingresar."
            : "Verifica tu rostro y crea tu contraseña para abrir tu cuenta."}
        </p>
      </section>
      <form onSubmit={handleEnter} noValidate aria-busy={enter.isPending}>
        <div className="camera-frame">
          <video ref={videoRef} muted playsInline aria-label="Vista de tu cámara" />
        </div>
        <StatusMessage tone={isUnavailable ? "error" : "info"}>
          {CAMERA_MESSAGES[camera.state]}
        </StatusMessage>
        <TextField
          id="biometric-password"
          label={
            profile.hasAccount ? "Contraseña de 6 dígitos" : "Crea tu contraseña de 6 dígitos"
          }
          type="password"
          inputMode="numeric"
          autoComplete={profile.hasAccount ? "current-password" : "new-password"}
          value={password}
          error={fieldError}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
        />
        {enter.isError ? (
          <StatusMessage tone="error">{describeError(enter.error)}</StatusMessage>
        ) : null}
        <div className="form-actions">
          <button type="submit" disabled={enter.isPending || camera.state !== "ready"}>
            {enter.isPending
              ? "Verificando…"
              : profile.hasAccount
                ? "Verificar rostro e ingresar"
                : "Verificar rostro y crear cuenta"}
          </button>
          <button type="button" className="button-secondary" onClick={reset}>
            Cambiar DNI
          </button>
        </div>
      </form>
    </PageShell>
  );
}
