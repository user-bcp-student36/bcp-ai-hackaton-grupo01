import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent,
} from "react";
import { PHONE_MAX_LENGTH, phoneFilter } from "../../lib/inputFilters";
import { Link, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/apiClient";
import { useSession } from "../../lib/session";
import { PageShell } from "../../ui/PageShell";
import { StatusMessage } from "../../ui/StatusMessage";
import { TextField } from "../../ui/TextField";
import {
  createContactsClient,
  type ContactsClient,
  type ContactView,
} from "./contactsClient";
import { ContactList, type ListState } from "./ContactList";

const LOOKUP_ERROR_MESSAGES: Partial<Record<string, string>> = {
  VALIDATION_ERROR: "Ingresa un número de celular válido.",
  RECIPIENT_NOT_FOUND: "No encontramos un destinatario activo con ese número.",
  SELF_CONTACT: "No puedes agregarte a ti mismo como contacto.",
  RATE_LIMITED:
    "Hiciste demasiadas búsquedas. Intenta de nuevo en unos minutos.",
};
const GENERIC_ERROR_MESSAGE =
  "No se pudo completar la acción. Intenta de nuevo.";

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    return LOOKUP_ERROR_MESSAGES[error.code] ?? GENERIC_ERROR_MESSAGE;
  }
  return GENERIC_ERROR_MESSAGE;
}

type Props = { client?: ContactsClient };

export function ContactsPage({ client }: Props) {
  const { session } = useSession();
  const token = session?.token;
  const activeClient = useMemo(
    () => client ?? (token ? createContactsClient(token) : undefined),
    [client, token],
  );

  if (!session || !activeClient) {
    return (
      <PageShell title="Contactos">
        <StatusMessage tone="info">
          Inicia sesión para ver tus contactos.
        </StatusMessage>
        <Link to="/ingresar">Ingresar</Link>
      </PageShell>
    );
  }

  // Keyed by user so logout or an account switch discards every query and form state.
  return <ContactsView key={session.user.id} client={activeClient} />;
}

function ContactsView({ client }: { client: ContactsClient }) {
  const [phone, setPhone] = useState("");
  const [searchError, setSearchError] = useState<string | undefined>();
  const [isSearching, setIsSearching] = useState(false);
  const [contacts, setContacts] = useState<ContactView[]>([]);
  const [listState, setListState] = useState<ListState>("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const latestSearch = useRef(0);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const userId = session?.user.id;
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
    setSearchError(undefined);
    setIsSearching(true);
    try {
      const found = await client.lookupRecipient(phone.trim());
      // A found recipient goes straight to payment; saving makes it payable.
      await client.addContact(found.walletId);
      // Drop the payment screen's cached list so it can't preselect from a stale one.
      queryClient.removeQueries({ queryKey: ["contacts", userId] });
      if (search === latestSearch.current) {
        void navigate(`/pagos?to=${encodeURIComponent(found.walletId)}`);
      }
    } catch (error) {
      if (search === latestSearch.current) setSearchError(messageFor(error));
    } finally {
      if (search === latestSearch.current) setIsSearching(false);
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
          placeholder="Ej.: 987654321"
          maxLength={PHONE_MAX_LENGTH}
          value={phone}
          onChange={(event) => {
            setPhone(phoneFilter(event.target.value));
          }}
        />
        <button type="submit" disabled={isSearching}>
          {isSearching ? "Buscando…" : "Buscar y pagar"}
        </button>
      </form>

      {searchError ? (
        <StatusMessage tone="error">{searchError}</StatusMessage>
      ) : null}

      <ContactList
        contacts={contacts}
        listState={listState}
        onRetry={retryContacts}
      />
    </PageShell>
  );
}
