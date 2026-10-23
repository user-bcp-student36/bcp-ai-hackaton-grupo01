import { StatusMessage } from "../../ui/StatusMessage";
import { formatPenCents } from "./amount";
import { findContact } from "./fake-contacts";
import type { PaymentView } from "./payment-types";

export function PaymentPendingPanel({
  amountCents,
  recipientName,
  busy,
  onResolve,
}: {
  amountCents: number;
  recipientName: string;
  busy: boolean;
  onResolve: () => void;
}) {
  return (
    <section
      className="card"
      aria-busy={busy}
      aria-labelledby="payment-pending-title"
    >
      <h2 id="payment-pending-title">
        {busy ? "Enviando pago" : "Resultado por confirmar"}
      </h2>
      <p>
        {formatPenCents(amountCents)} para {recipientName}.
      </p>
      {busy ? null : (
        <>
          <StatusMessage tone="info">
            La conexión no confirmó el pago. No se creará un pago nuevo hasta
            conocer el resultado.
          </StatusMessage>
          <div className="form-actions">
            <button type="button" onClick={onResolve}>
              Consultar resultado
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export function PaymentSuccessPanel({
  payment,
  onNewPayment,
}: {
  payment: PaymentView;
  onNewPayment: () => void;
}) {
  const recipientName =
    findContact(payment.destinationWalletId)?.name ?? "contacto guardado";
  return (
    <section className="card" aria-labelledby="payment-success-title">
      <h2 id="payment-success-title">Pago realizado</h2>
      <p className="status-success" role="status">
        {formatPenCents(payment.amountCents)} enviados a {recipientName}.
      </p>
      <p>Referencia: {payment.id}</p>
      <div className="form-actions">
        <button type="button" onClick={onNewPayment}>
          Nuevo pago
        </button>
      </div>
    </section>
  );
}
