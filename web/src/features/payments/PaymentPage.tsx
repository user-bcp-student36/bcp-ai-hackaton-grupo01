import {
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PageShell } from "../../ui/PageShell";
import { StatusMessage } from "../../ui/StatusMessage";
import { parsePenAmountToCents } from "./amount";
import { findContact } from "./fake-contacts";
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
import type { PaymentView } from "./payment-types";
import {
  PaymentForm,
  PaymentReview,
  type PaymentDraft,
  type PaymentDraftErrors,
  type PaymentReviewData,
} from "./PaymentForm";
import { PaymentPendingPanel, PaymentSuccessPanel } from "./PaymentStatus";

export const PAYMENTS_QUERY_KEY = ["payments"];

const EMPTY_DRAFT: PaymentDraft = { recipientWalletId: "", amountText: "" };

export function PaymentPage({ ownerUserId }: { ownerUserId: string }) {
  const queryClient = useQueryClient();
  const [attempt, setAttempt] = useState(() => loadPaymentAttempt(ownerUserId));
  const [draft, setDraft] = useState<PaymentDraft>(EMPTY_DRAFT);
  const [draftErrors, setDraftErrors] = useState<PaymentDraftErrors>({});
  const [review, setReview] = useState<PaymentReviewData>();
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
  }

  async function settleAttempt(
    current: PaymentAttempt,
    run: (attempt: PaymentAttempt) => Promise<Settled>,
  ) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailure(undefined);
    try {
      applyResult(await run(current));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function changeDraft(field: keyof PaymentDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function handleReview(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = parsePenAmountToCents(draft.amountText);
    const recipient = findContact(draft.recipientWalletId);
    const errors: PaymentDraftErrors = {};
    if (!recipient) errors.recipientWalletId = "Elige un contacto guardado.";
    if (!amount.ok) errors.amountText = amount.message;
    setDraftErrors(errors);
    if (!recipient || !amount.ok) return;
    setReview({
      payload: {
        recipientType: "contact",
        recipientWalletId: recipient.walletId,
        amountCents: amount.cents,
        currency: "PEN",
      },
      recipientName: recipient.name,
    });
  }

  function confirmReview() {
    if (!review || inFlight.current) return;
    const created: PaymentAttempt = {
      ownerUserId,
      key: crypto.randomUUID(),
      payload: review.payload,
    };
    savePaymentAttempt(created);
    setAttempt(created);
    setReview(undefined);
    void settleAttempt(created, submitPayment);
  }

  function resolveAttempt() {
    if (attempt) void settleAttempt(attempt, resolvePaymentAttempt);
  }

  function startNewPayment() {
    setSuccess(undefined);
    setDraft(EMPTY_DRAFT);
    setDraftErrors({});
  }

  function recipientNameOf(walletId: string): string {
    return findContact(walletId)?.name ?? "contacto guardado";
  }

  let content: ReactNode;
  if (success) {
    content = (
      <PaymentSuccessPanel payment={success} onNewPayment={startNewPayment} />
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
  } else if (review) {
    content = (
      <PaymentReview
        review={review}
        onConfirm={confirmReview}
        onBack={() => {
          setReview(undefined);
        }}
      />
    );
  } else {
    content = (
      <PaymentForm
        draft={draft}
        errors={draftErrors}
        onChange={changeDraft}
        onSubmit={handleReview}
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
