# Spoonrun Helpdesk

A food-delivery customer-support dashboard built with **React, TypeScript, Express, and PostgreSQL**. Developed as a solo project for **Kendor Build Day**, this project focuses on reliability in a busy support workflow: preventing duplicate messages, ensuring one agent owns each conversation, keeping the waiting queue fair, and showing accurate unread counts.

> **Portfolio project:** This is a hackathon project built on a challenge starter application. It demonstrates the fixes and tests implemented during the event; it is not a production-ready customer-support platform.

## Highlights

- **Safe conversation ownership:** concurrent attempts to take the same conversation are handled atomically, so only one agent can claim it.
- **Webhook idempotency:** repeated deliveries of the same provider message are recognized and do not create duplicate messages or repeat side effects.
- **Fast message acknowledgement:** optional order enrichment runs separately from the initial webhook response.
- **Fair waiting queue:** oldest waiting conversations appear first; repeated follow-ups do not move a customer ahead of people who have waited longer.
- **Accurate unread counts:** the “Mine” badge reflects unread conversations assigned to the signed-in agent.
- **Safer team switching:** hovering over a team does not change the active team, and the conversation list updates when the selected team changes.

## Tech stack

| Area | Technologies |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Backend | Node.js, Express 5, TypeScript |
| Database | PostgreSQL, SQL |
| Testing | Node.js test runner, TypeScript (`tsx`) |
| AI-assisted development | Google Antigravity |

## Project structure

```text
api/src/          Express API, authentication, queries, and route handlers
web/src/          React support dashboard and components
db/               PostgreSQL schema, seed data, and migration
scripts/          Friday-lunch workload replay
test/             Challenge-provided tests
tests/            Additional regression tests
DECISIONS.md      Engineering decisions, trade-offs, and remaining work
```

## Run locally

### Prerequisites

- Node.js 22 or later
- PostgreSQL 16 or later

### 1. Install dependencies

```bash
npm ci
```

### 2. Create a local database

Create a dedicated database, for example `spoonrun_helpdesk`, and set `DATABASE_URL` in your shell:

```bash
export DATABASE_URL="postgresql://postgres:YOUR_LOCAL_PASSWORD@localhost:5432/spoonrun_helpdesk"
```

Initialize the database in order:

```bash
psql "$DATABASE_URL" -f db/01_schema.sql
export DEMO_PASSWORD="$(openssl rand -hex 16)"
psql "$DATABASE_URL" -v demo_password="$DEMO_PASSWORD" -f db/02_seed.sql
psql "$DATABASE_URL" -f db/03_provider_message_id_unique.sql
```

The seed data creates local demo agents:

- `agent.one@example.invalid`
- `agent.two@example.invalid`

The same `DEMO_PASSWORD` value is used by the workload replay. It is generated locally and is not stored in the repository. Use only a disposable local database. Do not deploy the seeded demo accounts or reuse production credentials.

### 3. Start the API

In one terminal, with `DATABASE_URL` set:

```bash
npm run dev:api
```

The API listens on `http://localhost:3000` by default. A health endpoint is available at `/api/health`.

### 4. Start the frontend

In a second terminal:

```bash
npm run dev:web
```

Open the local Vite URL printed in the terminal. The Vite development server proxies `/api` requests to the local API.

## Verification

Run the automated tests, TypeScript check, and production frontend build:

```bash
npm test
npm run typecheck
npm run build
```

The final hackathon verification completed with **28 passing automated tests and 0 failures**. The Friday-lunch replay processed a simulated hour of incoming customer and restaurant messages and reported:

- 0 duplicate customer messages
- 0 provider retries
- 0 simultaneous double-claims
- 0 customers receiving conflicting answers
- 0 cases where an agent answered someone who had waited less time than another waiting customer

To run the workload replay locally:

```bash
npm run shift
```

> **Note:** The replay resets demo conversations before running. Use a disposable local database, not a database containing data you need to keep. Keep `DEMO_PASSWORD` set to the same value used when seeding the demo agents.

## Engineering decisions

See [DECISIONS.md](DECISIONS.md) for the problems identified, the fixes implemented, the reasons for prioritizing them, and the improvements left for future work.

## Acknowledgements

Created for [Kendor Build Day](https://kendor.io/hackathons/kendor-build-day). Thanks to Kendor and the judges for the challenge and review.
