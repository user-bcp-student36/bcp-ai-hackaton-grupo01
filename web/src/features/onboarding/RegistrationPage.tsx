import { useState, type SyntheticEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import {
  registrationInputSchema,
  type RegistrationInput,
} from "@wallet/contracts/onboarding";
import { useSession } from "../../lib/session";
import { PageShell } from "../../ui/PageShell";
import { StatusMessage } from "../../ui/StatusMessage";
import { loginAccount } from "../auth/auth-api";
import { RegistrationForm } from "./RegistrationForm";
import { RegistrationResult } from "./RegistrationResult";
import { useRegisterUser } from "./useRegisterUser";
import {
  INITIAL_VALUES,
  UNCONFIRMED_FEEDBACK,
  describeRegistrationError,
  fieldErrorsFromIssues,
  type FieldErrors,
  type RegistrationField,
  type RegistrationFeedback,
  type RegistrationFormValues,
} from "./registration-feedback";
import {
  resolveRegistrationOutcome,
  type ConfirmedOutcome,
} from "./registration-outcome";

export function RegistrationPage() {
  const [values, setValues] = useState<RegistrationFormValues>(INITIAL_VALUES);
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const register = useRegisterUser();
  const { signIn } = useSession();
  const navigate = useNavigate();
  // The user just proved their credentials by registering, so sign in for them.
  const autoLogin = useMutation({
    mutationFn: loginAccount,
    onSuccess: (session) => {
      signIn({
        token: session.accessToken,
        expiresAt: session.expiresAt,
        user: session.user,
      });
      void navigate("/billetera", { replace: true });
    },
  });

  function setField<K extends RegistrationField>(
    field: K,
    value: RegistrationFormValues[K],
  ) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function startAutoLogin(input: RegistrationInput) {
    autoLogin.mutate({
      documentType: input.documentType,
      documentNumber: input.documentNumber,
      password: input.password,
    });
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (register.isPending) return;
    const parsed = registrationInputSchema.safeParse(values);
    if (!parsed.success) {
      setClientErrors(fieldErrorsFromIssues(parsed.error.issues));
      return;
    }
    setClientErrors({});
    register.mutate(parsed.data, {
      onSuccess: (response) => {
        if (resolveRegistrationOutcome(response.user).kind !== "unconfirmed") {
          startAutoLogin(parsed.data);
        }
      },
    });
  }

  const outcome = register.data
    ? resolveRegistrationOutcome(register.data.user)
    : undefined;
  const confirmed: ConfirmedOutcome | undefined =
    outcome && outcome.kind !== "unconfirmed" ? outcome : undefined;

  let feedback: RegistrationFeedback | undefined;
  if (register.isError) {
    feedback = describeRegistrationError(register.error);
  } else if (outcome?.kind === "unconfirmed") {
    feedback = UNCONFIRMED_FEEDBACK;
  }

  const isSigningIn = autoLogin.isPending || autoLogin.isSuccess;

  return (
    <PageShell title="Crear cuenta">
      {confirmed && isSigningIn ? (
        <StatusMessage tone="success">
          Cuenta creada. Entrando a tu billetera…
        </StatusMessage>
      ) : confirmed ? (
        <RegistrationResult outcome={confirmed} />
      ) : (
        <>
          <p>
            Registra una identidad ficticia para la demo. La verificación de
            identidad es simulada.
          </p>
          <p>
            <Link className="button-link button-secondary" to="/biometria">
              Registrarme con biometría
            </Link>
          </p>
          <RegistrationForm
            values={values}
            errors={{ ...clientErrors, ...feedback?.fieldErrors }}
            pending={register.isPending}
            feedback={feedback?.message}
            onFieldChange={setField}
            onSubmit={handleSubmit}
          />
        </>
      )}
    </PageShell>
  );
}
