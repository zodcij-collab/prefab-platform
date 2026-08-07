# Sprint 4 — Database & Authentication

Version: 0.4.0-alpha.1

- Local SQLite database powered by Node.js `node:sqlite`.
- Secure password hashing with scrypt.
- Server-side sessions stored in database and HttpOnly cookie.
- `/portal/*` protected by authentication.
- Projects, employees, documents and reports read from database.
- Daily report form writes real records to database.
- Seed data is created only on first database creation.

Local first-login credentials (unless overridden before first run):
- Email: `admin@prefab.lv`
- Password: `ChangeMe2026!`

Production deployment will replace the local SQLite adapter with PostgreSQL while retaining the same application data layer.
