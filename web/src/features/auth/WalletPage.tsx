import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router";
import type { AccountResponse } from "@wallet/contracts/auth";
import type { UserView } from "@wallet/contracts/onboarding";
import { ApiError } from "../../lib/apiClient";
import { useSession, type ActiveSession } from "../../lib/session";
import { PageShell } from "../../ui/PageShell";
import { StatusMessage } from "../../ui/StatusMessage";
import { fetchAccount } from "./auth-api";

const PEN = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});
const NO_WALLET_COPY: Record<UserView["kycStatus"], string> = {
  activa: "Tu billetera todavía no está disponible. Vuelve a intentar en unos minutos.",
  pendiente:
    "Tu verificación está pendiente. Tu billetera se habilitará cuando se apruebe.",
  rechazada:
    "La verificación fue rechazada, así que no hay billetera asociada a esta cuenta.",
};
const LOAD_ERROR_MESSAGE = "No se pudo cargar tu cuenta.";

export function formatBalance(balanceCents: number): string {
  return PEN.format(balanceCents / 100);
}

export function WalletPage() {
  const { session } = useSession();
  if (!session) return <Navigate to="/ingresar" replace />;
  return <AccountView session={session} />;
}

function AccountView({ session }: { session: ActiveSession }) {
  const { expire, logout } = useSession();
  const account = useQuery({
    queryKey: ["account", session.user.id],
    queryFn: () => fetchAccount(session.token),
    // Only network failures are retried; a 401 must expire the session at once.
    retry: (failureCount, error) =>
      !(error instanceof ApiError) && failureCount < 2,
  });

  useEffect(() => {
    if (account.error instanceof ApiError && account.error.status === 401) {
      expire();
    }
  }, [account.error, expire]);

  return (
    <PageShell title="Mi billetera">
      <AccountBody
        isPending={account.isPending}
        error={account.error}
        data={account.data}
        onRetry={() => {
          void account.refetch();
        }}
      />
      <div className="wallet-actions">
        <Link className="button-link" to="/pagos">
          Pagar a un contacto
        </Link>
        <button
          type="button"
          className="button-secondary"
          onClick={() => void logout()}
        >
          Cerrar sesión
        </button>
      </div>
    </PageShell>
  );
}

type AccountBodyProps = {
  isPending: boolean;
  error: Error | null;
  data: AccountResponse | undefined;
  onRetry: () => void;
};

function AccountBody({ isPending, error, data, onRetry }: AccountBodyProps) {
  if (isPending) {
    return <StatusMessage tone="info">Cargando tu billetera…</StatusMessage>;
  }
  if (error instanceof ApiError && error.status === 401) return null;
  if (error || !data) {
    return (
      <>
        <StatusMessage tone="error">{LOAD_ERROR_MESSAGE}</StatusMessage>
        <div className="form-actions">
          <button type="button" onClick={onRetry}>
            Reintentar
          </button>
        </div>
      </>
    );
  }
  if (data.wallet) {
    return (
      <section
        className="card balance-card"
        aria-labelledby="wallet-balance-title"
      >
        <h2 id="wallet-balance-title">Saldo disponible</h2>
        <p className="balance">{formatBalance(data.wallet.balanceCents)}</p>
        <p className="balance-note">Fondos ficticios para la demo.</p>
      </section>
    );
  }
  return (
    <section className="card" aria-labelledby="wallet-status-title">
      <h2 id="wallet-status-title">Estado de tu cuenta</h2>
      <p>{NO_WALLET_COPY[data.user.kycStatus]}</p>
    </section>
  );
}
