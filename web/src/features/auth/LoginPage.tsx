import { useState, type SyntheticEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { loginInputSchema } from "@wallet/contracts/auth";
import type { ZodError } from "zod";
import { ApiError } from "../../lib/apiClient";
import { useSession } from "../../lib/session";
import { PageShell } from "../../ui/PageShell";
import { SelectField } from "../../ui/SelectField";
import { StatusMessage } from "../../ui/StatusMessage";
import { TextField } from "../../ui/TextField";
import { loginAccount } from "./auth-api";

type LoginFormValues = {
  documentType: "DNI" | "CE";
  documentNumber: string;
  password: string;
};
type LoginField = keyof LoginFormValues;
type LoginFieldErrors = Partial<Record<LoginField, string>>;

const INITIAL_VALUES: LoginFormValues = {
  documentType: "DNI",
  documentNumber: "",
  password: "",
};
const PASSWORD_MESSAGE = "La contraseña debe tener exactamente 6 dígitos.";
const CREDENTIALS_MESSAGE = "Documento o contraseña incorrectos.";
const RATE_LIMITED_MESSAGE =
  "Demasiados intentos. Espera unos minutos antes de volver a intentar.";
const VALIDATION_MESSAGE = "Revisa los datos ingresados.";
const CONNECTION_MESSAGE = "No se pudo conectar con el servicio local.";

function toFieldErrors(error: ZodError): LoginFieldErrors {
  const errors: LoginFieldErrors = {};
  for (const issue of error.issues) {
    if (issue.path[0] === "documentNumber") {
      errors.documentNumber = issue.message;
    }
    if (issue.path[0] === "password") errors.password = PASSWORD_MESSAGE;
  }
  return errors;
}

function describeLoginError(error: Error): string {
  if (!(error instanceof ApiError)) return CONNECTION_MESSAGE;
  if (error.code === "INVALID_CREDENTIALS") return CREDENTIALS_MESSAGE;
  if (error.code === "RATE_LIMITED") return RATE_LIMITED_MESSAGE;
  if (error.code === "VALIDATION_ERROR") return VALIDATION_MESSAGE;
  return error.message;
}

export function LoginPage() {
  const [values, setValues] = useState<LoginFormValues>(INITIAL_VALUES);
  const [clientErrors, setClientErrors] = useState<LoginFieldErrors>({});
  const { notice, signIn } = useSession();
  const navigate = useNavigate();
  const login = useMutation({
    mutationFn: loginAccount,
    onSuccess: (session) => {
      signIn({
        token: session.accessToken,
        expiresAt: session.expiresAt,
        user: session.user,
      });
      void navigate("/billetera", { replace: true });
    },
    onError: () => {
      setValues((current) => ({ ...current, password: "" }));
    },
  });

  function setField<K extends LoginField>(field: K, value: LoginFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (login.isPending) return;
    const parsed = loginInputSchema.safeParse(values);
    if (!parsed.success) {
      setClientErrors(toFieldErrors(parsed.error));
      return;
    }
    setClientErrors({});
    login.mutate(parsed.data);
  }

  return (
    <PageShell title="Ingresar">
      {notice ? <StatusMessage tone="info">{notice}</StatusMessage> : null}
      <p>Ingresa con tu documento y tu contraseña de 6 dígitos.</p>
      <form onSubmit={handleSubmit} noValidate aria-busy={login.isPending}>
        <SelectField
          id="documentType"
          label="Tipo de documento"
          value={values.documentType}
          onChange={(event) => {
            setField("documentType", event.target.value === "CE" ? "CE" : "DNI");
          }}
        >
          <option value="DNI">DNI</option>
          <option value="CE">CE (carné de extranjería)</option>
        </SelectField>
        <TextField
          id="documentNumber"
          label="Número de documento"
          value={values.documentNumber}
          error={clientErrors.documentNumber}
          autoComplete="off"
          onChange={(event) => {
            setField("documentNumber", event.target.value);
          }}
        />
        <TextField
          id="password"
          label="Contraseña de 6 dígitos"
          type="password"
          inputMode="numeric"
          value={values.password}
          error={clientErrors.password}
          autoComplete="current-password"
          onChange={(event) => {
            setField("password", event.target.value);
          }}
        />
        {login.isError ? (
          <StatusMessage tone="error">
            {describeLoginError(login.error)}
          </StatusMessage>
        ) : null}
        <div className="form-actions">
          <button type="submit" disabled={login.isPending}>
            {login.isPending ? "Ingresando…" : "Ingresar"}
          </button>
          <Link to="/registro">Crear cuenta</Link>
        </div>
      </form>
    </PageShell>
  );
}
