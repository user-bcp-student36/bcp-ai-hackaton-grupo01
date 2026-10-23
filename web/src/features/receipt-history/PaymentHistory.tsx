import { Link } from "react-router";
import { ApiError } from "../../lib/apiClient";
import { Illustration } from "../../ui/Illustration";
import { StatusMessage } from "../../ui/StatusMessage";
import {
  directionFor,
  directionLabel,
  formatPaymentDate,
  formatPen,
  type PaymentDirection,
} from "./format";
import {
  paymentsClient,
  type PaymentsClient,
  type PaymentView,
  type ReceiptSession,
} from "./paymentsClient";
import { useInvalidateHistoryOnPaymentSucceeded } from "./payment-events";
import { usePaymentHistory } from "./usePayments";
import "./receipt-history.css";

export function PaymentHistory({
  session,
  client = paymentsClient,
}: {
  session: ReceiptSession;
  client?: PaymentsClient;
}) {
  useInvalidateHistoryOnPaymentSucceeded(session.walletId);
  const history = usePaymentHistory(session, client);

  if (history.status === "pending") {
    return <StatusMessage tone="info">Cargando movimientos…</StatusMessage>;
  }
  if (history.status === "error") {
    return (
      <HistoryError
        error={history.error}
        onRetry={() => void history.refetch()}
      />
    );
  }

  const rows = history.data.flatMap((payment) => {
    const direction = directionFor(payment, session.walletId);
    return direction === undefined ? [] : [{ payment, direction }];
  });

  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <Illustration name="history" />
        <StatusMessage tone="info">Aún no tienes movimientos.</StatusMessage>
      </div>
    );
  }

  return (
    <>
      <p className="receipt-note">
        Montos en soles (PEN) de fondos ficticios para la demo.
      </p>
      <ul className="history-list" aria-label="Movimientos">
        {rows.map(({ payment, direction }) => (
          <HistoryRow
            key={payment.id}
            payment={payment}
            direction={direction}
          />
        ))}
      </ul>
    </>
  );
}

function HistoryRow({
  payment,
  direction,
}: {
  payment: PaymentView;
  direction: PaymentDirection;
}) {
  return (
    <li className="history-row">
      <div className="history-row-main">
        <p className="history-direction">{directionLabel(direction)}</p>
        <p className="history-counterparty">{payment.counterpartyName}</p>
        <p className="history-amount">{formatPen(payment.amountCents)}</p>
        <time className="history-date" dateTime={payment.createdAt}>
          {formatPaymentDate(payment.createdAt)}
        </time>
        <p className="history-reference">Referencia: {payment.id}</p>
      </div>
      <Link
        className="history-link"
        to={`/movimientos/${encodeURIComponent(payment.id)}`}
      >
        Ver comprobante
      </Link>
    </li>
  );
}

function HistoryError({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  if (error instanceof ApiError && error.status === 401) {
    return (
      <StatusMessage tone="error">
        Tu sesión venció. <Link to="/ingresar">Vuelve a ingresar</Link> para ver
        tus movimientos.
      </StatusMessage>
    );
  }
  return (
    <div className="form-actions">
      <StatusMessage tone="error">
        No pudimos cargar tus movimientos. Intenta de nuevo.
      </StatusMessage>
      <button type="button" onClick={onRetry}>
        Reintentar
      </button>
    </div>
  );
}
