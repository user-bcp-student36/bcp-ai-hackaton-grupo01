# Tasks

## 1. Provide owner-scoped contact lookup and persistence
<!-- issue: area=backend size=M priority=p1 agent=auto depends=scaffold:2,auth:3 files=api/src/features/contacts/,api/db/migrations/003-contacts.sql,api/db/seeds/contacts.ts,packages/contracts/src/contacts.ts,api/src/app.ts -->
- [x] 1.1 Implement lookup/add/list Contracts, 003 migration and idempotent fictitious recipient seed; verify the seed never resets balances.
- [x] 1.2 Wire bearer/active guards, normalized lookup, self/inactive checks and unique owner-contact links; verify no owner input or private identity output is accepted.
- [x] 1.3 Test inject and real SQLite: lookup success/malformed/missing/self/inactive, add/repeat/capacity, own empty/list, auth failure and cross-user isolation.

## 2. Add contact search, save and selection interface
<!-- issue: area=frontend size=M priority=p1 depends=scaffold:2,1,auth:3 files=web/src/features/contacts/,web/src/App.tsx -->
- [ ] 2.1 Add phone search, explicit add and own-contact list/selection using shared schemas; verify loading/error/empty/not-found states.
- [ ] 2.2 Bind navigation only after p0 login and clear contact query state on logout; verify recipient is never fabricated after a failed lookup.
- [ ] 2.3 Test lookup/add/list success and failure via userEvent and contract mocks, including duplicated add and account switch.
