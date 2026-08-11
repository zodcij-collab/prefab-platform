# AI Handover — PREFAB.LV

This document lets a coding agent (Claude Code or Codex) resume development without
reconstructing the whole project history. Keep it short and operational. Update it
when an invariant or procedure genuinely changes.

> **The repository and its tests are the source of truth.** Never assume another
> agent's summary, changelog note, or prior report is correct without verifying it
> against the actual code, schema and tests. Read before you replace.

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
