import type { SyntheticEvent } from "react";
import { amountFilter } from "../../lib/inputFilters";
import { SelectField } from "../../ui/SelectField";
import { TextField } from "../../ui/TextField";
import type { SavedContact } from "./payment-types";

export type PaymentDraft = { recipientWalletId: string; amountText: string };
export type PaymentDraftErrors = Partial<Record<keyof PaymentDraft, string>>;

const QUICK_AMOUNTS = ["10", "20", "50", "100"];

export function PaymentForm({
  draft,
  errors,
  contacts,
  onChange,
  onSubmit,
}: {
  draft: PaymentDraft;
  errors: PaymentDraftErrors;
  contacts: readonly SavedContact[];
  onChange: (field: keyof PaymentDraft, value: string) => void;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} noValidate>
      <SelectField
        id="recipient"
        label="Destinatario"
        value={draft.recipientWalletId}
        error={errors.recipientWalletId}
        onChange={(event) => {
          onChange("recipientWalletId", event.target.value);
        }}
      >
        <option value="">Elige un contacto</option>
        {contacts.map((contact) => (
          <option key={contact.walletId} value={contact.walletId}>
            {contact.name}
          </option>
        ))}
      </SelectField>
      <TextField
        id="amount"
        label="Monto en soles (PEN)"
        inputMode="decimal"
        placeholder="0.00"
        autoComplete="off"
        value={draft.amountText}
        error={errors.amountText}
        onChange={(event) => {
          onChange("amountText", amountFilter(event.target.value));
        }}
      />
      <div className="amount-chips" role="group" aria-label="Montos rápidos">
        {QUICK_AMOUNTS.map((amount) => (
          <button
            key={amount}
            type="button"
            className="button-secondary"
            onClick={() => {
              onChange("amountText", amount);
            }}
          >
            S/ {amount}
          </button>
        ))}
      </div>
      <div className="form-actions">
        <button type="submit">Pagar</button>
      </div>
    </form>
  );
}
