# Sprint 9 — Portal Foundation / Project Workspace

## Implemented

- Added a centralized LV/EN/RU portal dictionary and a protected, cookie-backed portal language preference. Latvian is the default for new sessions; the public-site locale remains independent.
- Localized the operational sidebar, account menu, dashboard, projects list, project workspace navigation and controls, employees register, documents register, daily-report list and daily-report creation workflow.
- Refined the dashboard around live database counts for active projects, employees, reports submitted today and important documents.
- Exposed project start and target dates in the project register while preserving the existing database-backed Sprint 7 project workspace.
- Kept the existing authentication, role permissions, activity logging, document/photo storage and server actions unchanged.

## Routes

- `/portal` — operational dashboard.
- `/portal/projects` and `/portal/projects/[id]` — project register and central workspace.
- `/portal/employees` — employee register and project assignments.
- `/portal/documents` — searchable document register.
- `/portal/reports` and `/portal/reports/new` — report register and persisted daily-report workflow.
- `/portal/access` — existing Director/Administrator user administration.

## Data architecture and persistence

Portal records use the existing typed repository layer in `lib/repositories.ts` and SQLite schema in `lib/db.ts`. Projects, memberships, deliveries, issues, reports, activity, users, uploaded documents and site photos remain persisted. The seeded records created only for an empty local database are demonstration records and must not be presented as verified PREFAB.LV business claims.

Portal language is a presentation preference stored in the `prefab_portal_language` HTTP-only cookie. Persisted statuses and operational data retain their canonical values; localization occurs only when values are rendered.

## Known limitations and next step

- Employee create/edit workflows and additional employee contact fields remain future work.
- Report attachments continue through the existing project document/photo workspace rather than being embedded in a report.
- Search controls that were already presentation-only remain candidates for server-backed filtering.
- Recommended next step: consolidate the remaining administration and media-dialog microcopy into the same portal dictionary, add employee management, and expand report domain fields only after operational validation.
