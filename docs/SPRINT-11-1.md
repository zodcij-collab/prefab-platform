# Sprint 11.1 — Practical Operations Upgrade

Sprint 11.1 extends the accepted Sprint 11 element register and Daily Report workflow without changing their operational source-of-truth rules.

## Acceptance correction: physical identity and persistent review

`project_elements.id` is the immutable identity of a physical element. `element_code` is the supplier/drawing mark and is intentionally not unique within a project. Multiple elements may retain the same visible mark while keeping separate delivery, issue, installation, Daily Report, and history state. Source marks are never suffixed or rewritten to manufacture uniqueness.

Synchronization compares occurrences inside each normalized mark group. Exact normalized design signatures are paired deterministically with existing internal IDs. A single remaining source/official pair may be updated; multiple unmatched occurrences are human-review conflicts. This prevents Installed status, report linkage, dates, or history from being reassigned between physical occurrences. Missing official elements remain active by default and are never automatically deleted.

Repeated marks are a review group, not a validation error. Reviewers can keep all occurrences as separate physical elements or exclude a confirmed erroneous source row. The structured workbook, worksheet, header, column mappings, type mappings, exclusions, repeated-mark decisions, revision, notes, and canonical Preview are persisted in the import session. Mapping and Preview sessions can be resumed and revalidated without re-uploading or rebuilding the form.

## Version-aware register synchronization

XLSX is a synchronization source, not a replacement database. The flow is workbook upload → worksheet/header mapping → canonical validation → comparison → human review → transactional apply. ExcelJS parses `.xlsx` server-side; macros are not executed, formulas use cached results only, external links are never followed, uploads use the central 25 MB limit, and malformed workbooks fail cleanly. CSV import remains supported with immutable physical-element identity.

Each Preview is persisted in `element_register_imports` with project, sanitized filename, optional source revision, SHA-256 source hash, structured source workbook, worksheet/header, mappings, review decisions, canonical payload, summary, user, timestamp, notes and lifecycle status. Repeated applied hashes are warned and require explicit confirmation. No physical disk path is retained.

Identity is the immutable `project_elements.id`; codes are case-insensitive visible marks and may repeat. A different code is never silently treated as a rename: matching design traits are shown as a potential rename conflict and the reviewer may ignore it or create an independent new element. Automatic renaming is intentionally deferred.

### Header and column mapping

Workbook inspection scans the first 50 meaningful rows and proposes the strongest header row based on exact normalized aliases rather than assuming physical row 1. The reviewer can override the header row or worksheet and refresh the detected columns. Every canonical field uses an explicit selector containing Automatic, Do not import and the real worksheet headers, with up to three sample values. Element code and type remain mandatory and are blocked with a localized structured validation message when unresolved.

Header matching normalizes case, whitespace, punctuation, underscores, accents and common `No.`/number notation. Only documented aliases are accepted; low-confidence fuzzy matching is intentionally avoided. Common LV/EN/RU supplier terms for element types are converted to the existing canonical types, while unknown values remain validation issues. Blank rows and one-cell decorative/footer rows are ignored. True issues are grouped by category with expandable row-level details.

Repeated unknown source types are grouped by normalized source value and can be mapped once to an existing canonical type for the current import session. Repeated marks are grouped with all source row numbers and compared type, location, reference, dimensions and weight. The reviewer keeps all as separate occurrences or excludes confirmed erroneous rows; codes are never merged, suffixed or fabricated.

Diff categories are New, Changed, Unchanged, Missing, Conflicts and Installed affected. Changed rows show field-level old/new values. Missing rows remain active by default; an authorized reviewer may mark a not-installed row superseded. Installed rows can never be deactivated automatically.

## Design data and operational protection

Confirmed synchronization may update type, floor, zone, drawing/reference, description, weight, dimensions, supplier and planned delivery date. It never writes operational status, actual delivery date, installation date, installed report linkage, issue/hold data or element status history. New rows start Planned. Apply uses one immediate transaction and immutable internal IDs remain authoritative.

`project_elements` records retain created/last import IDs, last source revision and source presence. These fields complement rather than replace append-only `element_status_history`. Adding new elements changes the progress denominator naturally; Installed counts are not rewritten.

## Bulk operations

The register supports filtered checkbox/card selection and transactional Expected, Delivered and On site actions. Installed, Issue, Hold/Rejected and Replaced rows require individual review and cannot be changed through bulk actions. Every ID is checked against the authorized project; each successful transition appends history and the batch creates an activity record. Installed remains exclusive to Daily Report approval.

## Project weather and Daily Reports

Projects may store WGS84 latitude/longitude. Authorized Daily Report reporters can request available site snapshots at approximately 07:00, 10:00, 14:00 and 17:00 in `Europe/Riga`. The replaceable `WeatherProvider` abstraction currently uses Open-Meteo server-side and stores structured temperature, condition code/text, precipitation, wind, gust, provider and retrieval timestamp in `daily_report_weather`. Partial provider responses retain their available timepoints. The application server must be allowed outbound HTTPS access to `api.open-meteo.com` and `archive-api.open-meteo.com`; no API key is required.

Weather is optional. Missing coordinates or provider/network failure shows a localized manual fallback and never blocks a report. Captured rows are saved with the Draft and are not refreshed through Submitted/Approved editing. Report detail, individual PDF, print PDF and monthly archive use the persisted snapshot rather than refetching it, preserving historical output.

## RBAC and security

Director/Administrator and authorized Project Managers may synchronize XLSX. Foremen may perform allowed bulk operational transitions and load weather for accessible projects, but cannot administer design synchronization. Employees gain no new rights. Every server action and weather endpoint repeats authentication and project-scope checks.

Filename separators are removed, workbooks are parsed in memory within the shared limit, formulas/macros are not executed, remote workbook resources are not fetched, operational columns are absent from the apply statement, and the public site exposes neither register data nor weather/report history.

## Mobile behavior

At narrow widths weather becomes a two-column snapshot grid, bulk controls wrap into touch-friendly rows, element cards remain stacked, and synchronization diffs use review cards rather than page-wide tables. Complex mapping remains usable without page-level horizontal scrolling.

## Future boundary and limitations

Automatic rename decisions, XLSX template profiles, retained protected source workbooks, design-revision approval chains and sophisticated removed-design lifecycle are deferred. Weather depends on provider availability at capture time and project coordinates are manually configured.

AI extraction is explicitly excluded. XLSX synchronization and future AI use the same philosophy:

AI/document extraction → staging candidates → comparison and duplicate validation → human review → official `project_elements` register.

AI must never write directly into the official register.
