import { Link } from "react-router";
import { ApiError } from "../../lib/apiClient";
import { StatusMessage } from "../../ui/StatusMessage";
import { directionFor } from "./format";
import {
  paymentsClient,
  type PaymentsClient,
  type ReceiptSession,
} from "./paymentsClient";
import { ReceiptView } from "./ReceiptView";
import { usePaymentReceipt } from "./usePayments";
import "./receipt-history.css";

export const NOT_FOUND_MESSAGE = "No encontramos este comprobante.";

export function PaymentReceipt({
  session,
  paymentId,
  client = paymentsClient,
}: {
  session: ReceiptSession;
  paymentId: string;
  client?: PaymentsClient;
}) {
  const receipt = usePaymentReceipt(session, paymentId, client);

  if (receipt.status === "pending") {
    return <StatusMessage tone="info">Cargando comprobante…</StatusMessage>;
  }
  if (receipt.status === "error") {
    return (
      <ReceiptError
        error={receipt.error}
        onRetry={() => void receipt.refetch()}
      />
    );
  }

  // A receipt for a payment this wallet is not part of is treated exactly like
  // an absent one: no amount, no direction, the same message.
  const direction = directionFor(receipt.data, session.walletId);
  if (direction === undefined) {
    return <StatusMessage tone="error">{NOT_FOUND_MESSAGE}</StatusMessage>;
  }
  return <ReceiptView payment={receipt.data} direction={direction} />;
}

function ReceiptError({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  if (
    error instanceof ApiError &&
    (error.status === 400 || error.status === 404)
  ) {
    return <StatusMessage tone="error">{NOT_FOUND_MESSAGE}</StatusMessage>;
  }
  if (error instanceof ApiError && error.status === 401) {
    return (
      <StatusMessage tone="error">
        Tu sesión venció. <Link to="/ingresar">Vuelve a ingresar</Link> para ver
        este comprobante.
      </StatusMessage>
    );
  }
  return (
    <div className="form-actions">
      <StatusMessage tone="error">
        No pudimos cargar el comprobante. Intenta de nuevo.
      </StatusMessage>
      <button type="button" onClick={onRetry}>
        Reintentar
      </button>
    </div>
  );
}
