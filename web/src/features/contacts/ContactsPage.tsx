import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { Link } from "react-router";
import { ApiError } from "../../lib/apiClient";
import { useSession } from "../../lib/session";
import { PageShell } from "../../ui/PageShell";
import { StatusMessage, type StatusTone } from "../../ui/StatusMessage";
import { TextField } from "../../ui/TextField";
import {
  contactsClient,
  type ContactsClient,
  type ContactView,
  type RecipientLookup,
} from "./contactsClient";
import { ContactList, type ListState } from "./ContactList";

const LOOKUP_ERROR_MESSAGES: Partial<Record<string, string>> = {
  VALIDATION_ERROR: "Ingresa un número de celular válido.",
  RECIPIENT_NOT_FOUND: "No encontramos un destinatario activo con ese número.",
  SELF_CONTACT: "No puedes agregarte a ti mismo como contacto.",
  RATE_LIMITED: "Hiciste demasiadas búsquedas. Intenta de nuevo en unos minutos.",
};
const GENERIC_ERROR_MESSAGE = "No se pudo completar la acción. Intenta de nuevo.";

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    return LOOKUP_ERROR_MESSAGES[error.code] ?? GENERIC_ERROR_MESSAGE;
  }
  return GENERIC_ERROR_MESSAGE;
}

function withContact(contacts: ContactView[], contact: ContactView): ContactView[] {
  return contacts.some((saved) => saved.id === contact.id)
    ? contacts
    : [...contacts, contact];
}

type Props = { client?: ContactsClient };

export function ContactsPage({ client = contactsClient }: Props) {
  const { session } = useSession();

  if (!session) {
    return (
      <PageShell title="Contactos">
        <StatusMessage tone="info">Inicia sesión para ver tus contactos.</StatusMessage>
        <Link to="/ingresar">Ingresar</Link>
      </PageShell>
    );
  }

  // Keyed by user so logout or an account switch discards every query and form state.
  return <ContactsView key={session.user.id} client={client} />;
}

function ContactsView({ client }: Required<Props>) {
  const [phone, setPhone] = useState("");
  const [lookup, setLookup] = useState<RecipientLookup | undefined>();
  const [searchError, setSearchError] = useState<string | undefined>();
  const [isSearching, setIsSearching] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ tone: StatusTone; text: string } | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const [contacts, setContacts] = useState<ContactView[]>([]);
  const [listState, setListState] = useState<ListState>("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<ContactView | undefined>();
  const latestSearch = useRef(0);

  useEffect(() => {
    let isCurrent = true;
    void client.listContacts().then(
      (listed) => {
        if (!isCurrent) return;
        setContacts(listed);
        setListState("ready");
      },
      () => {
        if (isCurrent) setListState("error");
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [client, reloadKey]);

  function retryContacts() {
    setListState("loading");
    setReloadKey((key) => key + 1);
  }

  async function handleSearch(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const search = ++latestSearch.current;
    setLookup(undefined);
    setSaveStatus(undefined);
    setSearchError(undefined);
    setIsSearching(true);
    try {
      const found = await client.lookupRecipient(phone.trim());
      if (search === latestSearch.current) setLookup(found);
    } catch (error) {
      if (search === latestSearch.current) setSearchError(messageFor(error));
    } finally {
      if (search === latestSearch.current) setIsSearching(false);
    }
  }

  async function handleSave(recipient: RecipientLookup) {
    setIsSaving(true);
    setSaveStatus(undefined);
    try {
      const saved = await client.addContact(recipient.walletId);
      setContacts((current) => withContact(current, saved));
      setSaveStatus({ tone: "success", text: "Contacto guardado." });
    } catch (error) {
      setSaveStatus({ tone: "error", text: messageFor(error) });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <PageShell title="Contactos">
      <form onSubmit={(event) => void handleSearch(event)} noValidate>
        <TextField
          id="contact-phone"
          label="Celular del destinatario"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(event) => {
            setPhone(event.target.value);
          }}
        />
        <button type="submit" disabled={isSearching}>
          {isSearching ? "Buscando…" : "Buscar"}
        </button>
      </form>

      {searchError ? <StatusMessage tone="error">{searchError}</StatusMessage> : null}

      {lookup ? (
        <section aria-label="Resultado de búsqueda">
          <p>Destinatario encontrado: {lookup.phone}</p>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void handleSave(lookup)}
          >
            {isSaving ? "Guardando…" : "Guardar contacto"}
          </button>
        </section>
      ) : null}

      {saveStatus ? (
        <StatusMessage tone={saveStatus.tone}>{saveStatus.text}</StatusMessage>
      ) : null}

      <ContactList
        contacts={contacts}
        listState={listState}
        selectedId={selected?.id}
        onRetry={retryContacts}
        onSelect={setSelected}
      />

      {selected ? (
        <StatusMessage tone="info">
          Destinatario seleccionado: {selected.phone}
        </StatusMessage>
      ) : null}
    </PageShell>
  );
}
