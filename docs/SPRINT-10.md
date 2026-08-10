# Sprint 10 / 10.1 — Workforce, Daily Site Operations, Media & Monthly Timesheets

## Architecture

Employees and portal users are separate records. `employees` is the workforce register; a worker needs no email, password, session, or portal account. `users.employee_id` is an optional unique link used only to scope Project Manager and Foreman access to their assigned projects. Authentication credentials remain solely in `users`.

Employee records now include first/last name, trade, phone, optional email, employment status, default project, employment dates, and notes. Deactivation preserves assignments and attendance. `employee_project_assignments` keeps dated assignment history while `project_members` remains the current project-team source.

## Migration and backward compatibility

Migrations `sprint10_workforce_attendance` and `sprint10_user_employee_links` are idempotent. Existing employee names are split at the first space, legacy `Off` maps to `Unavailable`, and other legacy statuses map to `Active`. Existing project memberships are copied into open assignment-history rows. An unlinked portal user is automatically linked only when exactly one employee has the same email or full name. Existing Daily Reports are retained and marked `Submitted`; their original `people` totals remain unchanged. No attendance rows are invented for legacy reports because the historical total cannot be attributed safely to individuals.

## Daily Report 2.0

Reports contain project/date/reporter/weather, general work, materials/deliveries, equipment, problems/delays, safety observations, notes, and attendance rows. Project members load automatically; the UI defaults them to `Worked` and 8 regular hours as a convenience only. Server logic does not assume an eight-hour day and accepts quarter-hour values from 0–24 combined hours.

Workflow: `Draft → Submitted → Approved`. Foremen may create and edit their own drafts for linked projects. Project Managers may review relevant projects. Directors and Administrators have global review authority. Employees cannot create reports. Every save is transactional with attendance; submit/approve/correction activity is audited.

Sprint 10.1 adds Daily Report photos through the existing project-photo storage and protected media route. `project_photos.report_id` optionally links an existing secure project image to its source Daily Report without duplicating files or storage logic. Up to four JPG, PNG, or WebP files can be attached per request, with the existing 25 MB per-file MIME, extension, and signature checks. Stored paths never reach the client. Report detail shows the image, original filename, uploader, upload time, project-day date, area, caption, and notes. Unauthenticated and out-of-scope media requests are rejected server-side.

The report detail also provides a localized Export / Share menu. `/portal/reports/[id]/pdf` creates a genuine A4 PDF on demand with PREFAB.LV branding, full report content, attendance hours/statuses, protected report photos, generated time, and page numbering. PDFKit performs server-side document layout, embedded DejaVu Sans TrueType fonts preserve LV/RU glyphs, and `@napi-rs/canvas` converts WebP evidence to an embeddable PNG without creating public copies. The endpoint repeats session and project authorization, returns `private, no-store`, exposes no physical paths, and audits the export purpose. The PDF is the single official printable representation: Download PDF returns it as an attachment, while Print uses `/portal/reports/[id]/print` as a compatibility redirect to the same authorized generator in inline mode so the browser PDF viewer can print an identical document with its native Print control or Ctrl+P. There is no competing HTML A4 renderer. E-mail downloads the authorized PDF, opens the device mail application with localized draft text, and clearly instructs the user to attach the PDF manually because `mailto:` cannot attach files; it never claims delivery or attachment. Web Share shares the generated PDF file when supported and otherwise downloads it for manual sharing. No permanent public report link is created.

For physical site filing, every report PDF first page identifies the project, report reference/date/status, preparer, approver when approved, generation time, and a deterministic revision identifier based on the stored report update timestamp. `/portal/reports/archive` accepts an authorized project and month/year and produces one chronological A4 archive PDF with a cover/index followed by every full report and its photos. The batch route derives its records from the same report, attendance, and protected photo repositories; it rechecks session/project scope, returns no public URL, and audits only project, period, and report count. Regenerating after a correction visibly changes that report's revision while preserving historical database data.

## Attendance and monthly aggregation

`attendance_entries` relates one report, employee, project, and work date with canonical status, regular/overtime hours, and comment. Monthly totals are always calculated from these daily rows. Worked, sick leave, vacation, absent, day off, business trip/other project, and other-status day counts are aggregated separately; non-working statuses never create working hours. An explicitly selected employee with no rows is shown as missing attendance rather than appearing equivalent to a zero-hour sick-leave row. Multiple-project or over-16-hour employee/day combinations are shown as review warnings and are never silently changed.

`timesheet_periods` provides `Open`, `Reviewed`, and `Closed`. Closed periods reject report/attendance edits. Reviewed-period changes remain possible for authorized reviewers but are activity logged. Hard approval-lock exceptions can be expanded in Sprint 11.

## Timesheets and export

`/portal/timesheets` supports month/year, project, and employee filters, employee/project/overall status totals, warnings, and source drill-down. CSV and XLSX use the same authorization and filtering resolver and therefore consume exactly the same attendance rows as the portal. CSV remains UTF-8 BOM encoded and includes the Daily Report reference.

XLSX is a real Office Open XML workbook generated from the shared aggregation with `fflate` providing only the maintained ZIP container. It contains `Monthly Summary`, `Daily Details`, and `Project Summary` sheets. Unicode Latvian and Russian values are preserved. Neither export contains credentials, portal-role metadata, bank details, salary, tax, or payroll-money calculations.

## Permissions

- Director/Administrator: workforce CRUD, global reports/timesheets, approvals, CSV/XLSX export, month status.
- Project Manager: relevant project workforce visibility, report review, relevant timesheets and CSV/XLSX export.
- Foreman: assigned crews and Daily Reports/attendance for linked projects; no global timesheets.
- Employee: no workforce enumeration, official report creation, or timesheet administration.

All enforcement is server-side. Unauthenticated routes use the portal session layout, export rechecks the session, and project filters are intersected with authorized project IDs.

## Manual acceptance scenario and exact totals

Create project `Sprint 10 test`, assign four employees, and create one Submitted report:

- Foreman: Worked, 8 regular, 0 overtime → 1 worked day, 8 total.
- Precast Installer: Worked, 8 regular, 2 overtime → 1 worked day, 10 total.
- Rigger: Sick leave, 0 hours → 1 sick-leave day, 0 total.
- Welder: Vacation, 0 hours → 1 vacation day, 0 total.

Expected project/overall totals: 2 worked days, 16 regular hours, 2 overtime hours, 18 total hours, 1 sick-leave day, 1 vacation day. The employee drill-down, CSV, and XLSX must show the same four source rows and totals. Save as Draft, refresh, edit, submit, approve, attach two test images, and verify status/media persistence and activity. Repeat labels in LV/EN/RU and verify the attendance/media flow at 400px without page-level horizontal scrolling. Verify Employee cannot access creation/timesheets by direct URL and unauthenticated CSV/XLSX/media requests expose no protected data.

## Known limitations

- Month closing is global per month, not per project.
- Existing legacy report headcounts are preserved without fabricated employee attendance.
- Portal-user linking is schema/repository ready; a dedicated administrator UI for linking an account to an employee is deferred.
- Approved reports are immutable in the UI. A formal correction/reopen workflow is recommended before payroll production use.
- Report media supports images only; general document attachments and image editing remain out of scope.
- E-mail delivery depends on the user’s configured mail application; the platform does not send or track the message. Web Share targets depend on browser/operating-system support.
- Revision identifiers describe the current generated snapshot; immutable historical PDF copies and cryptographic signatures remain an external records-retention responsibility.

## Recommended Sprint 11

Add explicit user–employee linking UI, approval correction/reopen with reason and retained revision history, per-project month locks, accounting sign-off, absence approval documents, media deletion from the report workspace, optional managed e-mail delivery/signing, and full integration tests against an isolated migrated SQLite database.
