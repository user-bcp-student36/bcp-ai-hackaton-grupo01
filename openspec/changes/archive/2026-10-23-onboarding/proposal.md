# Proposal

## Why

People need a short registration journey with explicit identity-verification outcomes.
The reduced cutoff includes onboarding, not a real KYC service.

## What Changes

- Register fictitious DNI/CE, phone, email and six-digit password.
- Persist scrypt hashes, deterministic KYC and wallet creation only on approval.
- Reuse scaffold's accessible design primitives for registration/status screens.
- Out of scope: biometrics, real documents, manual KYC review, recovery and payments.

## Capabilities

### New Capabilities

- `wallet-onboarding`: registration, validation and simulated KYC wallet affiliation.

### Modified Capabilities

None.

## Impact

`api/src/features/onboarding`, `web/src/features/onboarding`,
onboarding schemas and migration. p0; depends on scaffold, never on p1.
