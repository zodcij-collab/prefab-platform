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
PRAGMA busy_timeout = 5000;
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'Director',password_hash TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,token_hash TEXT NOT NULL UNIQUE,expires_at TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY,name TEXT NOT NULL,location TEXT NOT NULL,client TEXT NOT NULL,status TEXT NOT NULL,progress INTEGER NOT NULL DEFAULT 0,people_today INTEGER NOT NULL DEFAULT 0,next_delivery TEXT NOT NULL DEFAULT '—',manager TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS employees (id TEXT PRIMARY KEY,name TEXT NOT NULL,role TEXT NOT NULL,project TEXT NOT NULL,phone TEXT NOT NULL,status TEXT NOT NULL,certificates TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,project TEXT NOT NULL,revision TEXT NOT NULL,updated TEXT NOT NULL,status TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS project_events (id INTEGER PRIMARY KEY AUTOINCREMENT,project_id TEXT NOT NULL,event_date TEXT NOT NULL,event_time TEXT NOT NULL DEFAULT '',event_type TEXT NOT NULL,title TEXT NOT NULL,details TEXT NOT NULL DEFAULT '',author TEXT NOT NULL DEFAULT 'System',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(project_id) REFERENCES projects(id));
CREATE TABLE IF NOT EXISTS activity_log (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,actor TEXT NOT NULL,action TEXT NOT NULL,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL DEFAULT '',details TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL);
CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT,project_id TEXT NOT NULL,project_name TEXT NOT NULL,report_date TEXT NOT NULL,people INTEGER NOT NULL DEFAULT 0,work TEXT NOT NULL,deliveries INTEGER NOT NULL DEFAULT 0,issues INTEGER NOT NULL DEFAULT 0,weather TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',author TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(project_id) REFERENCES projects(id));
CREATE TABLE IF NOT EXISTS deliveries (id INTEGER PRIMARY KEY AUTOINCREMENT,project_id TEXT NOT NULL,delivery_date TEXT NOT NULL,delivery_time TEXT NOT NULL DEFAULT '',supplier TEXT NOT NULL,load_ref TEXT NOT NULL DEFAULT '',description TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Planned',notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(project_id) REFERENCES projects(id));
CREATE TABLE IF NOT EXISTS project_issues (id INTEGER PRIMARY KEY AUTOINCREMENT,project_id TEXT NOT NULL,created_date TEXT NOT NULL,category TEXT NOT NULL,title TEXT NOT NULL,priority TEXT NOT NULL DEFAULT 'Normal',status TEXT NOT NULL DEFAULT 'Open',owner TEXT NOT NULL DEFAULT '',details TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(project_id) REFERENCES projects(id));
CREATE TABLE IF NOT EXISTS project_photos (id INTEGER PRIMARY KEY AUTOINCREMENT,project_id TEXT NOT NULL,photo_date TEXT NOT NULL,area TEXT NOT NULL DEFAULT '',caption TEXT NOT NULL,file_ref TEXT NOT NULL DEFAULT '',author TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(project_id) REFERENCES projects(id));
CREATE TABLE IF NOT EXISTS project_members (project_id TEXT NOT NULL,employee_id TEXT NOT NULL,project_role TEXT NOT NULL DEFAULT 'Team member',assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(project_id, employee_id),FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS project_documents (id INTEGER PRIMARY KEY AUTOINCREMENT,project_id TEXT NOT NULL,title TEXT NOT NULL,category TEXT NOT NULL,revision TEXT NOT NULL DEFAULT '',document_date TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'Current',description TEXT NOT NULL DEFAULT '',original_filename TEXT NOT NULL,stored_path TEXT NOT NULL UNIQUE,file_size INTEGER NOT NULL,mime_type TEXT NOT NULL,uploaded_by_id INTEGER,uploaded_by TEXT NOT NULL,uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,FOREIGN KEY(uploaded_by_id) REFERENCES users(id) ON DELETE SET NULL);
CREATE TABLE IF NOT EXISTS employee_project_assignments (id INTEGER PRIMARY KEY AUTOINCREMENT,employee_id TEXT NOT NULL,project_id TEXT NOT NULL,project_role TEXT NOT NULL DEFAULT 'Team member',start_date TEXT NOT NULL,end_date TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE RESTRICT,FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE RESTRICT);
CREATE TABLE IF NOT EXISTS attendance_entries (id INTEGER PRIMARY KEY AUTOINCREMENT,report_id INTEGER NOT NULL,employee_id TEXT NOT NULL,project_id TEXT NOT NULL,work_date TEXT NOT NULL,attendance_status TEXT NOT NULL,regular_hours REAL NOT NULL DEFAULT 0 CHECK(regular_hours >= 0),overtime_hours REAL NOT NULL DEFAULT 0 CHECK(overtime_hours >= 0),comment TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(report_id,employee_id),FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE,FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE RESTRICT,FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE RESTRICT);
CREATE TABLE IF NOT EXISTS timesheet_periods (period TEXT PRIMARY KEY,status TEXT NOT NULL DEFAULT 'Open',reviewed_by_id INTEGER,reviewed_at TEXT NOT NULL DEFAULT '',closed_by_id INTEGER,closed_at TEXT NOT NULL DEFAULT '',FOREIGN KEY(reviewed_by_id) REFERENCES users(id) ON DELETE SET NULL,FOREIGN KEY(closed_by_id) REFERENCES users(id) ON DELETE SET NULL);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_nocase ON users(email COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS attendance_period_idx ON attendance_entries(work_date,project_id,employee_id);
CREATE INDEX IF NOT EXISTS employee_assignments_idx ON employee_project_assignments(employee_id,project_id,start_date);
`);

const projectColumns = new Set((db.prepare("PRAGMA table_info(projects)").all() as { name: string }[]).map((column) => column.name));
if (!projectColumns.has("start_date")) db.exec("ALTER TABLE projects ADD COLUMN start_date TEXT NOT NULL DEFAULT ''");
if (!projectColumns.has("target_date")) db.exec("ALTER TABLE projects ADD COLUMN target_date TEXT NOT NULL DEFAULT ''");
if (!projectColumns.has("description")) db.exec("ALTER TABLE projects ADD COLUMN description TEXT NOT NULL DEFAULT ''");
if (!projectColumns.has("manager_employee_id")) db.exec("ALTER TABLE projects ADD COLUMN manager_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL");
const issueColumns = new Set((db.prepare("PRAGMA table_info(project_issues)").all() as { name: string }[]).map((column) => column.name));
if (!issueColumns.has("owner_employee_id")) db.exec("ALTER TABLE project_issues ADD COLUMN owner_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL");
const photoColumns = new Set((db.prepare("PRAGMA table_info(project_photos)").all() as { name: string }[]).map((column) => column.name));
if (!photoColumns.has("notes")) db.exec("ALTER TABLE project_photos ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
if (!photoColumns.has("original_filename")) db.exec("ALTER TABLE project_photos ADD COLUMN original_filename TEXT NOT NULL DEFAULT ''");
if (!photoColumns.has("stored_path")) db.exec("ALTER TABLE project_photos ADD COLUMN stored_path TEXT NOT NULL DEFAULT ''");
if (!photoColumns.has("file_size")) db.exec("ALTER TABLE project_photos ADD COLUMN file_size INTEGER NOT NULL DEFAULT 0");
if (!photoColumns.has("mime_type")) db.exec("ALTER TABLE project_photos ADD COLUMN mime_type TEXT NOT NULL DEFAULT ''");
if (!photoColumns.has("uploaded_by_id")) db.exec("ALTER TABLE project_photos ADD COLUMN uploaded_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL");
if (!photoColumns.has("uploaded_at")) db.exec("ALTER TABLE project_photos ADD COLUMN uploaded_at TEXT NOT NULL DEFAULT ''");
if (!photoColumns.has("report_id")) db.exec("ALTER TABLE project_photos ADD COLUMN report_id INTEGER REFERENCES reports(id) ON DELETE SET NULL");
const employeeColumns = new Set((db.prepare("PRAGMA table_info(employees)").all() as { name: string }[]).map((column) => column.name));
if (!employeeColumns.has("first_name")) db.exec("ALTER TABLE employees ADD COLUMN first_name TEXT NOT NULL DEFAULT ''");
if (!employeeColumns.has("last_name")) db.exec("ALTER TABLE employees ADD COLUMN last_name TEXT NOT NULL DEFAULT ''");
if (!employeeColumns.has("email")) db.exec("ALTER TABLE employees ADD COLUMN email TEXT NOT NULL DEFAULT ''");
if (!employeeColumns.has("employment_status")) db.exec("ALTER TABLE employees ADD COLUMN employment_status TEXT NOT NULL DEFAULT 'Active'");
if (!employeeColumns.has("default_project_id")) db.exec("ALTER TABLE employees ADD COLUMN default_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL");
if (!employeeColumns.has("employment_start_date")) db.exec("ALTER TABLE employees ADD COLUMN employment_start_date TEXT NOT NULL DEFAULT ''");
if (!employeeColumns.has("employment_end_date")) db.exec("ALTER TABLE employees ADD COLUMN employment_end_date TEXT NOT NULL DEFAULT ''");
if (!employeeColumns.has("notes")) db.exec("ALTER TABLE employees ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
const userColumns = new Set((db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((column) => column.name));
if (!userColumns.has("employee_id")) db.exec("ALTER TABLE users ADD COLUMN employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_employee_unique ON users(employee_id) WHERE employee_id IS NOT NULL");
const reportColumns = new Set((db.prepare("PRAGMA table_info(reports)").all() as { name: string }[]).map((column) => column.name));
if (!reportColumns.has("reporter_user_id")) db.exec("ALTER TABLE reports ADD COLUMN reporter_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL");
if (!reportColumns.has("reporter_employee_id")) db.exec("ALTER TABLE reports ADD COLUMN reporter_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL");
if (!reportColumns.has("status")) db.exec("ALTER TABLE reports ADD COLUMN status TEXT NOT NULL DEFAULT 'Submitted'");
if (!reportColumns.has("materials")) db.exec("ALTER TABLE reports ADD COLUMN materials TEXT NOT NULL DEFAULT ''");
if (!reportColumns.has("equipment")) db.exec("ALTER TABLE reports ADD COLUMN equipment TEXT NOT NULL DEFAULT ''");
if (!reportColumns.has("problems")) db.exec("ALTER TABLE reports ADD COLUMN problems TEXT NOT NULL DEFAULT ''");
if (!reportColumns.has("safety")) db.exec("ALTER TABLE reports ADD COLUMN safety TEXT NOT NULL DEFAULT ''");
if (!reportColumns.has("additional_notes")) db.exec("ALTER TABLE reports ADD COLUMN additional_notes TEXT NOT NULL DEFAULT ''");
if (!reportColumns.has("updated_at")) db.exec("ALTER TABLE reports ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
if (!reportColumns.has("submitted_at")) db.exec("ALTER TABLE reports ADD COLUMN submitted_at TEXT NOT NULL DEFAULT ''");
if (!reportColumns.has("approved_by_id")) db.exec("ALTER TABLE reports ADD COLUMN approved_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL");
if (!reportColumns.has("approved_at")) db.exec("ALTER TABLE reports ADD COLUMN approved_at TEXT NOT NULL DEFAULT ''");

function count(table: string) { return Number((db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c); }

if (count("users") === 0) {
  const email = process.env.PREFAB_ADMIN_EMAIL ?? "admin@prefab.lv";
  const password = process.env.PREFAB_ADMIN_PASSWORD ?? "ChangeMe2026!";
  db.prepare("INSERT INTO users (email, name, role, password_hash) VALUES (?, ?, ?, ?)").run(email.toLowerCase(), "Edvards", "Director", hashPassword(password));
}
if (count("projects") === 0) {
  const rows = [["riga-north","Riga North Residential","Rīga, LV","Nordic Development","Active",64,12,"Today · 10:30","Edvards K."],["marupe-logistics","Mārupe Logistics Hub","Mārupe, LV","Baltic Logistics","Active",38,9,"Tomorrow · 08:00","Jānis B."],["tallinn-office","Tallinn Office Campus","Tallinn, EE","Northline Property","Planning",8,0,"18 Aug · TBD","Edvards K."],["kaunas-retail","Kaunas Retail Extension","Kaunas, LT","Retail Baltic","Completed",100,0,"—","Mārtiņš S."]];
  const stmt = db.prepare("INSERT INTO projects (id,name,location,client,status,progress,people_today,next_delivery,manager) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"); for (const row of rows) stmt.run(...row);
}
if (count("employees") === 0) {
  const rows = [["emp-001","Jānis Bērziņš","Foreman","Riga North Residential","+371 2X XXX XXX","On site",JSON.stringify(["Rigger","First aid"])],["emp-002","Mārtiņš Ozols","Precast installer","Riga North Residential","+371 2X XXX XXX","On site",JSON.stringify(["Work at height"])],["emp-003","Artūrs Liepa","Welder","Mārupe Logistics Hub","+371 2X XXX XXX","On site",JSON.stringify(["EN ISO 9606-1"])],["emp-004","Kārlis Kalniņš","Rigger","Mārupe Logistics Hub","+371 2X XXX XXX","On site",JSON.stringify(["Rigger","Signalman"])],["emp-005","Laura Priede","Project coordinator","Tallinn Office Campus","+371 2X XXX XXX","Office","[]"],["emp-006","Andris Krūmiņš","Concrete worker","Riga North Residential","+371 2X XXX XXX","Off",JSON.stringify(["Work at height"])]];
  const stmt = db.prepare("INSERT INTO employees VALUES (?, ?, ?, ?, ?, ?, ?)"); for (const row of rows) stmt.run(...row);
}
if (count("documents") === 0) {
  const rows = [["doc-001","PF-DVP-001 Work Execution Plan","DVP","Riga North Residential","Rev.0","07 Aug 2026","Current"],["doc-002","Precast Installation Method Statement","DOP","Riga North Residential","Rev.2","06 Aug 2026","Current"],["doc-003","Level 03 Erection Drawing","Drawing","Mārupe Logistics Hub","C","05 Aug 2026","Review"],["doc-004","Risk Assessment — Lifting Operations","HSE","All projects","Rev.1","01 Aug 2026","Current"],["doc-005","Old Delivery Schedule","Schedule","Kaunas Retail Extension","Rev.4","12 Jun 2026","Archived"]];
  const stmt = db.prepare("INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?)"); for (const row of rows) stmt.run(...row);
}
if (count("reports") === 0) {
  const rows = [["riga-north","Riga North Residential","2026-08-07",12,"Wall panels axes A–C, joint preparation",2,1,"Dry","","Jānis B."],["marupe-logistics","Mārupe Logistics Hub","2026-08-07",9,"Hollow-core slabs, temporary bracing",1,0,"Dry","","Mārtiņš S."],["riga-north","Riga North Residential","2026-08-06",11,"External wall panels, welding",2,0,"Dry","","Jānis B."]];
  const stmt = db.prepare("INSERT INTO reports (project_id, project_name, report_date, people, work, deliveries, issues, weather, notes, author) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"); for (const row of rows) stmt.run(...row);
}
if (count("project_events") === 0) {
  const rows = [["riga-north","2026-08-07","08:05","Delivery","Wall panels arrived","Truck 01 received and unloading started","Jānis B."],["riga-north","2026-08-07","10:20","Installation","Axis B completed","Wall panel installation completed and checked","Jānis B."],["riga-north","2026-08-07","11:10","Issue","Temporary brace adjustment","Brace repositioned before next lift","Jānis B."],["marupe-logistics","2026-08-07","08:00","Installation","Hollow-core installation started","Level 02 east wing","Mārtiņš S."],["marupe-logistics","2026-08-07","12:15","Quality","Geometry check","Installed elements checked against erection drawings","Mārtiņš S."],["tallinn-office","2026-08-06","15:30","Planning","Pre-start coordination","Initial lifting sequence reviewed","Edvards K."]];
  const stmt = db.prepare("INSERT INTO project_events (project_id, event_date, event_time, event_type, title, details, author) VALUES (?, ?, ?, ?, ?, ?, ?)"); for (const row of rows) stmt.run(...row);
}
if (count("activity_log") === 0) db.prepare("INSERT INTO activity_log (actor, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)").run("System","Platform initialized","system","prefab-platform","Sprint 5 activity logging enabled");

if (count("deliveries") === 0) {
  const rows = [["riga-north","2026-08-07","08:00","Precast Factory A","LOAD-017","External wall panels A01–A08","Received","Unloaded in erection order"],["riga-north","2026-08-07","10:30","Precast Factory A","LOAD-018","Internal walls B01–B06","Planned","Direct erection from truck"],["marupe-logistics","2026-08-08","08:00","HC Supplier","HC-044","Hollow-core slabs Level 02","Planned","Crane slot confirmed"]];
  const stmt = db.prepare("INSERT INTO deliveries (project_id, delivery_date, delivery_time, supplier, load_ref, description, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"); for (const row of rows) stmt.run(...row);
}
if (count("project_issues") === 0) {
  const rows = [["riga-north","2026-08-07","Installation","Temporary brace adjustment","High","In progress","Jānis B.","Brace position conflicts with access route"],["riga-north","2026-08-06","Quality","Panel edge repair","Normal","Open","Mārtiņš O.","Small transport damage to be repaired before handover"],["marupe-logistics","2026-08-07","Drawing","Embed location query","Normal","Open","Laura P.","Clarification requested from designer"]];
  const stmt = db.prepare("INSERT INTO project_issues (project_id, created_date, category, title, priority, status, owner, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"); for (const row of rows) stmt.run(...row);
}
if (count("project_photos") === 0) {
  const rows = [["riga-north","2026-08-07","Axis B","Wall panels installed and temporarily braced","photos/riga-north/2026-08-07-axis-b.jpg","Jānis B."],["riga-north","2026-08-07","Delivery zone","LOAD-017 received","photos/riga-north/2026-08-07-load-017.jpg","Jānis B."],["marupe-logistics","2026-08-07","Level 02","Hollow-core erection started","photos/marupe/2026-08-07-level-02.jpg","Mārtiņš S."]];
  const stmt = db.prepare("INSERT INTO project_photos (project_id, photo_date, area, caption, file_ref, author) VALUES (?, ?, ?, ?, ?, ?)"); for (const row of rows) stmt.run(...row);
}

const membershipMigration = db.prepare("SELECT 1 FROM schema_migrations WHERE name = ?").get("sprint7_project_members");
if (!membershipMigration) {
  db.exec(`INSERT OR IGNORE INTO project_members (project_id, employee_id, project_role)
    SELECT p.id, e.id, CASE WHEN e.role = 'Foreman' THEN 'Site lead' ELSE e.role END
    FROM employees e JOIN projects p ON p.name = e.project`);
  db.prepare("INSERT INTO schema_migrations (name) VALUES (?)").run("sprint7_project_members");
}

const sprint10Migration = db.prepare("SELECT 1 FROM schema_migrations WHERE name = ?").get("sprint10_workforce_attendance");
if (!sprint10Migration) {
  db.exec(`
    UPDATE employees
    SET first_name = CASE WHEN instr(trim(name),' ') > 0 THEN substr(trim(name),1,instr(trim(name),' ')-1) ELSE trim(name) END,
        last_name = CASE WHEN instr(trim(name),' ') > 0 THEN substr(trim(name),instr(trim(name),' ')+1) ELSE '' END,
        employment_status = CASE WHEN status = 'Off' THEN 'Unavailable' ELSE 'Active' END
    WHERE first_name = '' AND last_name = '';
    UPDATE employees SET default_project_id = (SELECT id FROM projects WHERE projects.name = employees.project COLLATE NOCASE LIMIT 1) WHERE default_project_id IS NULL;
    INSERT INTO employee_project_assignments(employee_id,project_id,project_role,start_date)
      SELECT m.employee_id,m.project_id,m.project_role,substr(m.assigned_at,1,10)
      FROM project_members m
      WHERE NOT EXISTS (SELECT 1 FROM employee_project_assignments a WHERE a.employee_id=m.employee_id AND a.project_id=m.project_id AND a.end_date='');
    UPDATE reports SET submitted_at = COALESCE(NULLIF(submitted_at,''),created_at), updated_at = COALESCE(NULLIF(updated_at,''),created_at), status='Submitted';
  `);
  db.prepare("INSERT INTO schema_migrations (name) VALUES (?)").run("sprint10_workforce_attendance");
}

const sprint10UserLinks = db.prepare("SELECT 1 FROM schema_migrations WHERE name = ?").get("sprint10_user_employee_links");
if (!sprint10UserLinks) {
  db.exec(`
    UPDATE users
    SET employee_id = (
      SELECT e.id FROM employees e
      WHERE (e.email <> '' AND e.email = users.email COLLATE NOCASE)
         OR e.name = users.name COLLATE NOCASE
      ORDER BY CASE WHEN e.email <> '' AND e.email = users.email COLLATE NOCASE THEN 0 ELSE 1 END
      LIMIT 1
    )
    WHERE employee_id IS NULL
      AND (SELECT COUNT(*) FROM employees e
        WHERE (e.email <> '' AND e.email = users.email COLLATE NOCASE)
           OR e.name = users.name COLLATE NOCASE) = 1;
  `);
  db.prepare("INSERT INTO schema_migrations (name) VALUES (?)").run("sprint10_user_employee_links");
}

const sprint101ReportMedia = db.prepare("SELECT 1 FROM schema_migrations WHERE name = ?").get("sprint10_1_report_media");
if (!sprint101ReportMedia) {
  db.exec("CREATE INDEX IF NOT EXISTS project_photos_report_idx ON project_photos(report_id, uploaded_at)");
  db.prepare("INSERT INTO schema_migrations (name) VALUES (?)").run("sprint10_1_report_media");
}

const sprint11Elements = db.prepare("SELECT 1 FROM schema_migrations WHERE name = ?").get("sprint11_project_elements");
if (!sprint11Elements) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_elements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      code TEXT NOT NULL COLLATE NOCASE,
      element_type TEXT NOT NULL,
      floor TEXT NOT NULL DEFAULT '',
      zone TEXT NOT NULL DEFAULT '',
      drawing_ref TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      weight REAL,
      length REAL,
      width REAL,
      height REAL,
      supplier TEXT NOT NULL DEFAULT '',
      planned_delivery_date TEXT NOT NULL DEFAULT '',
      actual_delivery_date TEXT NOT NULL DEFAULT '',
      installation_date TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Planned',
      issue_note TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      installed_report_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE RESTRICT,
      FOREIGN KEY(installed_report_id) REFERENCES reports(id) ON DELETE RESTRICT,
      UNIQUE(project_id, code)
    );
    CREATE TABLE IF NOT EXISTS daily_report_elements (
      report_id INTEGER NOT NULL,
      element_id INTEGER NOT NULL,
      selected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finalized_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY(report_id, element_id),
      FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE,
      FOREIGN KEY(element_id) REFERENCES project_elements(id) ON DELETE RESTRICT
    );
    CREATE TABLE IF NOT EXISTS element_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      element_id INTEGER NOT NULL,
      from_status TEXT NOT NULL DEFAULT '',
      to_status TEXT NOT NULL,
      event_date TEXT NOT NULL DEFAULT '',
      report_id INTEGER,
      actor_user_id INTEGER,
      actor TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(element_id) REFERENCES project_elements(id) ON DELETE RESTRICT,
      FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE SET NULL,
      FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS project_elements_filter_idx ON project_elements(project_id,active,floor,zone,element_type,status,code);
    CREATE INDEX IF NOT EXISTS report_elements_report_idx ON daily_report_elements(report_id,element_id);
    CREATE INDEX IF NOT EXISTS element_history_element_idx ON element_status_history(element_id,created_at);
  `);
  db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES (?)").run("sprint11_project_elements");
}
const sprint11CorrectionGuard = db.prepare("SELECT 1 FROM schema_migrations WHERE name = ?").get("sprint11_element_correction_guard");
if (!sprint11CorrectionGuard) {
  db.exec(`CREATE TRIGGER IF NOT EXISTS project_elements_installed_correction_guard
    BEFORE UPDATE OF status ON project_elements
    WHEN OLD.status='Installed' AND NEW.status<>'Installed' AND NEW.installed_report_id IS NOT NULL
    BEGIN SELECT RAISE(ABORT,'Installed elements require the correction workflow'); END;`);
  db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES (?)").run("sprint11_element_correction_guard");
}

const sprint111 = db.prepare("SELECT 1 FROM schema_migrations WHERE name = ?").get("sprint11_1_operations_upgrade");
if (!sprint111) {
  const projectGeoColumns = new Set((db.prepare("PRAGMA table_info(projects)").all() as {name:string}[]).map((column)=>column.name));
  if(!projectGeoColumns.has("latitude")) db.exec("ALTER TABLE projects ADD COLUMN latitude REAL");
  if(!projectGeoColumns.has("longitude")) db.exec("ALTER TABLE projects ADD COLUMN longitude REAL");
  const elementSourceColumns = new Set((db.prepare("PRAGMA table_info(project_elements)").all() as {name:string}[]).map((column)=>column.name));
  if(!elementSourceColumns.has("created_import_id")) db.exec("ALTER TABLE project_elements ADD COLUMN created_import_id INTEGER");
  if(!elementSourceColumns.has("last_import_id")) db.exec("ALTER TABLE project_elements ADD COLUMN last_import_id INTEGER");
  if(!elementSourceColumns.has("last_source_revision")) db.exec("ALTER TABLE project_elements ADD COLUMN last_source_revision TEXT NOT NULL DEFAULT ''");
  if(!elementSourceColumns.has("source_presence")) db.exec("ALTER TABLE project_elements ADD COLUMN source_presence TEXT NOT NULL DEFAULT 'Present'");
  db.exec(`
    CREATE TABLE IF NOT EXISTS element_register_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL, original_filename TEXT NOT NULL,
      source_revision TEXT NOT NULL DEFAULT '', source_hash TEXT NOT NULL, worksheet_name TEXT NOT NULL DEFAULT '',
      mapping_json TEXT NOT NULL DEFAULT '{}', payload_json TEXT NOT NULL DEFAULT '[]', summary_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'Preview', notes TEXT NOT NULL DEFAULT '', imported_by_id INTEGER,
      imported_by TEXT NOT NULL, imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, applied_at TEXT NOT NULL DEFAULT '',
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE RESTRICT,
      FOREIGN KEY(imported_by_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS element_import_project_idx ON element_register_imports(project_id, imported_at);
    CREATE INDEX IF NOT EXISTS element_import_hash_idx ON element_register_imports(project_id, source_hash, status);
    CREATE TABLE IF NOT EXISTS daily_report_weather (
      id INTEGER PRIMARY KEY AUTOINCREMENT, report_id INTEGER NOT NULL, timepoint TEXT NOT NULL,
      temperature REAL, condition_code INTEGER, condition TEXT NOT NULL DEFAULT '', precipitation REAL,
      wind_speed REAL, wind_gust REAL, provider TEXT NOT NULL, retrieved_at TEXT NOT NULL,
      UNIQUE(report_id,timepoint), FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS report_weather_report_idx ON daily_report_weather(report_id,timepoint);
  `);
  db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES (?)").run("sprint11_1_operations_upgrade");
}

const repeatedElementMarks = db.prepare("SELECT 1 FROM schema_migrations WHERE name = ?").get("sprint11_1_repeated_element_marks");
if (!repeatedElementMarks) {
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec(`
    DROP TRIGGER IF EXISTS project_elements_installed_correction_guard;
    CREATE TABLE project_elements_repeated_marks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL, code TEXT NOT NULL COLLATE NOCASE,
      element_type TEXT NOT NULL, floor TEXT NOT NULL DEFAULT '', zone TEXT NOT NULL DEFAULT '',
      drawing_ref TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', weight REAL, length REAL,
      width REAL, height REAL, supplier TEXT NOT NULL DEFAULT '', planned_delivery_date TEXT NOT NULL DEFAULT '',
      actual_delivery_date TEXT NOT NULL DEFAULT '', installation_date TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'Planned',
      issue_note TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
      installed_report_id INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_import_id INTEGER, last_import_id INTEGER, last_source_revision TEXT NOT NULL DEFAULT '',
      source_presence TEXT NOT NULL DEFAULT 'Present', source_key TEXT NOT NULL DEFAULT '', source_row INTEGER,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE RESTRICT,
      FOREIGN KEY(installed_report_id) REFERENCES reports(id) ON DELETE RESTRICT
    );
    INSERT INTO project_elements_repeated_marks(id,project_id,code,element_type,floor,zone,drawing_ref,description,weight,length,width,height,supplier,planned_delivery_date,actual_delivery_date,installation_date,status,issue_note,notes,active,installed_report_id,created_at,updated_at,created_import_id,last_import_id,last_source_revision,source_presence)
      SELECT id,project_id,code,element_type,floor,zone,drawing_ref,description,weight,length,width,height,supplier,planned_delivery_date,actual_delivery_date,installation_date,status,issue_note,notes,active,installed_report_id,created_at,updated_at,created_import_id,last_import_id,last_source_revision,source_presence FROM project_elements;
    DROP TABLE project_elements;
    ALTER TABLE project_elements_repeated_marks RENAME TO project_elements;
    CREATE INDEX project_elements_filter_idx ON project_elements(project_id,active,floor,zone,element_type,status,code);
    CREATE INDEX project_elements_code_idx ON project_elements(project_id,code,id);
    CREATE INDEX project_elements_source_key_idx ON project_elements(project_id,source_key);
    CREATE TRIGGER project_elements_installed_correction_guard BEFORE UPDATE OF status ON project_elements
      WHEN OLD.status='Installed' AND NEW.status<>'Installed' AND NEW.installed_report_id IS NOT NULL
      BEGIN SELECT RAISE(ABORT,'Installed elements require the correction workflow'); END;
  `);
  db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES (?)").run("sprint11_1_repeated_element_marks");
  db.exec("PRAGMA foreign_keys = ON");
}
const importSourcePayload = db.prepare("SELECT 1 FROM schema_migrations WHERE name = ?").get("sprint11_1_import_source_payload");
if (!importSourcePayload) {
  const columns = new Set((db.prepare("PRAGMA table_info(element_register_imports)").all() as {name:string}[]).map((column)=>column.name));
  if(!columns.has("source_payload_json")) db.exec("ALTER TABLE element_register_imports ADD COLUMN source_payload_json TEXT NOT NULL DEFAULT '{}'");
  db.exec("UPDATE element_register_imports SET source_payload_json=payload_json WHERE status='Mapping' AND source_payload_json='{}'");
  db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES (?)").run("sprint11_1_import_source_payload");
}
const importApplyLifecycle = db.prepare("SELECT 1 FROM schema_migrations WHERE name = ?").get("sprint11_1_import_apply_lifecycle");
if (!importApplyLifecycle) {
  const columns = new Set((db.prepare("PRAGMA table_info(element_register_imports)").all() as {name:string}[]).map((column)=>column.name));
  if(!columns.has("applied_by_id")) db.exec("ALTER TABLE element_register_imports ADD COLUMN applied_by_id INTEGER");
  if(!columns.has("applied_by")) db.exec("ALTER TABLE element_register_imports ADD COLUMN applied_by TEXT NOT NULL DEFAULT ''");
  db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES (?)").run("sprint11_1_import_apply_lifecycle");
}
