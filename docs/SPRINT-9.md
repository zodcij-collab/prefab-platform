# Sprint 9 — Public Website & Launch Preparation

Version target: `v0.9.0`

## Implemented

- Responsive public homepage polish for desktop, laptop, tablet and mobile layouts.
- Enlarged, proportion-preserving PREFAB.LV header logo.
- Latvian-default public translations with English and Russian selection through `?lang=lv|en|ru`.
- Centralized typed public copy; internal portal routes and copy are unaffected.
- Concise About, Our approach and Mission sections based only on supplied positioning and the supported 2002 experience date.
- Three clearly marked, fully localized LV/EN/RU project placeholders with replaceable title, location, country, year, optional client, scope, description, image and gallery fields.
- Configurable HTTPS social links and digits-only WhatsApp configuration; missing destinations are not clickable.
- Public proposal form with required-field validation, consent, honeypot and minimum completion-time protection.
- Honest delivery behavior: success appears only after a configured HTTPS webhook returns success.
- Search-crawler exclusion for `/portal/` and `/login`; protected portal and media routes retain server-side session enforcement.

## Public contact

- Email: `info@prefab.lv`
- Website: `https://www.prefab.lv`
- No public phone or WhatsApp number is invented. WhatsApp is hidden until configured.

## Deferred launch inputs

- Approved project names, facts, client permissions and photography.
- Production `CONTACT_WEBHOOK_URL` and receiving email/CRM transport.
- Real social profile URLs and WhatsApp number.
- Production database, persistent file storage, backups, HTTPS and DNS deployment.

## Quality gate

- Lint, typecheck, production build and `git diff --check`.
- Manual responsive and multilingual acceptance at desktop, laptop, tablet and mobile widths.
- Portal authentication and accepted Sprint 8 regression checks.
