import type { SyntheticEvent } from "react";
import { SelectField } from "../../ui/SelectField";
import { TextField } from "../../ui/TextField";
import { formatPenCents } from "./amount";
import { DEMO_CONTACTS } from "./fake-contacts";
import type { PaymentPayload } from "./payment-types";

export type PaymentDraft = { recipientWalletId: string; amountText: string };
export type PaymentDraftErrors = Partial<Record<keyof PaymentDraft, string>>;
export type PaymentReviewData = { payload: PaymentPayload; recipientName: string };

export function PaymentForm({
  draft,
  errors,
  onChange,
  onSubmit,
}: {
  draft: PaymentDraft;
  errors: PaymentDraftErrors;
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
        {DEMO_CONTACTS.map((contact) => (
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
          onChange("amountText", event.target.value);
        }}
      />
      <div className="form-actions">
        <button type="submit">Revisar pago</button>
      </div>
    </form>
  );
}

export function PaymentReview({
  review,
  onConfirm,
  onBack,
}: {
  review: PaymentReviewData;
  onConfirm: () => void;
  onBack: () => void;
}) {
  return (
    <section className="card" aria-labelledby="payment-review-title">
      <h2 id="payment-review-title">Confirma tu pago</h2>
      <p>
        Vas a pagar {formatPenCents(review.payload.amountCents)} a{" "}
        {review.recipientName}.
      </p>
      <div className="form-actions">
        <button type="button" onClick={onConfirm}>
          Confirmar pago
        </button>
        <button type="button" onClick={onBack}>
          Volver
        </button>
      </div>
    </section>
  );
}
