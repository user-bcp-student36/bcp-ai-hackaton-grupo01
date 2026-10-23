import { Link } from "react-router";
import { StatusMessage } from "../../ui/StatusMessage";
import { Illustration } from "../../ui/Illustration";
import type { ContactView } from "./contactsClient";

export type ListState = "loading" | "ready" | "error";

export function ContactList({
  contacts,
  listState,
  selectedId,
  onRetry,
  onSelect,
}: {
  contacts: ContactView[];
  listState: ListState;
  selectedId: string | undefined;
  onRetry: () => void;
  onSelect: (contact: ContactView) => void;
}) {
  if (listState === "loading") {
    return <StatusMessage tone="info">Cargando contactos…</StatusMessage>;
  }
  if (listState === "error") {
    return (
      <div>
        <StatusMessage tone="error">
          No se pudieron cargar tus contactos.
        </StatusMessage>
        <button type="button" onClick={onRetry}>
          Reintentar
        </button>
      </div>
    );
  }
  if (contacts.length === 0) {
    return (
      <div className="empty-state">
        <Illustration name="contacts" />
        <p>Aún no tienes contactos guardados.</p>
      </div>
    );
  }
  return (
    <ul className="contact-list" aria-label="Mis contactos">
      {contacts.map((contact) => (
        <li key={contact.id} className="contact-row">
          <span className="contact-phone">{contact.displayName}</span>
          <span className="contact-actions">
            <Link
              className="button-link"
              to={`/pagos?to=${encodeURIComponent(contact.walletId)}`}
            >
              Pagar a {contact.displayName}
            </Link>
            <button
              type="button"
              className="button-secondary"
              aria-pressed={contact.id === selectedId}
              onClick={() => {
                onSelect(contact);
              }}
            >
              Seleccionar {contact.displayName}
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}
