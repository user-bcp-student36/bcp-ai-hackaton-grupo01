import { Link } from "react-router";
import { Illustration } from "../../ui/Illustration";
import { StatusMessage } from "../../ui/StatusMessage";
import { formatPenCents } from "./amount";
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
  recipientName,
  onNewPayment,
}: {
  payment: PaymentView;
  recipientName: string;
  onNewPayment: () => void;
}) {
  return (
    <section
      className="card empty-state"
      aria-labelledby="payment-success-title"
    >
      <Illustration name="success" />
      <h2 id="payment-success-title">Pago realizado</h2>
      <p className="status-success" role="status">
        {formatPenCents(payment.amountCents)} enviados a {recipientName}.
      </p>
      <p>Referencia: {payment.id}</p>
      <div className="form-actions">
        <button type="button" onClick={onNewPayment}>
          Nuevo pago
        </button>
        <Link className="button-link button-secondary" to="/movimientos">
          Ver historial
        </Link>
      </div>
    </section>
  );
}
