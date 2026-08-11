# Sprint 11 — Project Elements Registry & Installation Control

Sprint 11 adds a project-scoped element register as the installation source of truth. It preserves all existing Daily Report, media, PDF, workforce and timesheet behavior.

> **⚠️ Identity rule superseded by Sprint 11.1.** The original Sprint 11 design treated `project_id + code` as a database-enforced unique identity. Sprint 11.1 (migration `sprint11_1_repeated_element_marks`) **removed the `UNIQUE(project_id, code)` constraint** so that repeated physical elements sharing the same supplier/drawing mark can be tracked separately. From Sprint 11.1 onward, the authoritative rule is: **`project_elements.id` is the immutable physical-element identity, and `code` is a display/design mark that MAY repeat within the same project.** The "Model and identity" paragraph below describes the original Sprint 11 assumption and is retained only for historical context — see [SPRINT-11-1.md](SPRINT-11-1.md) for the current rule.

## Model and identity

> **Historical (Sprint 11) — superseded, see the note above.** In Sprint 11, `project_id + code` was the enforced unique identity. This is no longer true; `id` is the identity and `code` may repeat within a project as of Sprint 11.1.

`project_elements` stores one individually identifiable element per row. In the original Sprint 11 design, identity was `project_id + code`, case-insensitive and database-enforced, with codes allowed to repeat across projects but not within one project. Optional metadata includes type, floor, zone, drawing reference, description, weight, dimensions, supplier and delivery dates. `daily_report_elements` links selected elements to reports. `element_status_history` is append-only operational history. The migration is idempotent and creates project/filter/history indexes without fabricating historical elements.

Canonical types are Wall panel, Hollow core slab, Solid slab, Beam, Column, Stair, Balcony, Parapet, Landing, Steel element and Other. Canonical statuses are Planned, Expected, Delivered, On site, Installed, Issue, Rejected / Hold and Replaced. User-entered codes and descriptions are never translated.

## Workflow

Draft and Submitted reports reserve/link selected elements but do not mark them Installed. Approval is the formal installation point. Approval and all linked element updates run in one `BEGIN IMMEDIATE` transaction. Each element update is conditional on an installable status and a null installed-report reference; if any element is already installed or blocked, the complete approval transaction rolls back. Installed and blocked elements are omitted from normal selection.

Project Managers, Administrators and Directors can correct an erroneous Installed state to On site, Issue or Rejected / Hold with a mandatory reason. The original report link remains in history, the correction is appended and project activity is logged. There is no silent overwrite. Elements with installation history cannot be destructively archived.

## Register, progress and import

`/portal/projects/[id]/elements` provides server-backed code/reference search and floor, zone, type and status filters. Counts and progress use active official register rows: Installed / Total, Remaining and percentage, grouped by type and floor. Replaced rows are excluded from the progress denominator.

CSV import has a browser preview and server-side revalidation. Required columns begin with `Element code, Element type`; the downloadable template includes floor, zone, drawing/reference, description, weight, length, width, height, supplier and planned delivery date. Row errors block final import. The final batch is transactional. XLSX import is deferred; Sprint 10.1 contains an XLSX writer, not a maintained XLSX parser. *(Sprint 11.1 update: repeated element codes are no longer treated as duplicate errors — they are kept as separate physical elements with distinct immutable IDs; see [SPRINT-11-1.md](SPRINT-11-1.md).)*

## RBAC and security

Director/Administrator have global access. Project Managers manage registers for accessible projects, import and correct installation. Foremen can view accessible registers, create individual elements and update permitted operational statuses, and select elements in Daily Reports. Employees cannot access the element register. Every action repeats project authorization server-side. The register has no public routes, media paths or public data exposure.

## Mobile workflow

The Daily Report element selector uses stacked controls and cards below 600 px: search, floor, zone and type; selected count; select-filtered and clear; then touch-friendly checkboxes. It does not require page-level horizontal scrolling.

## Future AI extraction

Future extraction must use a separate staging/candidate model: document extraction → candidate rows → validation/duplicate review → human approval → the same official `project_elements` insert workflow. AI must never write directly to the official register.

## Known limitations and recommended next scope

Daily Report lifecycle acceptance fixes preserve the documented approval rule: report approval, element status/date/report linkage, element history and audit records commit in one transaction. Submit and Approve return to the Reports register with localized confirmation, while failures remain visible without claiming success. The Reports list, report detail and project element register are revalidated after approval.

Authorized users can permanently delete Draft reports only, after the reusable confirmation identifies the report, project and date. Attendance and unfinalized element links cascade with the Draft; protected photos are retained under the existing storage policy and detached. Submitted and Approved reports remain immutable through this action.

Sprint 11 intentionally omits XLSX import, logistics loads/trucks, a full NCR process, element-specific photo linkage, quantity-only anonymous batches and formal report reopening after approval. Sprint 11.1 should add maintained XLSX parsing and richer import mapping; Sprint 12 can add delivery sequencing and human-reviewed AI extraction candidates.
