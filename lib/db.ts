import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { hashPassword } from "./security";

const dbPath = join(process.cwd(), "data", "prefab.db");
mkdirSync(dirname(dbPath), { recursive: true });

const globalForDb = globalThis as unknown as { prefabDb?: DatabaseSync };
export const db = globalForDb.prefabDb ?? new DatabaseSync(dbPath);
if (process.env.NODE_ENV !== "production") globalForDb.prefabDb = db;

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Director',
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  client TEXT NOT NULL,
  status TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  people_today INTEGER NOT NULL DEFAULT 0,
  next_delivery TEXT NOT NULL DEFAULT '—',
  manager TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  project TEXT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT NOT NULL,
  certificates TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  project TEXT NOT NULL,
  revision TEXT NOT NULL,
  updated TEXT NOT NULL,
  status TEXT NOT NULL
);


CREATE TABLE IF NOT EXISTS project_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  event_date TEXT NOT NULL,
  event_time TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT 'System',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  report_date TEXT NOT NULL,
  people INTEGER NOT NULL DEFAULT 0,
  work TEXT NOT NULL,
  deliveries INTEGER NOT NULL DEFAULT 0,
  issues INTEGER NOT NULL DEFAULT 0,
  weather TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id)
);
`);

function count(table: string) {
  return Number((db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c);
}

if (count("users") === 0) {
  const email = process.env.PREFAB_ADMIN_EMAIL ?? "admin@prefab.lv";
  const password = process.env.PREFAB_ADMIN_PASSWORD ?? "ChangeMe2026!";
  db.prepare("INSERT INTO users (email, name, role, password_hash) VALUES (?, ?, ?, ?)")
    .run(email.toLowerCase(), "Edvards", "Director", hashPassword(password));
}

if (count("projects") === 0) {
  const rows = [
    ["riga-north", "Riga North Residential", "Rīga, LV", "Nordic Development", "Active", 64, 12, "Today · 10:30", "Edvards K."],
    ["marupe-logistics", "Mārupe Logistics Hub", "Mārupe, LV", "Baltic Logistics", "Active", 38, 9, "Tomorrow · 08:00", "Jānis B."],
    ["tallinn-office", "Tallinn Office Campus", "Tallinn, EE", "Northline Property", "Planning", 8, 0, "18 Aug · TBD", "Edvards K."],
    ["kaunas-retail", "Kaunas Retail Extension", "Kaunas, LT", "Retail Baltic", "Completed", 100, 0, "—", "Mārtiņš S."],
  ];
  const stmt = db.prepare("INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  for (const row of rows) stmt.run(...row);
}

if (count("employees") === 0) {
  const rows = [
    ["emp-001", "Jānis Bērziņš", "Foreman", "Riga North Residential", "+371 2X XXX XXX", "On site", JSON.stringify(["Rigger", "First aid"])],
    ["emp-002", "Mārtiņš Ozols", "Precast installer", "Riga North Residential", "+371 2X XXX XXX", "On site", JSON.stringify(["Work at height"])],
    ["emp-003", "Artūrs Liepa", "Welder", "Mārupe Logistics Hub", "+371 2X XXX XXX", "On site", JSON.stringify(["EN ISO 9606-1"])],
    ["emp-004", "Kārlis Kalniņš", "Rigger", "Mārupe Logistics Hub", "+371 2X XXX XXX", "On site", JSON.stringify(["Rigger", "Signalman"])],
    ["emp-005", "Laura Priede", "Project coordinator", "Tallinn Office Campus", "+371 2X XXX XXX", "Office", "[]"],
    ["emp-006", "Andris Krūmiņš", "Concrete worker", "Riga North Residential", "+371 2X XXX XXX", "Off", JSON.stringify(["Work at height"])],
  ];
  const stmt = db.prepare("INSERT INTO employees VALUES (?, ?, ?, ?, ?, ?, ?)");
  for (const row of rows) stmt.run(...row);
}

if (count("documents") === 0) {
  const rows = [
    ["doc-001", "PF-DVP-001 Work Execution Plan", "DVP", "Riga North Residential", "Rev.0", "07 Aug 2026", "Current"],
    ["doc-002", "Precast Installation Method Statement", "DOP", "Riga North Residential", "Rev.2", "06 Aug 2026", "Current"],
    ["doc-003", "Level 03 Erection Drawing", "Drawing", "Mārupe Logistics Hub", "C", "05 Aug 2026", "Review"],
    ["doc-004", "Risk Assessment — Lifting Operations", "HSE", "All projects", "Rev.1", "01 Aug 2026", "Current"],
    ["doc-005", "Old Delivery Schedule", "Schedule", "Kaunas Retail Extension", "Rev.4", "12 Jun 2026", "Archived"],
  ];
  const stmt = db.prepare("INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?)");
  for (const row of rows) stmt.run(...row);
}

if (count("reports") === 0) {
  const rows = [
    ["riga-north", "Riga North Residential", "2026-08-07", 12, "Wall panels axes A–C, joint preparation", 2, 1, "Dry", "", "Jānis B."],
    ["marupe-logistics", "Mārupe Logistics Hub", "2026-08-07", 9, "Hollow-core slabs, temporary bracing", 1, 0, "Dry", "", "Mārtiņš S."],
    ["riga-north", "Riga North Residential", "2026-08-06", 11, "External wall panels, welding", 2, 0, "Dry", "", "Jānis B."],
  ];
  const stmt = db.prepare("INSERT INTO reports (project_id, project_name, report_date, people, work, deliveries, issues, weather, notes, author) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  for (const row of rows) stmt.run(...row);
}


if (count("project_events") === 0) {
  const rows = [
    ["riga-north", "2026-08-07", "08:05", "Delivery", "Wall panels arrived", "Truck 01 received and unloading started", "Jānis B."],
    ["riga-north", "2026-08-07", "10:20", "Installation", "Axis B completed", "Wall panel installation completed and checked", "Jānis B."],
    ["riga-north", "2026-08-07", "11:10", "Issue", "Temporary brace adjustment", "Brace repositioned before next lift", "Jānis B."],
    ["marupe-logistics", "2026-08-07", "08:00", "Installation", "Hollow-core installation started", "Level 02 east wing", "Mārtiņš S."],
    ["marupe-logistics", "2026-08-07", "12:15", "Quality", "Geometry check", "Installed elements checked against erection drawings", "Mārtiņš S."],
    ["tallinn-office", "2026-08-06", "15:30", "Planning", "Pre-start coordination", "Initial lifting sequence reviewed", "Edvards K."],
  ];
  const stmt = db.prepare("INSERT INTO project_events (project_id, event_date, event_time, event_type, title, details, author) VALUES (?, ?, ?, ?, ?, ?, ?)");
  for (const row of rows) stmt.run(...row);
}

if (count("activity_log") === 0) {
  db.prepare("INSERT INTO activity_log (actor, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)")
    .run("System", "Platform initialized", "system", "prefab-platform", "Sprint 5 activity logging enabled");
}
