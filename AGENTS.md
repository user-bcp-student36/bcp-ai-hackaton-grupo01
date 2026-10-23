# AGENTS.md

Instructions for AI coding agents and humans working in this repo. The full project brief (problem, demo script, scope) is the `context:` in `openspec/config.yaml`.

## Project

- What it is: Wallet Grupo 1, a Peru wallet demo with fictitious identities and funds.
- Backend: TypeScript + Fastify 5 on Node 24.
- Frontend: React + TypeScript (Vite).
- Data and other services: local SQLite (`node:sqlite`, verify in scaffold), local KYC mock, shared Zod contracts.

The approved 2026-10-23 12:30 Peru cutoff is **onboarding, KYC, login and own wallet only (p0)**.
Contacts, payments, receipts and history are approved **p1 after that cutoff**.
No optional opportunities were approved. This is a local demo, not a live wallet.

**Coding standards** are in `.github/instructions/`, and Copilot loads them by file type. `coding-standards` applies to every file. Then, by stack:

| Stack | Standards |
|---|---|
| Frontend | `typescript`, `react` |
| Backend `TypeScript + Fastify` | `backend-architecture`, `typescript`, `fastify` |
| Backend `Java + Quarkus` | `backend-architecture`, `java`, `quarkus` |

Read the ones for your lane before writing code, if they aren't already in your context. A PR that breaks them doesn't pass review.

## Project structure

Planned layout; scaffold creates and verifies it. Product folders do not exist yet.

```
web/                 frontend: src/ui, src/lib, src/features/<slice>
api/                 backend: src/features/<slice>/{domain,application,adapters}, src/shared, db/migrations, db/seeds
packages/contracts/  backend: one shared Zod schema file per slice; frontend consumes without editing
tests/e2e/           backend: integrated journey tests, coordinated with frontend
openspec/            conductor/backend: reviewed brief, per-slice contracts and issue-ready tasks
docs/                conductor/backend: setup, workflow, mock reference and quality evidence
scripts/             conductor/backend: orchestration and initial workspace tooling
```

Stay inside your lane's folders. Edit another lane's files only when the issue says to.

## Commands

| Task    | Command |
|---------|---------|
| Spec validate | `openspec validate --all --strict` |
| Install | `npm ci` |
| Dev     | `npm run dev` |
| Lint    | `npm run lint` |
| Test    | `npm test` |
| Build   | `npm run build` |
| Seed    | `npm run db:migrate` then `npm run seed:demo` |
| Reset DB | `node scripts/services.mjs stop`, then `npm run db:reset` (purges, migrates, seeds) |
| Start/stop both | `node scripts/services.mjs start\|stop\|restart\|status [--build]` (API :3000, web :5173; logs in `.orchestrate/`) |

`node scripts/orchestrate.mjs check` runs Spec validate, then Install, Lint, Test and Build, from this table: it is the CI. `scaffold` fills in the TODO rows with commands that work in any Windows shell (for example `npm run lint`).

## Planning and demo quality roles

The conductor uses `product-owner` to recommend scope and p0/p1/p2 priorities, then `architect` to review initialization, scaffold and contracts before human approval. Priorities are recorded in OpenSpec task metadata; the orchestrator remains the sole assignment authority.

At every demo cutoff and final handoff, use the `demo-cutoff` skill with independent `tester` and `security` sessions on the same immutable commit and scope. These are external reviewers, not implementation lanes; they never call `work` or `done`. Persist reports and the readiness decision through a normal PR. Missing, failed or stale evidence blocks readiness. See [docs/quality-workers.md](docs/quality-workers.md) for setup and entry points.

## Rules

- **Spec first.** Planned work is in `openspec/changes/<id>/`, merged behavior in `openspec/specs/`. The `## Contracts` section of each change's `design.md` is the source of truth for API shapes. Read it before writing code, and don't change it unless the issue says to.
- **One task group = one issue = one PR.** Implement only the group your issue names, and tick only its boxes in `tasks.md`.
- **Never pick work yourself.** `node scripts/orchestrate.mjs work --lane <lane>` returns your assigned unit, and `done` (or `done --failed`) reports it. Don't claim or reassign issues by editing labels or assignees, and don't move cards on the project board: the orchestrator keeps it in step with the labels.
- **The git and CI steps are scripted: use the script, not hand-typed git.** `orchestrate.mjs start <N>` (branch), `rebase`, `check` (the CI), `pr` (open the PR), `park <N>` (ask a human), `review-start <PR>` and `reviewed` (review and merge). The skills say when. `pr` and `reviewed --merge` refuse anything `check` didn't pass on.
- **Forks work the same.** If you aren't the repo's owner you may work in a fork (`origin` is your fork, `upstream` the team's repo). The script reads main and the issues from `upstream`, pushes to your fork, and opens PRs on the team's repo.
- Never push to `main`, and never check out `main` itself: worktrees share it. Push your branch after each commit, so the next worker can continue it if this machine stops.
- Small PRs, under roughly 400 changed lines. Conventional Commits: `feat|fix|chore|docs|test|refactor(<area>): summary (#N)`
- **Windows, any shell** (PowerShell, CMD or Git Bash). No bash scripts: automation is Node or a skill. One plain command per line: no `&&` chains, pipes, redirects or `$(...)`, and `"@me"` is always quoted. Write files with your file tool, never with a shell redirect.
- Files you write for `gh` or the script (PR bodies, review bodies, comments, questions) go in `.orchestrate/`, which is gitignored and works in a worktree, where `.git` is a file, not a folder.
- **Free text never goes inline.** Windows PowerShell silently drops backticks and `$words` inside `"..."` and splits on `\"`. So comments, issue bodies and commit messages with any of those go in a file: `--body-file .orchestrate/<name>.md` for `gh`, `git commit -F .orchestrate/commit.txt` for git. A short `--title` or `-m` without them is fine.
- **GitHub access: MCP first, `gh` as the fallback.** For reading and updating issues, PRs, comments and labels, use the GitHub MCP server if your session has it: in VS Code the `github` server from `.vscode/mcp.json`, in Copilot CLI its built-in `github-mcp-server`. If its tools aren't loaded, fail, or can't do the step, run the `gh` command the skill shows. The two are interchangeable, with three rules:
  - Always target the **team's repo** (the `upstream` remote in a fork, otherwise `origin`), never your fork. `gh` does this after `gh repo set-default`; with MCP, pass that owner and repo explicitly.
  - MCP must be signed in as the **same GitHub account** as `gh auth status`. Worker ids, `"@me"` and the "can't approve your own PR" rule all depend on it. If it isn't, use `gh`.
  - Steps that run on this machine stay CLI: `orchestrate.mjs` (it calls `gh` itself), `gh pr checkout`, git, and anything a skill says to do through the script. Never merge or open a PR through MCP: `reviewed --merge` and `pr` are the merge gate. MCP takes text directly, so it needs no `.orchestrate/` body file.
- **Secrets** never go in code, tests, fixtures, logs, PR bodies or commits. Config comes from env vars in `.env` (gitignored), each listed in `.env.example`.
- **Need a human decision?** Write the question and the options to `.orchestrate/question.md`, run `node scripts/orchestrate.mjs park <N> --body-file .orchestrate/question.md`, and move on.
- New scope goes through `/plan` (an OpenSpec change and a spec PR), never through issues created by hand.

## Deploy

The human explicitly approved a **local demo instead of public deployment** for this phase.
Scaffold must record verified install/dev/build/start steps and local URLs here.
Do not claim a live deployment, choose a hosting provider or use real payment services.
Public deployment requires a later explicit decision about HTTPS and persistent storage.

Local steps, verified on Node 24.22.1 (`.node-version`):

1. `npm ci`, then copy `.env.example` to `.env`.
2. `npm run build`, then `npm start`. The API serves the built web shell and `/api/v1`.
3. Open http://127.0.0.1:3000 (API and built web). `npm run dev` instead serves the web at http://localhost:5173 and proxies `/api` to the API on port 3000.

Unknown `/api/*` routes return a JSON 404. Invalid configuration makes `npm start` exit with code 1.
