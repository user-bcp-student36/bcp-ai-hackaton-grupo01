# Tasks

## 1. Wire payments and add QR create/resolve API
<!-- issue: area=backend size=M priority=p1 agent=auto files=api/src/app.ts,api/src/features/qr/,api/db/migrations/005-qr.sql,packages/contracts/src/qr.ts -->
- [x] 1.1 Compose the SQLite payment adapter into app.ts; verify a contact payment returns 201.
- [x] 1.2 Add migration 005, qr contracts, create/resolve use cases and routes; verify every error in design.md.
- [x] 1.3 Test create (open/fixed/invalid), resolve (valid/expired/unknown/own) and a committed payment.

## 2. Build QR receive and pay screens
<!-- issue: area=frontend size=M priority=p1 depends=1 files=web/src/features/qr/,web/src/App.tsx,web/src/ui/PageShell.tsx -->
- [x] 2.1 Add /cobrar to create and show a QR with optional amount and expiry.
- [x] 2.2 Add /pagar-qr to scan or paste, review, confirm and pay with a stable idempotency key.
- [x] 2.3 Test the fixed, open and camera-unavailable scenarios and one failure case.
