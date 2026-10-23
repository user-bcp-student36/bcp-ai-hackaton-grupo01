import type { SyntheticEvent } from "react";
import {
  digitsOnly,
  documentMaxLength,
  documentNumberFilter,
  PASSWORD_LENGTH,
  PHONE_MAX_LENGTH,
  phoneFilter,
} from "../../lib/inputFilters";
import { SelectField } from "../../ui/SelectField";
import { StatusMessage } from "../../ui/StatusMessage";
import { TextField } from "../../ui/TextField";
import {
  type FieldErrors,
  type RegistrationField,
  type RegistrationFormValues,
} from "./registration-feedback";

type Props = {
  values: RegistrationFormValues;
  errors: FieldErrors;
  pending: boolean;
  feedback?: string;
  onFieldChange: <K extends RegistrationField>(
    field: K,
    value: RegistrationFormValues[K],
  ) => void;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
};

export function RegistrationForm({
  values,
  errors,
  pending,
  feedback,
  onFieldChange,
  onSubmit,
}: Props) {
  return (
    <form onSubmit={onSubmit} noValidate aria-busy={pending}>
      <SelectField
        id="documentType"
        label="Tipo de documento"
        value={values.documentType}
        error={errors.documentType}
        onChange={(event) => {
          onFieldChange(
            "documentType",
            event.target.value === "CE" ? "CE" : "DNI",
          );
        }}
      >
        <option value="DNI">DNI</option>
        <option value="CE">CE (carné de extranjería)</option>
      </SelectField>
      <TextField
        id="documentNumber"
        label="Número de documento"
        value={values.documentNumber}
        error={errors.documentNumber}
        autoComplete="off"
        placeholder={
          values.documentType === "DNI" ? "Ej.: 72193412" : "Ej.: AB1234567"
        }
        maxLength={documentMaxLength(values.documentType)}
        inputMode={values.documentType === "DNI" ? "numeric" : "text"}
        onChange={(event) => {
          onFieldChange(
            "documentNumber",
            documentNumberFilter(values.documentType)(event.target.value),
          );
        }}
      />
      <TextField
        id="fullName"
        label="Nombre completo"
        value={values.fullName ?? ""}
        error={errors.fullName}
        autoComplete="name"
        placeholder="Ej.: María Quispe Flores"
        onChange={(event) => {
          onFieldChange("fullName", event.target.value);
        }}
      />
      <TextField
        id="phone"
        label="Celular (Perú)"
        type="tel"
        maxLength={PHONE_MAX_LENGTH}
        value={values.phone}
        error={errors.phone}
        autoComplete="tel"
        placeholder="Ej.: 987654321"
        onChange={(event) => {
          onFieldChange("phone", phoneFilter(event.target.value));
        }}
      />
      <TextField
        id="email"
        label="Correo electrónico"
        type="email"
        value={values.email}
        error={errors.email}
        autoComplete="email"
        placeholder="Ej.: maria@correo.com"
        onChange={(event) => {
          onFieldChange("email", event.target.value);
        }}
      />
      <TextField
        id="password"
        label="Contraseña de 6 dígitos"
        type="password"
        inputMode="numeric"
        maxLength={PASSWORD_LENGTH}
        value={values.password}
        error={errors.password}
        autoComplete="new-password"
        placeholder="6 números, ej.: 246810"
        onChange={(event) => {
          onFieldChange(
            "password",
            digitsOnly(event.target.value, PASSWORD_LENGTH),
          );
        }}
      />
      {feedback ? <StatusMessage tone="error">{feedback}</StatusMessage> : null}
      <div className="form-actions">
        <button type="submit" disabled={pending}>
          {pending ? "Creando cuenta…" : "Crear cuenta"}
        </button>
      </div>
    </form>
  );
}
