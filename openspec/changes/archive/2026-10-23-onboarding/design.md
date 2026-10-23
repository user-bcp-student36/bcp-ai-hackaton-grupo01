## Contracts

Common JSON, errors, IDs, timestamps and env: `../scaffold/design.md#contracts`.
This change is the sole owner of user/wallet public shapes.

`DocumentType = "DNI" | "CE"`; `KycStatus = "activa" | "pendiente" | "rechazada"`.
`UserView = {id,documentType,documentNumber,phone,email,walletId:string|null,
kycStatus,active:boolean,createdAt,updatedAt}`.
`WalletView = {id:string,currency:"PEN",balanceCents:number}`.
All fields required; password/hash never appear. `active` iff KYC activa and
walletId non-null; wallet belongs to exactly one user.

Normalization: trim document/phone/email, uppercase CE, lowercase email. DNI
`^[0-9]{8}$`; CE `^[A-Z0-9]{9,12}$` (demo rule only); phone accepts
`^9[0-9]{8}$` or `^\+519[0-9]{8}$`, stores +51 form. No arbitrary punctuation.
Email valid format, at most 254 chars. Password `^[0-9]{6}$` string, no numeric
coercion (leading zero preserved). No trimming passwords.

| Route | Request | Success | Specific failures |
|---|---|---|---|
| POST /api/v1/kyc/verification | `{documentType,documentNumber}` | `200 {kycStatus,simulated:true}` | `400 VALIDATION_ERROR`, `429 RATE_LIMITED` |
| POST /api/v1/users | `{documentType,documentNumber,phone,email,password}` | `201 {user:UserView}` for any KYC outcome | `400 VALIDATION_ERROR`, `409 USER_ALREADY_EXISTS`, `429 RATE_LIMITED` |

Both are unauthenticated and rate-limited by IP using scaffold limits. KYC returns
only the configured mock outcome, never a user lookup, identity data or approval
of a real document. Registration independently invokes the same KYC port; it
never trusts a client-supplied KYC state, wallet ID or balance. Errors `500/503`
on registration use the common error plus top-level `walletId:null`; no partial
user/wallet is persisted. Other validation/business errors use the common shape.

Local mock interface (not an external HTTP call):
`verify({documentType,documentNumber}) -> {kycStatus,simulated:true}`.
It implements the `/kyc/verification` requirement without an incompatible remote
TEST-only API. `DEMO_KYC_RESULT` is server configuration, never request input.
To demonstrate each result, restart with another config or use separate isolated
test instances. Existing users' KYC outcomes never change on restart.

Data in migration `001-onboarding.sql`:
- users: id PK, document_type, document_number, phone UNIQUE, email UNIQUE,
  password_hash, wallet_id nullable UNIQUE FK wallets, kyc_status, active,
  created_at, updated_at; UNIQUE(document_type,document_number).
- wallets: id PK, user_id UNIQUE FK users, currency CHECK PEN,
  balance_cents integer 0..100000000, created_at, updated_at.
- wallet_openings: wallet_id PK/FK, amount_cents, created_at; records one fictitious
  opening allocation per active wallet. No repeated login/seed allocation.
Nullable relationship is completed in one transaction: user -> wallet -> user
wallet_id. Non-active user has no wallet. Technical failure rolls back all rows.
Timestamps generated from one injected clock, IDs from injected generator.

Store scrypt hash with fresh random salt >=16 bytes, N=16384, r=8, p=1,
derived key 64 bytes; persist algorithm/parameters/salt/hash together. Verify
with timingSafeEqual; do not encrypt/recover the password. Never log these values.
Env are scaffold-owned; no additional env.

## Context

Greenfield p0 slice, local fictitious identity only. See proposal for motivation.

## Goals / Non-Goals

**Goals:** exact input rules, durable three-state affiliation and truthful UI.
**Non-Goals:** biometric/legal identity checks, state transitions or manual review.

## Decisions

- Uniqueness is enforced in SQLite, not just a pre-check; conflict reveals no field.
- KYC pending/rejected is a persisted business result (`201`), not a technical error.
- KYC preview is optional for the UI; backend registration always re-verifies.
- User and wallet read/write ports are defined here for auth; auth may call
  exported onboarding use cases/ports, never import its persistence adapters.
- One frontend registration form uses shared schemas, handles loading/conflict/
  failure and labels the demo. Initial design system is scaffold group 2.

## Risks / Trade-offs

- [Six-digit password weak] -> hashed, rate-limited, fictitious local demo only;
  no production security claim.
- [Public document endpoint] -> deterministic mock only, rate limiting, no lookup,
  no bodies or PII in logs; no live provider integration.

## Migration Plan

Apply 001 once. No reset or refill on restart. Roll back a failed registration
transaction; retain existing demo data on unrelated application failure.

## Traceability

Registration -> route/form tests for DNI, CE, leading-zero password, malformed and
duplicate data; KYC -> three isolated config cases plus unknown fields; affiliation
-> real SQLite rollback/restart tests; privacy -> no hash/salt in response/logs.
Tests call public HTTP/component surfaces, with controllable mock KYC failures.
