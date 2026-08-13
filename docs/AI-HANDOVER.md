# AI Handover — PREFAB.LV

This document lets a coding agent (Claude Code or Codex) resume development without
reconstructing the whole project history. Keep it short and operational. Update it
when an invariant or procedure genuinely changes.

> **The repository and its tests are the source of truth.** Never assume another
> agent's summary, changelog note, or prior report is correct without verifying it
> against the actual code, schema and tests. Read before you replace.

---

## CURRENT STATE — Sprint 12 under manual acceptance (checkpoint 2026-08-12)

- **Sprint 12 (Load Planning & Delivery Schedule) + its Acceptance Fix Pack are IMPLEMENTED but NOT accepted and NOT committed.** They live as **uncommitted working-tree changes** on branch `sprint-12-load-planning` (committed baseline `HEAD = a4858e6…`, "finalize project access lifecycle and pilot readiness"). All Sprint 12 code is on disk (see `app/portal/projects/[id]/loads/`, `components/portal/LoadEditor.tsx`, `lib/loads.ts`, `lib/load-schedule-pdf.ts`, `tests/loads*.test.ts`).
- **Edvard is currently performing manual acceptance.** **Do NOT start any new development, and do NOT commit or push, until Edvard explicitly accepts.** Roles: **Claude implements code; Codex analyzes requirements, reviews, and accepts.**
- **Pilot database `data/prefab.db` holds REAL pilot data** — project `skaistkalnes-iela-1a` (671 elements, IDs 682–1352), 9 project documents, 5 employees — plus **live acceptance loads** (as of this checkpoint: Load 1 = a labelled QA load "safe to cancel/delete"; Load 2 = a real load Edvard built during acceptance). **Never reset, reseed, or destructively modify it.** External backup: `C:\Projects\prefab-platform\backups\pilot-2026-08-12T13-54-56-789Z\`.
- **Load Planning known state (working):** routes are `…/loads` (delivery schedule), `…/loads/new` (unsaved editor), `…/loads/[loadId]` (editor / accept panel / receipt view by status), `…/loads/schedule` (PDF). A load **persists only on the first successful save** — opening `/loads/new` and abandoning it writes nothing and consumes no load number. Confirmed **vertical** transport height limits: Standard 3100 / Jumbo 3450 / Titanic 4100 mm (`>4100` non-standard); payload/length/width are still placeholders. Default orientation: floor slabs (Hollow core / Solid slab) → Horizontal, others → Vertical.
- **Sprint 12 Improvement Pack (IMPLEMENTED, uncommitted, under acceptance):** adds (1) **Installation Zones** — operational erection groups, additive `installation_zones` table + nullable `project_elements.installation_zone_id`; separate from the design `zone` and **preserved across XLSX re-sync** (applyElementImport writes only design fields); managed on the Element Register, filterable in Load Planning. (2) **Multi-value OR search** (comma/semicolon), **length sort**, **weekend-delivery warning + persisted ack** (`loads.weekend_ack`), **type-aware orientation warning** (`unusual_orientation`; a floor slab carried flat no longer warns). (3) **Load → Delivery → Installation lifecycle** — a Planned load can be **received** (`acceptLoad`) as-planned or **with discrepancies**; the actual received composition is recorded in an **append-only receipt** (`load_receipts` + `load_receipt_elements`); missing elements are **released** for re-planning, added elements reference real element IDs, received/added elements become **On site**; an Accepted load is **frozen** (no re-plan/cancel). **Installation progress is DERIVED** from element status against the actual received composition — installation itself is still a Daily-Report fact (`Fully installed` = every received element `Installed`). New status `Accepted`. RBAC: receive = `loads.manage`, with-discrepancies = `loads.approve_exception`. Baseline `npm test` = **135 passing**. New migrations: `sprint12_installation_zones`, `sprint12_load_weekend_ack`, `sprint12_load_delivery` (all additive + idempotent, verified against a pilot-DB copy).
- **Recovery for a fresh session:** `git status` / `git log -5`, read this file, then `npm test` (expect 124 pass). Run the app with `rm -rf .next && npm run dev` (see "Local dev server" note below). Do NOT `npm run build` while relying on a running dev server.

---

## Current architectural invariants

These rules are load-bearing. Do not break them without an explicit, documented decision.

- **`project_elements.id` is the immutable physical-element identity.** It is the only
  stable identity for an element.
- **`element_code` may repeat within a project.** It is a supplier/drawing display mark,
  not a unique key. There is intentionally **no** `UNIQUE(project_id, code)` constraint
  (removed in Sprint 11.1). Do not reintroduce one.
- **Design synchronization (XLSX/CSV) must never overwrite operational state.** It may
  write only design fields (type, floor, zone, drawing/reference, description, weight,
  dimensions, supplier, planned delivery date). It must never write `status`,
  `actual_delivery_date`, `installation_date`, `installed_report_id`, issue/hold data,
  or `element_status_history`.
- **`Installed` is finalized only through an approved Daily Report.** Approval finalizes
  linked elements atomically in one transaction; a DB trigger
  (`project_elements_installed_correction_guard`) blocks direct downgrades of installed
  elements. Reversing an installation goes through the correction workflow
  (`correctInstalledElement`) with a mandatory reason.
- **Operational and history changes are append-oriented.** `element_status_history` is
  append-only; corrections add rows and preserve the original report link — no silent
  overwrites.
- **Server-side RBAC and project scope are mandatory.** Every server action and route
  re-checks authentication and project authorization (`lib/permissions.ts`). Never rely
  on client-side gating.
- **Multi-table mutations must be transactional.** Use `runTransaction` (`BEGIN IMMEDIATE`)
  for anything touching more than one row/table that must be consistent. Note it is a
  single flat transaction and is **not** nestable.
- **LV / EN / RU localization is mandatory.** All user-facing portal strings go through
  `portalText` (`data/portal-i18n.ts`). Never translate user-entered data (codes,
  descriptions, names).
- **Operational portal data must never become public.** No register, report, attendance,
  weather or media data on public routes; `/portal/*` is `private, no-store`; stored file
  paths are never exposed to the client.

## Data / database notes

- Storage is `node:sqlite` (`DatabaseSync`) — no ORM. Schema and migrations live in
  `lib/db.ts` (base `CREATE TABLE IF NOT EXISTS`, guarded `ALTER TABLE`, and named
  migrations gated on the `schema_migrations` table). `foreign_keys` is ON; WAL mode.
- **Development/production use `data/prefab.db`** (a fixed path). It is gitignored and
  must not be committed or mutated by tests.
- **Tests use a disposable database.** `lib/db.ts` reads `PREFAB_DB_PATH` (falling back to
  `data/prefab.db`). `tests/helpers/test-db.ts` points it at a temp file in the OS temp
  directory and imports the DB module dynamically, so migrations/seeding run against the
  throwaway DB only. Real dev data is never touched.

## Local dev server (avoid stale-route 404s)

`next dev` (Turbopack) and `next build` share the `.next/` directory. Running
`npm run build` (e.g. the quality gate) while a `next dev` server is running — or
starting `next dev` on a `.next/` left behind by a build — can leave the dev server
serving a **stale route tree**, so newly added routes return 404 even though the code
is correct. **Before starting `npm run dev` after a build, remove the cache:**
`rm -rf .next && npm run dev`. This was the root cause of the Sprint 12 "Create load
→ 404" report (the load routes were correct; the running dev server had a stale cache).

## Agent start procedure

Before coding:

1. `git status`
2. Confirm the current branch (`git rev-parse --abbrev-ref HEAD`).
3. `git log -5`
4. Read this file (`docs/AI-HANDOVER.md`).
5. Read the relevant sprint documentation in `docs/` (e.g. `SPRINT-11.md`,
   `SPRINT-11-1.md`).
6. Inspect the existing implementation before proposing replacements — read the code and
   tests that already cover the area.
7. Run the baseline tests before modifying anything (`npm test`).

## Agent finish procedure

Before handover:

1. `npm test`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run build`
5. `git diff --check`
6. `git status`
7. Report the exact changed files.
8. Report database/migration impact (schema changes, new migrations, data effects).
9. Report known limitations.
10. Do not commit or push unless explicitly instructed.

## Scope discipline

Prefer the smallest correct change. Do not perform speculative refactors, redesign the
repository layer, migrate away from `node:sqlite`, introduce an ORM, or delete legacy
compatibility fields unless the task explicitly requires it.

## Future backlog (NOT Sprint 12 — record only, do not implement)

- **Problems / Defects / Tasks / Deviations module.** Confirmed during Sprint 12 acceptance
  as a future requirement, distinct from the current lightweight `project_issues` register.
  It should support: photo/file attachments (multiple, incl. before/after evidence);
  responsible person; a lifecycle through resolution/closure with a resolution record;
  a relation to a physical element by immutable `project_elements.id` where applicable;
  Installation Zone; drawing / drawing location; link to a Daily Report; and
  author/timestamp/history. **Do not start this without an explicit sprint.**
- **Logistics domains stay separate.** Precast element delivery lives in the Sprint 12
  `loads` domain; general material logistics lives in the legacy `deliveries` table. Do not
  merge them. Project Overview surfaces both under one "Logistics" heading as two labelled
  subsections (Element deliveries / Material deliveries).
