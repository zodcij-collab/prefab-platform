import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { setupTestDb, type TestDb } from "./helpers/test-db.ts";
import { DEFAULT_OFFBOARDING_ITEMS, offboardingUnresolvedCount } from "../lib/personnel.ts";

let ctx: TestDb; let repo: TestDb["repo"];
let pr: typeof import("../lib/personnel-repo.ts");
let perms: typeof import("../lib/permissions.ts");
const actor = { id: 1, name: "Tester" };
let seq = 0;
function newEmployee(first = "Jan", last = "Berzins"): string {
  const id = `emp-t-${++seq}`;
  repo.createEmployee({ id, firstName: first, lastName: last, role: "Assembler", phone: "2000", email: "", status: "Active", defaultProjectId: null, employmentStartDate: "2026-01-01", employmentEndDate: "", notes: "" });
  return id;
}
function newProject(id: string) {
  repo.createProject({ id, name: id, location: "Rīga", client: "C", status: "Active", manager: "PM", managerEmployeeId: null, startDate: "", targetDate: "", description: "", latitude: null, longitude: null });
}

before(async () => {
  ctx = await setupTestDb(); repo = ctx.repo;
  pr = await import("../lib/personnel-repo.ts");
  perms = await import("../lib/permissions.ts");
});
after(() => ctx.cleanup());

test("§A/AF: employee lifecycle Active → Offboarding → Inactive never hard-deletes the row", () => {
  const id = newEmployee();
  assert.equal(pr.getEmployeeSafe(id)!.status, "Active");
  const ob = pr.startOffboarding(id, DEFAULT_OFFBOARDING_ITEMS, actor);
  assert.equal(pr.getEmployeeSafe(id)!.status, "Offboarding", "§AD: starting offboarding moves to Offboarding");
  const items = pr.listOffboardingItems(ob);
  assert.equal(items.length, DEFAULT_OFFBOARDING_ITEMS.length);
  // §AE: complete with an unresolved item — the record is preserved, not auto-closed.
  pr.updateOffboardingItem(items[0].id, "Closed", "returned", actor);
  const unresolved = offboardingUnresolvedCount(pr.listOffboardingItems(ob));
  assert.ok(unresolved > 0, "unresolved items remain");
  pr.completeOffboarding(ob, { terminationDate: "2026-08-31", reason: "Employee resignation", reasonComment: "", unresolved }, actor);
  assert.equal(pr.getEmployeeSafe(id)!.status, "Inactive", "§AF: completion → Inactive, still present");
  assert.ok(pr.getEmployeeSafe(id), "the employee row is never deleted");
  assert.equal(pr.listOffboardingItems(ob).filter((i) => i.state !== "Closed").length, unresolved, "unresolved records preserved");
});

test("§B: Employee and User are separate entities (creating an employee makes no user account)", () => {
  const before = repo.listUsers().length;
  newEmployee("No", "Login");
  assert.equal(repo.listUsers().length, before, "no platform user is created for a new employee");
});

test("§C/AT: project assignment is independent of platform user access", () => {
  newProject("pa-1");
  const id = newEmployee("Crew", "Member");
  pr.assignEmployeeToProject("pa-1", id, "Team member", "2026-08-17", actor);
  assert.ok(pr.listProjectAssignedEmployees("pa-1").some((a) => a.employeeId === id), "assigned to the project crew");
  // The employee has no linked user; a *user* with the same idea of access is a different layer.
  const foreman = { id: 999, email: "f@test", name: "F", role: "Foreman" };
  assert.equal(perms.canViewProjectIssues(foreman, "pa-1"), false, "crew assignment grants no platform project access");
});

test("§D: multiple skills per employee (position ≠ skill) and reverse lookup", () => {
  const id = newEmployee();
  pr.setEmployeeSkills(id, ["Welder", "Rigger", "Carpenter", "Welder"], actor); // dupes de-duplicated
  const skills = pr.listEmployeeSkills(id).map((s) => s.skill).sort();
  assert.deepEqual(skills, ["Carpenter", "Rigger", "Welder"]);
  assert.ok(pr.listEmployeesBySkill("Welder").includes(id), "filterable by skill");
});

test("§E: workwear sizes persist on the employee profile", () => {
  const id = newEmployee();
  pr.updateEmployeeProfile(id, { dateOfBirth: "1990-05-05", personalCode: "010190-12345", emergencyContact: "Anna", emergencyContactPhone: "2999", jacketSize: "L", trousersSize: "52", shoeSize: "44" }, actor);
  const full = pr.getEmployeeFull(id)!;
  assert.equal(full.jacketSize, "L"); assert.equal(full.trousersSize, "52"); assert.equal(full.shoeSize, "44");
});

test("§25 privacy: the SAFE projection excludes personal code / DOB / emergency contact; FULL includes them", () => {
  const id = newEmployee();
  pr.updateEmployeeProfile(id, { dateOfBirth: "1990-05-05", personalCode: "010190-12345", emergencyContact: "Anna", emergencyContactPhone: "2999", jacketSize: "L", trousersSize: "52", shoeSize: "44" }, actor);
  const safe = pr.getEmployeeSafe(id)! as Record<string, unknown>;
  assert.equal(safe.personalCode, undefined, "personal code is NOT in the operational projection");
  assert.equal(safe.dateOfBirth, undefined);
  assert.equal(safe.emergencyContact, undefined);
  assert.equal(pr.getEmployeeFull(id)!.personalCode, "010190-12345", "full projection has it for PM+");
  // and the permission tiers enforce who may see the full projection
  const foreman = { id: 2, email: "f@t", name: "F", role: "Foreman" };
  const pm = { id: 3, email: "p@t", name: "P", role: "Project Manager" };
  assert.equal(perms.canViewPersonnel(foreman), true, "Foreman has operational visibility");
  assert.equal(perms.canViewPersonnelSensitive(foreman), false, "Foreman may NOT see sensitive HR data");
  assert.equal(perms.canViewPersonnelSensitive(pm), true, "PM+ may see sensitive HR data");
});

test("§F: private employee documents are stored and retrievable per relation", () => {
  const id = newEmployee();
  const docId = pr.addEmployeeDocument(id, { relationType: "ovp", relationId: null, title: "OVP scan", originalFilename: "ovp.pdf", storedPath: "documents/ovp-x.pdf", fileSize: 100, mimeType: "application/pdf" }, actor);
  assert.equal(pr.listEmployeeDocuments(id, "ovp").length, 1);
  assert.equal(pr.getEmployeeDocumentById(docId)!.storedPath, "documents/ovp-x.pdf");
  assert.equal(pr.listEmployeeDocuments(id, "qualification").length, 0, "scoped by relation type");
});

test("§H/I/J: OVP custom expiry + current status derives from the latest record", () => {
  const id = newEmployee();
  pr.addEmployeeOvp(id, { examDate: "2025-01-01", validUntil: "2025-12-31", provider: "Med", comment: "" }, actor); // expired
  assert.equal(pr.employeeOvpStatus(id, "2026-08-17").status, "expired");
  pr.addEmployeeOvp(id, { examDate: "2026-08-01", validUntil: "2027-08-01", provider: "Med", comment: "" }, actor); // valid, later
  assert.equal(pr.employeeOvpStatus(id, "2026-08-17").status, "valid", "latest valid-until drives status");
  assert.equal(pr.employeeOvpStatus(id, "2027-07-20").status, "expiring", "within 30 days → expiring");
});

test("§K/L/M/N/O: multiple qualifications incl. several Welder certs; optional expiry; custom Other", () => {
  const id = newEmployee();
  pr.addEmployeeQualification(id, { category: "Welder", customTitle: "", certNumber: "W-1", organization: "IWS", issueDate: "2024-01-01", validUntil: "", comment: "" }, actor);
  pr.addEmployeeQualification(id, { category: "Welder", customTitle: "", certNumber: "W-2", organization: "IWS", issueDate: "2025-01-01", validUntil: "2027-01-01", comment: "" }, actor);
  pr.addEmployeeQualification(id, { category: "Other", customTitle: "Scaffolder", certNumber: "S-9", organization: "X", issueDate: "2026-01-01", validUntil: "", comment: "" }, actor);
  const quals = pr.listEmployeeQualifications(id);
  assert.equal(quals.filter((q) => q.category === "Welder").length, 2, "§N: multiple Welder certificates");
  assert.ok(quals.some((q) => q.category === "Other" && q.customTitle === "Scaffolder"), "§M: custom Other title");
  assert.ok(quals.some((q) => q.validUntil === ""), "§L: expiry is optional");
  const warn = pr.employeeQualificationWarning(id, "2026-12-20");
  assert.equal(warn.expiring, 1, "§O: the dated cert nearing expiry is flagged; undated ones are not");
});

test("§P/Q/R: safety induction is project-specific and preserves conductor/date", () => {
  newProject("ind-a"); newProject("ind-b");
  const id = newEmployee();
  pr.assignEmployeeToProject("ind-a", id, "Team member", "2026-08-17", actor);
  pr.assignEmployeeToProject("ind-b", id, "Team member", "2026-08-17", actor);
  pr.setProjectInduction("ind-a", id, { completed: true, completionDate: "2026-08-17", conductedBy: "Foreman K", comment: "ok" }, actor);
  assert.equal(pr.getProjectInduction("ind-a", id)!.completed, 1, "§P: inducted on A");
  assert.equal(pr.getProjectInduction("ind-b", id), undefined, "§Q: induction on A does NOT satisfy B");
  assert.equal(pr.getProjectInduction("ind-a", id)!.conductedBy, "Foreman K", "§R: conductor preserved");
  assert.equal(pr.getProjectInduction("ind-a", id)!.completionDate, "2026-08-17");
});

test("§AB/AC: safety records link employee+project and roll up over 12 months", () => {
  newProject("saf-1");
  const id = newEmployee();
  pr.addSafetyRecord({ employeeId: id, projectId: "saf-1", occurredAt: "2026-08-01 09:00:00", category: "PPE", severity: "Major", description: "no helmet", actionTaken: "corrected" }, actor);
  pr.addSafetyRecord({ employeeId: id, projectId: "saf-1", occurredAt: "2026-06-01 09:00:00", category: "Housekeeping", severity: "Observation", description: "clutter", actionTaken: "" }, actor);
  assert.equal(pr.listProjectSafetyRecords("saf-1").length, 2, "§AC: project-scoped");
  const summary = pr.employeeSafetySummary(id, "2026-08-17");
  assert.equal(summary.total, 2); assert.equal(summary.major, 1); assert.equal(summary.observations, 1);
});

// ── Personnel project-visibility / assignment-consistency (blocker) ───────────
// "Assigned to project X" has ONE meaning: an active employee_project_assignments row — the same
// source used by the Employees list, Project Personnel, and the Daily Log crew. Role rank never
// removes a participant; sensitive-data access stays a separate concern.
function assignedIdsFor(projectId: string): Set<string> {
  // The exact derivation the Employees list uses for its project column + filter.
  const map = new Map<string, Set<string>>();
  for (const a of pr.listActiveAssignments()) { (map.get(a.employeeId) ?? map.set(a.employeeId, new Set()).get(a.employeeId)!).add(a.projectId); }
  return new Set([...map].filter(([, ids]) => ids.has(projectId)).map(([id]) => id));
}

test("§1/§3: an assigned Project Manager appears in the project's personnel list regardless of role rank", () => {
  newProject("vis-x");
  const pm = newEmployee("Edvards", "Manager");
  // make the employee a Project Manager (role rank higher than a Foreman viewer)
  ctx.db.prepare("UPDATE employees SET role='Project Manager' WHERE id=?").run(pm);
  const installer = newEmployee("Ivan", "Installer");
  pr.assignEmployeeToProject("vis-x", pm, "Project manager", "2026-08-17", actor);
  pr.assignEmployeeToProject("vis-x", installer, "Team member", "2026-08-17", actor);
  const assigned = assignedIdsFor("vis-x");
  assert.ok(assigned.has(pm), "§1: the assigned Project Manager is a project participant (not hidden by role rank)");
  assert.ok(assigned.has(installer), "§3: all genuinely assigned employees are returned regardless of role");
});

test("§4: an employee NOT assigned is not included merely because of a high role", () => {
  newProject("vis-y");
  const director = newEmployee("Dir", "Ector");
  ctx.db.prepare("UPDATE employees SET role='Director' WHERE id=?").run(director);
  // director is NOT assigned to vis-y
  assert.equal(assignedIdsFor("vis-y").has(director), false, "role never grants project participation");
  assert.equal(pr.listProjectAssignedEmployees("vis-y", true).length, 0);
});

test("§5/§6: Employees filter, Project Personnel and Daily Log crew all agree on membership", () => {
  newProject("vis-z");
  const a = newEmployee("A", "One"), b = newEmployee("B", "Two");
  pr.assignEmployeeToProject("vis-z", a, "Team member", "2026-08-17", actor);
  pr.assignEmployeeToProject("vis-z", b, "Team member", "2026-08-17", actor);
  const listSource = assignedIdsFor("vis-z");                                   // Employees list
  const projectPersonnel = new Set(pr.listProjectAssignedEmployees("vis-z", true).map((x) => x.employeeId)); // Project Personnel + Daily Log crew
  assert.deepEqual([...listSource].sort(), [...projectPersonnel].sort(), "all three operational surfaces use the same assignment source");
});

test("§2/§25: a Foreman may know a PM participates, but still cannot see sensitive HR data/documents", async () => {
  const perms = await import("../lib/permissions.ts");
  const pm = newEmployee("Sensitive", "PM");
  pr.updateEmployeeProfile(pm, { dateOfBirth: "1980-01-01", personalCode: "010180-99999", emergencyContact: "X", emergencyContactPhone: "9", jacketSize: "L", trousersSize: "50", shoeSize: "43" }, actor);
  const foreman = { id: 42, email: "f@t", name: "F", role: "Foreman" };
  // operational visibility (name/position/status) is fine…
  assert.equal(perms.canViewPersonnel(foreman), true);
  const safe = pr.getEmployeeSafe(pm)! as Record<string, unknown>;
  assert.equal(safe.personalCode, undefined, "sensitive fields are absent from the operational projection");
  assert.equal(safe.dateOfBirth, undefined);
  // …but sensitive data + private documents remain PM+ only.
  assert.equal(perms.canViewPersonnelSensitive(foreman), false);
  assert.equal(perms.canViewPersonnelDocuments(foreman), false);
  assert.equal(pr.getEmployeeFull(pm)!.personalCode, "010180-99999", "PM+ can see the full record");
});

// ── Employee photo display (blocker) ─────────────────────────────────────────
// A stored employee photo must resolve and SERVE through the exact path the profile uses:
//   <img src="/portal/files/employee-photo/[id]"> → route → getEmployeePhoto → readStoredFile.
// (The reported incident was a missing physical file, not an app-path defect — this guards the
// path and the access boundary so a genuine stored photo always renders.)
test("§photo: a stored employee photo resolves + serves through the profile's route path; access boundary intact", async () => {
  const { storeUpload, readStoredFile, removeStoredFile } = await import("../lib/storage.ts");
  const perms = await import("../lib/permissions.ts");
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const id = newEmployee("Photo", "Owner");
  // a valid JPEG (FF D8 FF … FF D9) stored exactly as the upload action does
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(600, 0x20), Buffer.from([0xff, 0xd9])]);
  const stored = await storeUpload(new File([jpeg], "p.jpg", { type: "image/jpeg" }), "photos");
  pr.setEmployeePhoto(id, stored.storedPath, "image/jpeg", actor);
  try {
    // the route's exact logic:
    const rec = pr.getEmployeePhoto(id);
    assert.ok(rec, "the photo reference resolves");
    assert.equal(rec!.mimeType, "image/jpeg");
    const bytes = await readStoredFile(rec!.storedPath);
    assert.ok(bytes.length > 0 && bytes[0] === 0xff && bytes[1] === 0xd8, "the stored photo serves valid JPEG bytes through readStoredFile");
    // an employee WITHOUT a photo resolves to nothing (no broken reference)
    assert.equal(pr.getEmployeePhoto(newEmployee("No", "Photo")), undefined);
    // access: an operational viewer (Foreman) may view the ordinary profile photo…
    const foreman = { id: 91, email: "f@t", name: "F", role: "Foreman" };
    assert.equal(perms.canViewPersonnel(foreman), true, "Director AND Foreman may view the ordinary photo (photo route = canViewPersonnel)");
    // …but the SENSITIVE documents route stays Project-Manager+.
    assert.equal(perms.canViewPersonnelDocuments(foreman), false, "Foreman still cannot access sensitive HR documents");
    // the profile renders the photo through the private employee-photo route (not a public URL)
    // the profile renders the photo via the shared EmployeePhoto component…
    const detail = readFileSync(join(process.cwd(), "app/portal/employees/[id]/page.tsx"), "utf8");
    assert.match(detail, /<EmployeePhoto\s+employeeId=\{id\}/, "the profile renders the photo through the EmployeePhoto component");
    // …which sources it from the private, authenticated employee-photo route (not a public URL),
    // and degrades to an initials avatar instead of a broken image when the file cannot load.
    const photoCmp = readFileSync(join(process.cwd(), "components/portal/EmployeePhoto.tsx"), "utf8");
    assert.match(photoCmp, /src=\{`\/portal\/files\/employee-photo\/\$\{employeeId\}`\}/, "the photo is served via the authenticated employee-photo route");
    assert.match(photoCmp, /onError=/, "a failed photo load degrades gracefully rather than showing a broken image");
    // The SSR <img> can fail before hydration attaches onError (that error event is then lost), so
    // the fallback MUST also detect an already-broken image on mount — otherwise it never triggers.
    assert.match(photoCmp, /complete\s*&&[^\n]*naturalWidth\s*===\s*0/, "an image already broken before hydration is detected on mount (naturalWidth===0)");
  } finally { await removeStoredFile(stored.storedPath); }
});
