# Sprint 8 — Documents & Site Photo Management

Version: `v0.8.0`

## Delivered

- Project document upload with construction categories, revision metadata, document date, status, notes, uploader and safe file metadata.
- New revisions are stored as separate records so earlier revisions and their activity history remain available.
- Authenticated document open/download routes with safe content-disposition and no-sniff headers.
- Searchable and category-filterable document register with Sprint 1–7 legacy metadata compatibility.
- Project site-photo upload with date, area, caption, notes, uploader and responsive larger-photo viewing.
- Document and photo metadata editing and permanent deletion through the existing permission-aware Server Actions.
- Reusable destructive-action confirmation identifying the record, with explicit Cancel and Delete permanently actions.
- Project-scoped document and photo activity entries shown through the existing activity log and Project history.

## Upload security and storage

- Central `UPLOAD_MAX_FILE_MB` configuration defaults to 25 MB per document or photo.
- The Next.js Server Action body allowance includes multipart overhead; application validation still enforces the 25 MB per-file limit.
- Client and server checks return clear oversized-file errors during normal upload flows.
- Extension, MIME type and file-signature validation is applied before persistence.
- Runtime files are stored below `storage/uploads/documents` and `storage/uploads/photos`; uploaded content is ignored by Git.
- `lib/storage.ts` provides generated filenames, path confinement, reads and deletion behind a replaceable local-storage abstraction.

## Permissions

- Director, Administrator and Project Manager can upload, edit and delete project documents and photos.
- Foreman can upload operational documents and site photos, but cannot delete media, edit media metadata or upload commercial documents.
- Employee media access is read-only.
- Employees can read Daily Reports but cannot create official reports; the UI, direct page and Server Action enforce the same rule.

## Acceptance QA fixes

- Removed invalid explicit form encoding attributes from Server Action upload forms.
- Added clean 25 MB upload-limit handling for documents and photos.
- Added Europe/Riga presentation-time formatting through configurable `APP_TIMEZONE`, preserving UTC database timestamps and date-only business fields.
- Added reusable document/photo deletion confirmation.
- Added authenticated account menu and Sign out with server-session invalidation, portal cache invalidation and protected-route enforcement.
- Added Director/Administrator user creation and editing with case-insensitive unique email enforcement, secure scrypt password hashing, status/role validation, audit logging and self-deactivation protection.
- Converted SQLite user rows to explicit plain client DTOs to keep database objects and password hashes off the client boundary.
- Confirmed project history is sourced from the existing project-scoped activity log.

## Public information

- Public email: `info@prefab.lv`.
- Canonical website: `https://www.prefab.lv`.
- LinkedIn, Instagram and Facebook links are environment-configured and are omitted when no valid HTTPS URL is configured.

## Acceptance result

- Manual acceptance: 15/15 tests passed.
- Required release checks: lint, typecheck, production build and `git diff --check`.

## Deferred

- Cloud/object storage, notifications, OCR, document approvals, e-signatures, AI analysis and image editing.
- Password reset/change workflow and account deletion are not included in Sprint 8.
