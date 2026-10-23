## Context

Contact payments exist (`POST /api/v1/payments`, saved contact required, idempotent). The
remote wallet mock is not used: SQLite is the single source of money. A QR is a signed-in
user's pointer to their wallet plus an optional amount.

## Contracts

Shared schemas live in `packages/contracts/src/qr.ts`. All routes require
`Authorization: Bearer <token>` (401 `UNAUTHENTICATED`) and an active account
(403 `ACCOUNT_INACTIVE`).

### POST /api/v1/qrs

Request: `{ amountCents?: integer 1..PAYMENT_MAX_CENTS }` (omitted = open amount).
Response 201: `{ qr: { id, payload, amountCents: integer|null, expiresAt } }`
where `payload` is `altoque-qr:<id>` and `expiresAt` is ISO UTC, 300 s after creation.
Errors: 400 `VALIDATION_ERROR`, 401, 403.

### POST /api/v1/qrs/resolve

Request: `{ payload: string }`.
Response 200: `{ qr: { id, recipientWalletId, recipientPhone, amountCents: integer|null, expiresAt } }`
Errors: 400 `VALIDATION_ERROR` (not an `altoque-qr:` payload), 404 `QR_NOT_FOUND`,
410 `QR_EXPIRED`, 409 `SELF_QR`, 401, 403.

### Paying

Existing `POST /api/v1/contacts` `{ walletId }` saves the receiver, then existing
`POST /api/v1/payments` (unchanged) with `recipientWalletId` from the QR and `amountCents`
equal to the QR amount, or the amount typed by the sender when open.

### Data model (migration 005-qr.sql)

`qr_codes(id TEXT PK, wallet_id TEXT FK wallets, amount_cents INTEGER NULL, created_at TEXT, expires_at TEXT)`.

### Env vars

None. TTL is a code constant (300 s); the cap reuses `PAYMENT_MAX_CENTS`.

## Decisions

- QR codes are reusable until they expire.
- The receiver is saved as a contact by the web client on confirm, so the payments rule stays unchanged.
- The QR image is drawn in the browser. Scanning uses `BarcodeDetector` where available; pasting the text works everywhere.

## Risks

- `BarcodeDetector` is missing in Firefox/Safari: the paste fallback keeps the flow usable.
- Anyone who sees a QR can pay it, like a real receive-QR; amounts are capped.
