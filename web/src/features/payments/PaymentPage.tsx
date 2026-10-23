import { useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { PageShell } from "../../ui/PageShell";
import { StatusMessage } from "../../ui/StatusMessage";
import { formatCentsAsDecimal, parsePenAmountToCents } from "./amount";
import {
  clearPaymentAttempt,
  loadPaymentAttempt,
  savePaymentAttempt,
  type PaymentAttempt,
} from "./payment-attempt";
import {
  describeRejection,
  resolvePaymentAttempt,
  submitPayment,
  type Settled,
} from "./payment-api";
import type { PaymentView, SavedContact } from "./payment-types";
import {
  PaymentForm,
  type PaymentDraft,
  type PaymentDraftErrors,
} from "./PaymentForm";
import { PaymentPendingPanel, PaymentSuccessPanel } from "./PaymentStatus";

export const PAYMENTS_QUERY_KEY = ["payments"];

const EMPTY_DRAFT: PaymentDraft = { recipientWalletId: "", amountText: "" };

type Props = {
  ownerUserId: string;
  accessToken: string;
  contacts: readonly SavedContact[];
  retryPolicy?: RetryPolicy;
};

export type RetryPolicy = { maxRetries: number; delayMs: number };

// Automatic retries reuse the attempt's idempotency key, so they can never charge twice.
const DEFAULT_RETRY_POLICY: RetryPolicy = { maxRetries: 2, delayMs: 1_000 };

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Preselect the recipient from a "Pagar" link or QR, or when there is only one choice.
function initialDraft(
  contacts: readonly SavedContact[],
  requestedWalletId: string | null,
  requestedAmountCents: string | null,
): PaymentDraft {
  const requested = contacts.find((c) => c.walletId === requestedWalletId);
  const preselected =
    requested ?? (contacts.length === 1 ? contacts[0] : undefined);
  const cents = Number(requestedAmountCents);
  const amountText =
    requested && Number.isSafeInteger(cents) && cents > 0
      ? formatCentsAsDecimal(cents)
      : "";
  return {
    ...EMPTY_DRAFT,
    recipientWalletId: preselected?.walletId ?? "",
    amountText,
  };
}

export function PaymentPage({
  ownerUserId,
  accessToken,
  contacts,
  retryPolicy = DEFAULT_RETRY_POLICY,
}: Props) {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const requestedWalletId = searchParams.get("to");
  const requestedAmount = searchParams.get("amount");
  const [attempt, setAttempt] = useState(() => loadPaymentAttempt(ownerUserId));
  const [draft, setDraft] = useState<PaymentDraft>(() =>
    initialDraft(contacts, requestedWalletId, requestedAmount),
  );
  const [draftErrors, setDraftErrors] = useState<PaymentDraftErrors>({});
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<PaymentView>();
  const [failure, setFailure] = useState<string>();
  // Synchronous guard: a double click must never send a second request.
  const inFlight = useRef(false);

  function applyResult(result: Settled) {
    if (result.kind === "unknown") return;
    clearPaymentAttempt(ownerUserId);
    setAttempt(undefined);
    if (result.kind === "rejected") {
      setFailure(describeRejection(result.code));
      return;
    }
    setSuccess(result.payment);
    void queryClient.invalidateQueries({ queryKey: PAYMENTS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ["account", ownerUserId] });
  }

  function findContact(walletId: string): SavedContact | undefined {
    return contacts.find((contact) => contact.walletId === walletId);
  }

  async function settleAttempt(
    current: PaymentAttempt,
    run: (attempt: PaymentAttempt, token: string) => Promise<Settled>,
  ) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailure(undefined);
    try {
      let result = await run(current, accessToken);
      for (
        let retry = 0;
        retry < retryPolicy.maxRetries && result.kind === "unknown";
        retry += 1
      ) {
        await wait(retryPolicy.delayMs);
        result = await resolvePaymentAttempt(current, accessToken);
      }
      applyResult(result);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function changeDraft(field: keyof PaymentDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function handlePay(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const amount = parsePenAmountToCents(draft.amountText);
    const recipient = findContact(draft.recipientWalletId);
    const errors: PaymentDraftErrors = {};
    if (!recipient) errors.recipientWalletId = "Elige un contacto guardado.";
    if (!amount.ok) errors.amountText = amount.message;
    setDraftErrors(errors);
    if (!recipient || !amount.ok) return;
    const created: PaymentAttempt = {
      ownerUserId,
      key: crypto.randomUUID(),
      payload: {
        recipientType: "contact",
        recipientWalletId: recipient.walletId,
        amountCents: amount.cents,
        currency: "PEN",
      },
    };
    savePaymentAttempt(created);
    setAttempt(created);
    void settleAttempt(created, submitPayment);
  }

  function resolveAttempt() {
    if (attempt) void settleAttempt(attempt, resolvePaymentAttempt);
  }

  function startNewPayment() {
    setSuccess(undefined);
    setDraft(initialDraft(contacts, requestedWalletId, requestedAmount));
    setDraftErrors({});
  }

  function recipientNameOf(walletId: string): string {
    return findContact(walletId)?.name ?? "contacto guardado";
  }

  let content: ReactNode;
  if (success) {
    content = (
      <PaymentSuccessPanel
        payment={success}
        recipientName={recipientNameOf(success.destinationWalletId)}
        onNewPayment={startNewPayment}
      />
    );
  } else if (attempt) {
    content = (
      <PaymentPendingPanel
        amountCents={attempt.payload.amountCents}
        recipientName={recipientNameOf(attempt.payload.recipientWalletId)}
        busy={busy}
        onResolve={resolveAttempt}
      />
    );
  } else {
    content = (
      <PaymentForm
        draft={draft}
        errors={draftErrors}
        contacts={contacts}
        onChange={changeDraft}
        onSubmit={handlePay}
      />
    );
  }

  return (
    <PageShell title="Pagar a un contacto">
      {failure && !success ? (
        <StatusMessage tone="error">{failure}</StatusMessage>
      ) : null}
      {content}
    </PageShell>
  );
}
