import {
  directionLabel,
  formatPaymentDate,
  formatPen,
  type PaymentDirection,
} from "./format";
import type { PaymentView } from "./paymentsClient";
import "./receipt-history.css";

export function ReceiptView({
  payment,
  direction,
}: {
  payment: PaymentView;
  direction: PaymentDirection;
}) {
  return (
    <article className="card receipt" aria-labelledby="receipt-title">
      <h2 id="receipt-title">Comprobante de transferencia</h2>
      <dl className="receipt-details">
        <dt>Referencia</dt>
        <dd>{payment.id}</dd>
        <dt>Monto</dt>
        <dd>{formatPen(payment.amountCents)}</dd>
        <dt>Movimiento</dt>
        <dd>{directionLabel(direction)}</dd>
        <dt>Fecha</dt>
        <dd>
          <time dateTime={payment.createdAt}>
            {formatPaymentDate(payment.createdAt)}
          </time>
        </dd>
        <dt>Estado</dt>
        <dd>Completado</dd>
      </dl>
      <p className="receipt-note">
        Fondos ficticios. Comprobante demo en JSON: no es prueba fiscal, PDF,
        liquidación bancaria ni garantía de reversión.
      </p>
    </article>
  );
}
