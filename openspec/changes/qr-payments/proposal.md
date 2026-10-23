# Proposal

## Why

Typing a phone number to pay is slow. A receiver can show a QR code and the sender
scans it, so a frequent small transfer takes seconds. This was "Later" scope in the
project brief; the human now asks for it.

## What Changes

- A receiver generates a short-lived QR for their own wallet, with an optional fixed amount.
- A sender scans (camera) or pastes the QR text, sees who they pay and how much, and confirms.
- Payment reuses `POST /api/v1/payments` with its idempotency, so no payment contract changes.
  Confirming saves the receiver as a contact, which the payment rule already requires.
- Wire the SQLite payment adapter in the API composition root. It was never connected,
  so every payment returned 503 `STORAGE_UNAVAILABLE`.
- Out of scope: merchants, EMVCo/Yape/Plin payloads, remote mock `/qrs`, callbacks,
  reversals, single-use QR codes and real money.

## Capabilities

### New Capabilities

- `qr-payments`: create and resolve local QR codes, and pay a resolved QR.

### Modified Capabilities

None.
