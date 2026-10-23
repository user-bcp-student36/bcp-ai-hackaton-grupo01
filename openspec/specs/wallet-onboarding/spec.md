# wallet-onboarding Specification

## Purpose
Let a person register a fictitious Peru wallet identity, understand simulated KYC
and receive a wallet only when their local verification result is active.

## Requirements

### Requirement: Simulated KYC verification
The system SHALL expose POST /api/v1/kyc/verification with {documentType,documentNumber}, returning 200 {kycStatus,simulated:true} from server configuration. Invalid input SHALL return 400 VALIDATION_ERROR in the common error shape.

#### Scenario: Deterministic KYC
- **WHEN** valid DNI or CE is submitted in each configured KYC mode
- **THEN** the response names activa, pendiente or rechazada and simulated true

#### Scenario: Client cannot select approval
- **WHEN** an extra kycStatus field is submitted
- **THEN** HTTP 400 rejects the request without changing server configuration

### Requirement: Wallet registration endpoint
The system SHALL expose POST /api/v1/users with {documentType,documentNumber,phone,email,password}, returning 201 {user:UserView} as defined in design.md. Validation returns 400 VALIDATION_ERROR; duplicate identity returns 409 USER_ALREADY_EXISTS in the common error shape.

#### Scenario: Register DNI
- **WHEN** a unique valid eight-digit DNI and six-digit string password are submitted
- **THEN** the user is created with normalized phone/email and UTC creation/update timestamps

#### Scenario: Register CE and leading-zero password
- **WHEN** valid lowercase CE and a six-digit password beginning with zero are submitted
- **THEN** CE is stored uppercase and the password retains all six characters

#### Scenario: Invalid registration
- **WHEN** a required field is missing, document/phone/email invalid or password not six digits
- **THEN** HTTP 400 identifies invalid fields without creating a partial account

#### Scenario: Duplicate normalized identity
- **WHEN** document pair, normalized phone or normalized email is already registered
- **THEN** HTTP 409 creates neither a second user nor a wallet

### Requirement: KYC controls wallet affiliation
The system SHALL create a wallet with configured fictitious opening funds only for activa, with active=true. Pendiente/rechazada SHALL persist active=false and walletId=null; a technical registration failure SHALL roll back and return 500/503 with walletId=null and the common error.

#### Scenario: Active affiliation
- **WHEN** registration KYC is activa
- **THEN** exactly one PEN wallet and opening allocation are persisted for that user

#### Scenario: Opening allocation is not repeated
- **WHEN** an existing active wallet has a changed balance and initialization is retried
- **THEN** no second opening allocation occurs and the changed balance is preserved

#### Scenario: Inactive affiliation
- **WHEN** registration KYC is pendiente or rechazada
- **THEN** the user is persisted without wallet and sees the correct non-active status

#### Scenario: Technical failure
- **WHEN** verification or persistence fails technically during registration
- **THEN** an explicit safe error is returned and no partial user, wallet or opening allocation remains

### Requirement: Credential secrecy and clear registration UI
The system SHALL store only salted password hashes, omit secrets from responses/logs and provide labeled registration controls with loading, validation, KYC outcome and safe failure states.

#### Scenario: Registration response excludes secrets
- **WHEN** registration succeeds or fails
- **THEN** no plaintext password, salt or password hash is returned or logged

#### Scenario: Registration form feedback
- **WHEN** a person submits the form and the API rejects a field or reports a non-active KYC outcome
- **THEN** accessible feedback explains the result without claiming the wallet is usable
