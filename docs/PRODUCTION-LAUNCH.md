# PREFAB.LV Production Launch Checklist

## Runtime and environment

- Use Node.js 22.5 or newer and install locked dependencies with `npm ci`.
- Set `NODE_ENV=production`, a valid IANA `APP_TIMEZONE`, and strong initial administrator credentials before the first database start.
- Configure optional HTTPS social URLs, digits-only `NEXT_PUBLIC_WHATSAPP_NUMBER`, and a server-only HTTPS `CONTACT_WEBHOOK_URL`.
- Never expose database paths, session data, webhook credentials or other secrets through `NEXT_PUBLIC_*` variables.

## Database and storage

- Provide a persistent writable volume for `data/prefab.db` and `storage/uploads`.
- Do not run SQLite on ephemeral or multi-writer network storage without a supported migration plan.
- Back up the database and upload directory together and test restoration before launch.
- Define retention, access and privacy handling for enquiries at the webhook destination.

## Build and start

```bash
npm ci
npm run lint
npm run typecheck
npm run build
npm run start
```

- Run behind an HTTPS reverse proxy and expose only the required application port.
- Preserve secure cookies and forwarded HTTPS protocol information.
- Confirm `/portal/*` and authenticated media URLs reject unauthenticated access.

## Domain and DNS

- Provision the production host before changing DNS.
- Add and verify `prefab.lv` and `www.prefab.lv` records with the selected provider.
- Issue TLS certificates for both names, redirect HTTP to HTTPS and select one canonical hostname.
- Verify sitemap, robots, metadata and redirects after propagation.

## Email, WhatsApp and social configuration

- Connect `CONTACT_WEBHOOK_URL` to a production email or CRM receiver that validates requests and protects credentials server-side.
- Test success, receiver failure, spam and consent paths; add infrastructure-level rate limiting before public promotion.
- Add a real international WhatsApp number only with company approval.
- Add only verified HTTPS social profiles; unconfigured links remain hidden.

## Final launch checks

- Replace project placeholders with approved facts and licensed images, or keep them clearly marked.
- Test LV, EN and RU at desktop, laptop, tablet and mobile widths.
- Confirm contact data, privacy wording and enquiry ownership.
- Run the full Sprint 8 portal regression and role matrix.
- Confirm uploads, `.env*`, SQLite files, logs and build output remain outside Git.
- Enable monitored backups, error monitoring and a rollback procedure.
- Deploy only after authorized DNS and production-release approval.
