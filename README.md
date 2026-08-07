# PREFAB.LV Corporate Platform

Sprint 2 release: `v0.2.0-alpha.1`

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Portal preview: `http://localhost:3000/portal`.

## Quality checks

```bash
npm run lint
npm run typecheck
npm run build
```

## Main folders

- `app/` — Next.js routes
- `components/ui/` — reusable PREFAB UI components
- `components/sections/` — public website sections
- `company/` — mission and product principles
- `data/` — structured company/site data
- `docs/` — sprint and technical documentation
- `public/` — production-ready public assets

## Sprint 4 login

The first local start creates `data/prefab.db` automatically.

Default local account:

- Email: `admin@prefab.lv`
- Password: `ChangeMe2026!`

To set another initial account, copy `.env.example` to `.env.local` **before the first start** and change the credentials. The local database file is intentionally ignored by Git.
