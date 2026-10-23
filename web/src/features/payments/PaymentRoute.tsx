import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { useSession, type ActiveSession } from "../../lib/session";
import { PageShell } from "../../ui/PageShell";
import { StatusMessage } from "../../ui/StatusMessage";
import { createContactsClient } from "../contacts/contactsClient";
import { PaymentPage } from "./PaymentPage";
import type { SavedContact } from "./payment-types";

export function PaymentRoute() {
  const { session } = useSession();
  if (!session) {
    return (
      <PageShell title="Pagar a un contacto">
        <StatusMessage tone="info">Inicia sesión para pagar.</StatusMessage>
        <Link className="button-link" to="/ingresar">
          Ingresar
        </Link>
      </PageShell>
    );
  }
  return <PaymentWithContacts session={session} />;
}

function PaymentWithContacts({ session }: { session: ActiveSession }) {
  const client = useMemo(
    () => createContactsClient(session.token),
    [session.token],
  );
  const contacts = useQuery({
    queryKey: ["contacts", session.user.id],
    queryFn: () => client.listContacts(),
  });

  const saved: SavedContact[] = (contacts.data ?? []).map((contact) => ({
    walletId: contact.walletId,
    name: contact.phone,
  }));

  if (contacts.isPending) {
    return (
      <PageShell title="Pagar a un contacto">
        <StatusMessage tone="info">Cargando tus contactos…</StatusMessage>
      </PageShell>
    );
  }
  if (contacts.isError) {
    return (
      <PageShell title="Pagar a un contacto">
        <StatusMessage tone="error">
          No se pudieron cargar tus contactos.
        </StatusMessage>
        <button type="button" onClick={() => void contacts.refetch()}>
          Reintentar
        </button>
      </PageShell>
    );
  }
  if (saved.length === 0) {
    return (
      <PageShell title="Pagar a un contacto">
        <StatusMessage tone="info">
          Aún no tienes contactos guardados. Agrega uno para poder pagarle.
        </StatusMessage>
        <Link className="button-link" to="/contactos">
          Ir a contactos
        </Link>
      </PageShell>
    );
  }
  return (
    <PaymentPage
      ownerUserId={session.user.id}
      accessToken={session.token}
      contacts={saved}
    />
  );
}
