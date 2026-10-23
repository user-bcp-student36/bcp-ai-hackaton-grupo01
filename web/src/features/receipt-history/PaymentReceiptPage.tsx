import { Link, useParams } from "react-router";
import { PageShell } from "../../ui/PageShell";
import type { PaymentsClient, ReceiptSession } from "./paymentsClient";
import { PaymentReceipt } from "./PaymentReceipt";
import { SignInRequired } from "./SignInRequired";
import "./receipt-history.css";

export function PaymentReceiptPage({
  session = null,
  client,
}: {
  session?: ReceiptSession | null;
  client?: PaymentsClient;
}) {
  const { paymentId = "" } = useParams();
  return (
    <PageShell title="Comprobante">
      <p>
        <Link to="/movimientos">Volver a movimientos</Link>
      </p>
      {session ? (
        <PaymentReceipt
          session={session}
          paymentId={paymentId}
          client={client}
        />
      ) : (
        <SignInRequired />
      )}
    </PageShell>
  );
}
