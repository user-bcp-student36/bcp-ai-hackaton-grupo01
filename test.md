# Test guide: users per scenario

All data is fictitious. Setup:

1. `npm ci`, copy `.env.example` to `.env`
2. `npm run db:migrate`, then `npm run seed:demo` (idempotent: re-running never resets balances)
3. `npm run dev` (web http://localhost:5173) or `npm run build` + `npm start` (http://127.0.0.1:3000)

Login is document number (DNI) + 6-digit password. Seeded password for every login below: **123456**.
Source of truth: `api/src/seeds/test-users.ts` and `api/src/seeds/failing-recipients.ts`.

## Seeded login users

| User | DNI | Phone | Password | Balance | KYC | Saved contacts |
|---|---|---|---|---|---|---|
| Ana (payer) | 70000010 | +51900000010 | 123456 | S/ 1,000.00 | activa | Beto, declined, timeout, intermittent |
| Beto (payee/merchant) | 70000011 | +51900000011 | 123456 | S/ 1,000.00 | activa | none |
| Saldo bajo | 70000012 | +51900000012 | 123456 | S/ 5.00 | activa | Beto, declined, timeout, intermittent |
| KYC pendiente | 70000013 | +51900000013 | 123456 | no wallet | pendiente | none |
| KYC rechazado | 70000014 | +51900000014 | 123456 | no wallet | rechazada | none |

Receive-only recipients (cannot log in, S/ 1,000.00 each):

| Recipient | DNI | Phone | Behaviour when paid |
|---|---|---|---|
| Recipient | 70000001 | +51900000001 | Succeeds |
| Declined | 70000002 | +51900000002 | 409 `PAYMENT_DECLINED` |
| Timeout | 70000003 | +51900000003 | 503 `PROVIDER_TIMEOUT` |
| Intermittent | 70000004 | +51900000004 | Fails first attempt per idempotency key; the automatic retry succeeds |

Biometric demo identities (no seed needed; the account is created on first entry with the password you choose):
DNI 72193412 (Andrés Koga, +51987000001) and DNI 45871236 (María Quispe, +51987000002).

## Scenarios

| # | Scenario | Who | Steps | Expected |
|---|---|---|---|---|
| 1 | Register, KYC active | New DNI, phone `9XXXXXXXX`, `DEMO_KYC_RESULT=activa` | `/registro` | Active account with opening balance |
| 2 | Register, KYC pending / rejected | New DNI, restart API with `DEMO_KYC_RESULT=pendiente` or `rechazada` | `/registro` | Inactive status shown, no wallet |
| 3 | Login pending / rejected | 70000013 / 70000014 | `/ingresar` | Status explained, no wallet access |
| 4 | Login | Ana | `/ingresar` | Wallet with S/ 1,000.00 |
| 5 | Biometric entry | 72193412 or 45871236 | Biometric option, choose password | Account created, then logged in |
| 6 | Add contact | Beto (no contacts) | Contacts, search +51900000001, save | Contact listed, payable right away |
| 7 | Pay a contact | Ana to Beto, S/ 10 | Pay | Receipt; Ana S/ 990.00, Beto S/ 1,010.00; appears in history |
| 8 | Insufficient funds | Saldo bajo to Beto, S/ 10 | Pay | Clear insufficient-funds message, balance unchanged |
| 9 | Amount over limit | Ana to Beto, above the per-payment limit | Pay | Rejected with limit message |
| 10 | Idempotent retry | Ana to Beto | Pay, then repeat the same request with the same `Idempotency-Key` (API) | Same payment returned (200), one debit; different body with same key gives 409 |
| 11 | Declined | Ana to +51900000002 | Pay | "Declined" message, retry button, no debit |
| 12 | Timeout / pending | Ana to +51900000003 | Pay | Unknown-state message, no double debit on retry |
| 13 | Intermittent + auto retry | Ana to +51900000004 | Pay | First attempt fails, automatic retry with same key succeeds, one debit |
| 14 | QR generate | Beto | `/cobrar`, set amount | QR payload `altoque-qr:<id>`, valid 300 s |
| 15 | QR pay | Ana | `/pagar-qr`, paste Beto's payload | Receipt; balances updated |
| 16 | QR own / expired | Beto pays own QR, or wait 300 s | `/pagar-qr` | Rejected |
| 17 | History and receipt | Ana after 7 or 11 to 15 | History, open a receipt | Transactions with status and receipt details |

Notes: the intermittent failure state is kept in memory and resets when the API restarts. Re-seeding does not restore balances spent in earlier tests; delete the SQLite file (see `DATABASE_PATH` in `.env`) and run migrate and seed again for a clean state.
