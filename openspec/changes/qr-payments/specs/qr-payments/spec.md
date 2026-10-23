## ADDED Requirements

### Requirement: Create QR endpoint
The system SHALL expose authenticated POST /api/v1/qrs with optional {amountCents}. Success returns 201 {qr:{id,payload,amountCents,expiresAt}} for the caller's own active wallet, expiring 300 seconds after creation. Invalid input returns 400, a missing session 401 and an inactive account 403.

#### Scenario: Open-amount QR
- **WHEN** an active user creates a QR without an amount
- **THEN** the response has amountCents null, payload altoque-qr:<id> and an expiry 300 seconds ahead

#### Scenario: Fixed-amount QR
- **WHEN** an active user creates a QR with an amount within the payment cap
- **THEN** the response carries that exact amountCents

#### Scenario: Invalid amount or session
- **WHEN** the amount is zero, fractional or above the cap, or the bearer token is missing
- **THEN** the request returns 400 or 401 and no QR is stored

### Requirement: Resolve QR endpoint
The system SHALL expose authenticated POST /api/v1/qrs/resolve with {payload}. Success returns 200 {qr:{id,recipientWalletId,recipientPhone,amountCents,expiresAt}}. An unknown QR returns 404 QR_NOT_FOUND, an expired one 410 QR_EXPIRED, the caller's own QR 409 SELF_QR and a malformed payload 400.

#### Scenario: Resolve a valid QR
- **WHEN** another active user resolves an unexpired QR
- **THEN** the response names the receiver wallet, phone and fixed or open amount

#### Scenario: Expired, unknown or own QR
- **WHEN** the QR is expired, unknown or created by the caller
- **THEN** the response is 410 QR_EXPIRED, 404 QR_NOT_FOUND or 409 SELF_QR respectively

### Requirement: Pay with QR
The web client SHALL let a signed-in user scan or paste a QR, review the receiver and amount, and confirm. Confirmation SHALL save the receiver as a contact and pay through POST /api/v1/payments with a stable Idempotency-Key per confirmation.

#### Scenario: Fixed-amount QR payment
- **WHEN** a sender confirms a resolved fixed-amount QR
- **THEN** exactly that amount moves to the receiver and the success panel is shown

#### Scenario: Open-amount QR payment
- **WHEN** the sender types a valid amount for an open QR and confirms
- **THEN** that amount moves to the receiver

#### Scenario: Camera unavailable
- **WHEN** the camera is denied or BarcodeDetector is missing
- **THEN** the user can still paste the QR text and continue

### Requirement: Payment adapter wiring
The API composition root SHALL wire the SQLite payment adapter so POST /api/v1/payments commits instead of failing closed with 503.

#### Scenario: Contact payment commits
- **WHEN** an active sender pays a saved contact through the running app
- **THEN** the response is 201 and both balances change atomically
