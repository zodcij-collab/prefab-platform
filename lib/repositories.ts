import { db } from "./db";

export type Project = { id: string; name: string; location: string; client: string; status: string; progress: number; peopleToday: number; nextDelivery: string; manager: string; managerEmployeeId: string | null; startDate: string; targetDate: string; description: string };
export type Employee = { id: string; name: string; role: string; project: string; phone: string; status: string; certificates: string[] };
export type DocumentRow = { id: string; name: string; category: string; project: string; revision: string; updated: string; status: string };
export type DailyReport = { id: number; projectId: string; project: string; date: string; people: number; work: string; deliveries: number; issues: number; weather: string; notes: string; author: string };
export type ProjectEvent = { id: number; projectId: string; date: string; time: string; type: string; title: string; details: string; author: string };
export type ActivityLog = { id: number; actor: string; action: string; entityType: string; entityId: string; details: string; createdAt: string };
export type UserAccess = { id: number; name: string; email: string; role: string; active: number; createdAt: string };
export type Delivery = { id: number; projectId: string; deliveryDate: string; deliveryTime: string; supplier: string; loadRef: string; description: string; status: string; notes: string };
export type ProjectIssue = { id: number; projectId: string; createdDate: string; category: string; title: string; priority: string; status: string; owner: string; ownerEmployeeId: string | null; details: string };
export type ProjectPhoto = { id: number; projectId: string; photoDate: string; area: string; caption: string; fileRef: string; author: string; notes: string; originalFilename: string; storedPath: string; fileSize: number; mimeType: string; uploadedById: number|null; uploadedAt: string };
export type ProjectDocument = { id:number; projectId:string; project:string; title:string; category:string; revision:string; documentDate:string; status:string; description:string; originalFilename:string; storedPath:string; fileSize:number; mimeType:string; uploadedById:number|null; uploadedBy:string; uploadedAt:string };
export type ProjectMember = Employee & { projectRole: string; assignedAt: string };

const projectSelect = `SELECT id, name, location, client, status, progress, people_today AS peopleToday, next_delivery AS nextDelivery, manager, manager_employee_id AS managerEmployeeId, start_date AS startDate, target_date AS targetDate, description FROM projects`;

export function listProjects(): Project[] { return db.prepare(`${projectSelect} ORDER BY CASE status WHEN 'Active' THEN 0 WHEN 'Planning' THEN 1 ELSE 2 END, name`).all() as unknown as Project[]; }
export function getProject(id: string): Project | undefined { return db.prepare(`${projectSelect} WHERE id = ?`).get(id) as Project | undefined; }
export function getProjectByName(name: string): Project | undefined { return db.prepare(`${projectSelect} WHERE name = ? COLLATE NOCASE`).get(name) as Project | undefined; }
export function createProject(input: Pick<Project, "id" | "name" | "location" | "client" | "status" | "manager" | "managerEmployeeId" | "startDate" | "targetDate" | "description">) {
  return db.prepare(`INSERT INTO projects (id,name,location,client,status,manager,manager_employee_id,start_date,target_date,description) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(input.id,input.name,input.location,input.client,input.status,input.manager,input.managerEmployeeId,input.startDate,input.targetDate,input.description);
}
export function updateProject(id: string, previousName: string, input: Pick<Project, "name" | "location" | "client" | "status" | "manager" | "managerEmployeeId" | "startDate" | "targetDate" | "description">) {
  const result=db.prepare(`UPDATE projects SET name=?,location=?,client=?,status=?,manager=?,manager_employee_id=?,start_date=?,target_date=?,description=? WHERE id=?`).run(input.name,input.location,input.client,input.status,input.manager,input.managerEmployeeId,input.startDate,input.targetDate,input.description,id);
  if (previousName !== input.name) {
    db.prepare("UPDATE reports SET project_name=? WHERE project_id=?").run(input.name,id);
    db.prepare("UPDATE documents SET project=? WHERE project=?").run(input.name,previousName);
    db.prepare("UPDATE employees SET project=? WHERE project=?").run(input.name,previousName);
  }
  return result;
}
export function listEmployees(): Employee[] {
  const rows = db.prepare(`SELECT e.id,e.name,e.role,COALESCE((SELECT GROUP_CONCAT(p.name, ', ') FROM project_members m JOIN projects p ON p.id=m.project_id WHERE m.employee_id=e.id),'—') AS project,e.phone,e.status,e.certificates FROM employees e ORDER BY e.name`).all() as unknown as (Omit<Employee,"certificates"> & { certificates: string })[];
  return rows.map((r) => ({ ...r, certificates: JSON.parse(r.certificates) as string[] }));
}
export function listDocuments(): DocumentRow[] { return db.prepare("SELECT id, name, category, project, revision, updated, status FROM documents ORDER BY updated DESC").all() as unknown as DocumentRow[]; }
export function listReports(): DailyReport[] {
  return db.prepare(`SELECT id, project_id AS projectId, project_name AS project, report_date AS date, people, work, deliveries, issues, weather, notes, author FROM reports ORDER BY report_date DESC, id DESC`).all() as unknown as DailyReport[];
}
export function createReport(input: Omit<DailyReport, "id" | "project"> & { project: string }) {
  return db.prepare(`INSERT INTO reports (project_id, project_name, report_date, people, work, deliveries, issues, weather, notes, author) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(input.projectId, input.project, input.date, input.people, input.work, input.deliveries, input.issues, input.weather, input.notes, input.author);
}

export function listProjectEvents(projectId: string): ProjectEvent[] {
  return db.prepare(`SELECT id, project_id AS projectId, event_date AS date, event_time AS time, event_type AS type, title, details, author FROM project_events WHERE project_id = ? ORDER BY event_date DESC, event_time DESC, id DESC`).all(projectId) as unknown as ProjectEvent[];
}
export function addProjectEvent(input: Omit<ProjectEvent, "id">) {
  return db.prepare(`INSERT INTO project_events (project_id, event_date, event_time, event_type, title, details, author) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(input.projectId, input.date, input.time, input.type, input.title, input.details, input.author);
}
export function logActivity(input: { userId?: number; actor: string; action: string; entityType: string; entityId?: string; details?: string }) {
  return db.prepare(`INSERT INTO activity_log (user_id, actor, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)`).run(input.userId ?? null, input.actor, input.action, input.entityType, input.entityId ?? "", input.details ?? "");
}
export function listActivity(limit = 20): ActivityLog[] {
  return db.prepare(`SELECT id, actor, action, entity_type AS entityType, entity_id AS entityId, details, created_at AS createdAt FROM activity_log ORDER BY id DESC LIMIT ?`).all(limit) as unknown as ActivityLog[];
}
export function listProjectActivity(projectId: string): ActivityLog[] {
  return db.prepare(`SELECT id, actor, action, entity_type AS entityType, entity_id AS entityId, details, created_at AS createdAt FROM activity_log WHERE entity_type = 'project' AND entity_id = ? ORDER BY id DESC`).all(projectId) as unknown as ActivityLog[];
}
export function listUsers(): UserAccess[] {
  return db.prepare(`SELECT id, name, email, role, active, created_at AS createdAt FROM users ORDER BY CASE role WHEN 'Director' THEN 0 WHEN 'Administrator' THEN 1 WHEN 'Project Manager' THEN 2 WHEN 'Foreman' THEN 3 ELSE 4 END, name`).all() as unknown as UserAccess[];
}
export function getUserAccess(id: number): UserAccess | undefined {
  return db.prepare(`SELECT id, name, email, role, active, created_at AS createdAt FROM users WHERE id=?`).get(id) as UserAccess | undefined;
}
export function getUserAccessByEmail(email: string): UserAccess | undefined {
  return db.prepare(`SELECT id, name, email, role, active, created_at AS createdAt FROM users WHERE email=? COLLATE NOCASE`).get(email) as UserAccess | undefined;
}
export function createUserAccess(input: { name:string;email:string;role:string;active:number;passwordHash:string }) {
  return db.prepare(`INSERT INTO users(name,email,role,active,password_hash) VALUES(?,?,?,?,?)`).run(input.name,input.email,input.role,input.active,input.passwordHash);
}
export function updateUserAccess(id:number,input:{name:string;email:string;role:string;active:number}) {
  return db.prepare(`UPDATE users SET name=?,email=?,role=?,active=? WHERE id=?`).run(input.name,input.email,input.role,input.active,id);
}

export function listDeliveries(projectId: string): Delivery[] {
  return db.prepare(`SELECT id, project_id AS projectId, delivery_date AS deliveryDate, delivery_time AS deliveryTime, supplier, load_ref AS loadRef, description, status, notes FROM deliveries WHERE project_id = ? ORDER BY delivery_date DESC, delivery_time DESC, id DESC`).all(projectId) as unknown as Delivery[];
}
export function listProjectIssues(projectId: string): ProjectIssue[] {
  return db.prepare(`SELECT id, project_id AS projectId, created_date AS createdDate, category, title, priority, status, owner, owner_employee_id AS ownerEmployeeId, details FROM project_issues WHERE project_id = ? ORDER BY CASE status WHEN 'Open' THEN 0 WHEN 'In progress' THEN 1 ELSE 2 END, id DESC`).all(projectId) as unknown as ProjectIssue[];
}
export function listProjectPhotos(projectId: string): ProjectPhoto[] {
  return db.prepare(`SELECT id,project_id AS projectId,photo_date AS photoDate,area,caption,file_ref AS fileRef,author,notes,original_filename AS originalFilename,stored_path AS storedPath,file_size AS fileSize,mime_type AS mimeType,uploaded_by_id AS uploadedById,uploaded_at AS uploadedAt FROM project_photos WHERE project_id=? ORDER BY photo_date DESC,id DESC`).all(projectId) as unknown as ProjectPhoto[];
}
export function listProjectDocuments(projectId?:string): ProjectDocument[] { const where=projectId?"WHERE d.project_id = ?":""; return db.prepare(`SELECT d.id,d.project_id AS projectId,p.name AS project,d.title,d.category,d.revision,d.document_date AS documentDate,d.status,d.description,d.original_filename AS originalFilename,d.stored_path AS storedPath,d.file_size AS fileSize,d.mime_type AS mimeType,d.uploaded_by_id AS uploadedById,d.uploaded_by AS uploadedBy,d.uploaded_at AS uploadedAt FROM project_documents d JOIN projects p ON p.id=d.project_id ${where} ORDER BY d.uploaded_at DESC,d.id DESC`).all(...(projectId?[projectId]:[])) as unknown as ProjectDocument[]; }
export function getProjectDocument(id:number):ProjectDocument|undefined{return db.prepare(`SELECT d.id,d.project_id AS projectId,p.name AS project,d.title,d.category,d.revision,d.document_date AS documentDate,d.status,d.description,d.original_filename AS originalFilename,d.stored_path AS storedPath,d.file_size AS fileSize,d.mime_type AS mimeType,d.uploaded_by_id AS uploadedById,d.uploaded_by AS uploadedBy,d.uploaded_at AS uploadedAt FROM project_documents d JOIN projects p ON p.id=d.project_id WHERE d.id=?`).get(id) as ProjectDocument|undefined;}
export function createProjectDocument(input:Omit<ProjectDocument,"id"|"project"|"uploadedAt">){return db.prepare(`INSERT INTO project_documents(project_id,title,category,revision,document_date,status,description,original_filename,stored_path,file_size,mime_type,uploaded_by_id,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(input.projectId,input.title,input.category,input.revision,input.documentDate,input.status,input.description,input.originalFilename,input.storedPath,input.fileSize,input.mimeType,input.uploadedById,input.uploadedBy);}
export function updateProjectDocumentMetadata(id:number,input:Pick<ProjectDocument,"title"|"category"|"revision"|"documentDate"|"status"|"description">){return db.prepare(`UPDATE project_documents SET title=?,category=?,revision=?,document_date=?,status=?,description=? WHERE id=?`).run(input.title,input.category,input.revision,input.documentDate,input.status,input.description,id);}
export function deleteProjectDocument(id:number){return db.prepare("DELETE FROM project_documents WHERE id=?").run(id);}
export function getProjectPhoto(id:number):ProjectPhoto|undefined{return db.prepare(`SELECT id,project_id AS projectId,photo_date AS photoDate,area,caption,file_ref AS fileRef,author,notes,original_filename AS originalFilename,stored_path AS storedPath,file_size AS fileSize,mime_type AS mimeType,uploaded_by_id AS uploadedById,uploaded_at AS uploadedAt FROM project_photos WHERE id=?`).get(id) as ProjectPhoto|undefined;}
export function createProjectPhoto(input:Omit<ProjectPhoto,"id"|"fileRef"|"uploadedAt">){return db.prepare(`INSERT INTO project_photos(project_id,photo_date,area,caption,author,notes,original_filename,stored_path,file_size,mime_type,uploaded_by_id,uploaded_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).run(input.projectId,input.photoDate,input.area,input.caption,input.author,input.notes,input.originalFilename,input.storedPath,input.fileSize,input.mimeType,input.uploadedById);}
export function updateProjectPhotoMetadata(id:number,input:Pick<ProjectPhoto,"photoDate"|"area"|"caption"|"notes">){return db.prepare(`UPDATE project_photos SET photo_date=?,area=?,caption=?,notes=? WHERE id=?`).run(input.photoDate,input.area,input.caption,input.notes,id);}
export function deleteProjectPhoto(id:number){return db.prepare("DELETE FROM project_photos WHERE id=?").run(id);}
export function listProjectMembers(projectId: string): ProjectMember[] {
  const rows = db.prepare(`SELECT e.id,e.name,e.role,e.project,e.phone,e.status,e.certificates,m.project_role AS projectRole,m.assigned_at AS assignedAt FROM project_members m JOIN employees e ON e.id=m.employee_id WHERE m.project_id=? ORDER BY CASE m.project_role WHEN 'Project manager' THEN 0 WHEN 'Site lead' THEN 1 ELSE 2 END,e.name`).all(projectId) as unknown as (Omit<ProjectMember,"certificates"> & {certificates:string})[];
  return rows.map((row) => ({...row, certificates: JSON.parse(row.certificates) as string[]}));
}
export function assignProjectMember(projectId: string, employeeId: string, projectRole: string) { return db.prepare(`INSERT INTO project_members (project_id,employee_id,project_role) VALUES (?,?,?) ON CONFLICT(project_id,employee_id) DO UPDATE SET project_role=excluded.project_role`).run(projectId,employeeId,projectRole); }
export function removeProjectMember(projectId: string, employeeId: string) { return db.prepare(`DELETE FROM project_members WHERE project_id=? AND employee_id=?`).run(projectId,employeeId); }
export function unassignProjectIssues(projectId: string, employeeId: string) { return db.prepare(`UPDATE project_issues SET owner='',owner_employee_id=NULL WHERE project_id=? AND owner_employee_id=?`).run(projectId,employeeId); }
export function getDelivery(id: number): Delivery | undefined { return db.prepare(`SELECT id,project_id AS projectId,delivery_date AS deliveryDate,delivery_time AS deliveryTime,supplier,load_ref AS loadRef,description,status,notes FROM deliveries WHERE id=?`).get(id) as Delivery | undefined; }
export function saveDelivery(input: Omit<Delivery,"id"> & {id?:number}) { return input.id ? db.prepare(`UPDATE deliveries SET delivery_date=?,delivery_time=?,supplier=?,load_ref=?,description=?,status=?,notes=? WHERE id=? AND project_id=?`).run(input.deliveryDate,input.deliveryTime,input.supplier,input.loadRef,input.description,input.status,input.notes,input.id,input.projectId) : db.prepare(`INSERT INTO deliveries (project_id,delivery_date,delivery_time,supplier,load_ref,description,status,notes) VALUES (?,?,?,?,?,?,?,?)`).run(input.projectId,input.deliveryDate,input.deliveryTime,input.supplier,input.loadRef,input.description,input.status,input.notes); }
export function deleteDelivery(id: number, projectId: string) { return db.prepare(`DELETE FROM deliveries WHERE id=? AND project_id=?`).run(id,projectId); }
export function getProjectIssue(id: number): ProjectIssue | undefined { return db.prepare(`SELECT id,project_id AS projectId,created_date AS createdDate,category,title,priority,status,owner,owner_employee_id AS ownerEmployeeId,details FROM project_issues WHERE id=?`).get(id) as ProjectIssue | undefined; }
export function saveProjectIssue(input: Omit<ProjectIssue,"id"> & {id?:number}) { return input.id ? db.prepare(`UPDATE project_issues SET created_date=?,category=?,title=?,priority=?,status=?,owner=?,owner_employee_id=?,details=? WHERE id=? AND project_id=?`).run(input.createdDate,input.category,input.title,input.priority,input.status,input.owner,input.ownerEmployeeId,input.details,input.id,input.projectId) : db.prepare(`INSERT INTO project_issues (project_id,created_date,category,title,priority,status,owner,owner_employee_id,details) VALUES (?,?,?,?,?,?,?,?,?)`).run(input.projectId,input.createdDate,input.category,input.title,input.priority,input.status,input.owner,input.ownerEmployeeId,input.details); }
export function deleteProjectIssue(id: number, projectId: string) { return db.prepare(`DELETE FROM project_issues WHERE id=? AND project_id=?`).run(id,projectId); }

export function runTransaction<T>(work: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try { const result=work(); db.exec("COMMIT"); return result; }
  catch (error) { db.exec("ROLLBACK"); throw error; }
}
