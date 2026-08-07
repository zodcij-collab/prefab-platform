# PREFAB.LV Corporate Platform

Sprint 9 development target: `v0.9.0`

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Authenticated portal: `http://localhost:3000/portal`.

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

## Local login

The first local start creates `data/prefab.db` automatically.

Default local account:

- Email: `admin@prefab.lv`
- Password: `ChangeMe2026!`

To set another initial account, copy `.env.example` to `.env.local` **before the first start** and change the credentials. The local database file is intentionally ignored by Git.

## Public website configuration

- `APP_TIMEZONE` — IANA timezone, default `Europe/Riga`.
- `NEXT_PUBLIC_LINKEDIN_URL`, `NEXT_PUBLIC_FACEBOOK_URL`, `NEXT_PUBLIC_INSTAGRAM_URL` — optional HTTPS social profiles.
- `NEXT_PUBLIC_WHATSAPP_NUMBER` — optional digits-only international WhatsApp number; no action is rendered when omitted.
- `CONTACT_WEBHOOK_URL` — optional server-only HTTPS endpoint for lead-form JSON delivery. Without it, the form clearly reports that online delivery is unavailable.

See [docs/PRODUCTION-LAUNCH.md](docs/PRODUCTION-LAUNCH.md) for deployment requirements and the launch checklist.
