import type { z } from "zod";
import type { registrationInputSchema } from "@wallet/contracts/onboarding";
import { ApiError, type ApiErrorDetail } from "../../lib/apiClient";

export type RegistrationFormValues = z.input<typeof registrationInputSchema>;
export type RegistrationField = keyof RegistrationFormValues;
export type FieldErrors = Partial<Record<RegistrationField, string>>;
export type RegistrationFeedback = {
  readonly message: string;
  readonly fieldErrors: FieldErrors;
};

export const REGISTRATION_FIELDS = [
  "documentType",
  "documentNumber",
  "fullName",
  "phone",
  "email",
  "password",
] as const satisfies readonly RegistrationField[];

export const INITIAL_VALUES: RegistrationFormValues = {
  documentType: "DNI",
  documentNumber: "",
  fullName: "",
  phone: "",
  email: "",
  password: "",
};

const FIELD_MESSAGES: Record<RegistrationField, string> = {
  documentType: "Elige DNI o CE.",
  documentNumber: "DNI: 8 dígitos. CE: 9 a 12 letras o números.",
  fullName: "Ingresa tu nombre completo (2 a 80 caracteres).",
  phone:
    "Usa un celular peruano de 9 dígitos que empiece en 9. También puedes escribir +51.",
  email: "Ingresa un correo válido de hasta 254 caracteres.",
  password: "La contraseña debe tener exactamente 6 dígitos.",
};

export const UNCONFIRMED_FEEDBACK: RegistrationFeedback = {
  message:
    "No pudimos confirmar el resultado del registro. Revisa tu conexión e intenta de nuevo.",
  fieldErrors: {},
};

const TECHNICAL_RETRY_MESSAGE =
  "No pudimos completar el registro. Revisa tu conexión e intenta de nuevo.";

function isRegistrationField(
  value: PropertyKey | undefined,
): value is RegistrationField {
  return REGISTRATION_FIELDS.some((field) => field === value);
}

/** Field errors for schema issues or API details, using the form's copy. */
export function fieldErrorsFromIssues(
  issues: readonly { readonly path: readonly PropertyKey[] }[],
): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (isRegistrationField(field)) {
      errors[field] ??= FIELD_MESSAGES[field];
    }
  }
  return errors;
}

function fieldErrorsFromDetails(
  details: readonly ApiErrorDetail[],
): FieldErrors {
  return fieldErrorsFromIssues(
    details.map((detail) => ({ path: [detail.field] })),
  );
}

/**
 * Maps a failed registration to honest copy. A conflict never names a field,
 * and nothing here reports success.
 */
export function describeRegistrationError(
  error: unknown,
): RegistrationFeedback {
  if (!(error instanceof ApiError)) {
    return { message: TECHNICAL_RETRY_MESSAGE, fieldErrors: {} };
  }
  switch (error.status) {
    case 400:
      return {
        message: "Revisa los campos marcados.",
        fieldErrors: fieldErrorsFromDetails(error.details),
      };
    case 409:
      return {
        message: "Ya existe una cuenta registrada con estos datos.",
        fieldErrors: {},
      };
    case 429:
      return {
        message:
          "Demasiados intentos. Espera un momento antes de volver a intentarlo.",
        fieldErrors: {},
      };
    case 500:
    case 503:
      return {
        message:
          "Tu registro no se completó por un error técnico. Intenta de nuevo en unos minutos.",
        fieldErrors: {},
      };
    default:
      return { message: TECHNICAL_RETRY_MESSAGE, fieldErrors: {} };
  }
}
