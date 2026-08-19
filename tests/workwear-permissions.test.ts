// Sprint 15 — Foreman workwear permissions. A Foreman may view + edit operational workwear sizes
// (jacket / trousers / footwear) within personnel visibility scope, WITHOUT gaining any sensitive
// HR access (personal code, DOB, emergency contact, documents). PM+/Director/Admin unchanged.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setupTestDb, type TestDb } from "./helpers/test-db.ts";
// NOTE: lib/permissions imports lib/repositories → lib/db. It MUST be imported dynamically AFTER
// setupTestDb() has pointed PREFAB_DB_PATH at a disposable database, or db.ts would initialise
// against the real pilot DB and these tests would mutate it.
type Perms = typeof import("../lib/permissions.ts");

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const U = (role: string) => ({ id: 1, email: "u@t", name: "U", role });

test("§WW-perm (1,3,4,5): workwear is Foreman+; sensitive HR stays PM+", async () => {
  const perms: Perms = await import("../lib/permissions.ts");
  const foreman = U("Foreman");
  assert.equal(perms.canManageWorkwear(foreman), true, "Foreman can manage workwear");
  assert.equal(perms.canViewPersonnel(foreman), true, "…within personnel visibility scope");
  // Privacy boundary UNCHANGED for a Foreman:
  assert.equal(perms.canViewPersonnelSensitive(foreman), false, "no sensitive HR view");
  assert.equal(perms.canManagePersonnel(foreman), false, "no personnel management");
  assert.equal(perms.canViewPersonnelDocuments(foreman), false, "no private documents");
  // Test 5 — PM/Director/Admin retain workwear AND their existing sensitive access:
  for (const role of ["Project Manager", "Director", "Administrator"]) {
    assert.equal(perms.canManageWorkwear(U(role)), true, `${role} manages workwear`);
    assert.equal(perms.canViewPersonnelSensitive(U(role)), true, `${role} keeps sensitive access`);
    assert.equal(perms.canManagePersonnel(U(role)), true, `${role} keeps personnel management`);
  }
  // Test 4 — a user below Foreman (outside personnel scope) cannot manage workwear:
  assert.equal(perms.canManageWorkwear(U("Employee")), false, "below-Foreman cannot edit workwear");
  assert.equal(perms.canViewPersonnel(U("Employee")), false);
});

let ctx: TestDb; let repo: TestDb["repo"];
let pr: typeof import("../lib/personnel-repo.ts");
const actor = { id: 1, name: "T" };
function makeEmployee(id: string) {
  repo.createEmployee({ id, firstName: "Test", lastName: id, role: "Precast Installer", phone: "", email: "", status: "Active", defaultProjectId: null, employmentStartDate: "", employmentEndDate: "", notes: "" });
}
before(async () => { ctx = await setupTestDb(); repo = ctx.repo; pr = await import("../lib/personnel-repo.ts"); });
after(() => ctx.cleanup());

test("§WW-safe (1,3): workwear sizes live in the SAFE projection; sensitive HR fields do not", () => {
  const id = "emp-ww1"; makeEmployee(id);
  pr.updateEmployeeProfile(id, { dateOfBirth: "1990-01-01", personalCode: "010190-11111", emergencyContact: "Mom", emergencyContactPhone: "123", jacketSize: "L", trousersSize: "52", shoeSize: "44" }, actor);
  const safe = pr.getEmployeeSafe(id)!;
  assert.equal(safe.jacketSize, "L");
  assert.equal(safe.trousersSize, "52");
  assert.equal(safe.shoeSize, "44");
  // The Foreman-visible projection must NOT carry sensitive HR fields.
  assert.equal("personalCode" in safe, false, "personal code absent from safe projection");
  assert.equal("dateOfBirth" in safe, false, "DOB absent from safe projection");
  assert.equal("emergencyContact" in safe, false, "emergency contact absent from safe projection");
});

test("§WW-update (2,3): the workwear-only path updates the 3 sizes and touches NOTHING sensitive", () => {
  const id = "emp-ww2"; makeEmployee(id);
  pr.updateEmployeeProfile(id, { dateOfBirth: "1985-05-05", personalCode: "050585-22222", emergencyContact: "Dad", emergencyContactPhone: "999", jacketSize: "M", trousersSize: "50", shoeSize: "42" }, actor);
  // Foreman edits ONLY the sizes.
  pr.updateEmployeeWorkwear(id, { jacketSize: "XL", trousersSize: "54", shoeSize: "46" }, actor);
  const full = pr.getEmployeeFull(id)!;
  assert.equal(full.jacketSize, "XL"); assert.equal(full.trousersSize, "54"); assert.equal(full.shoeSize, "46");
  // Sensitive HR fields are untouched by the workwear path — the Foreman route can never write them.
  assert.equal(full.personalCode, "050585-22222", "personal code unchanged");
  assert.equal(full.dateOfBirth, "1985-05-05", "DOB unchanged");
  assert.equal(full.emergencyContact, "Dad", "emergency contact unchanged");
  assert.equal(full.emergencyContactPhone, "999", "emergency phone unchanged");
});

test("§WW-ui (6): the Foreman workwear form uses the save-feedback primitive + workwear-only action; no sensitive fields", () => {
  const page = read("app/portal/employees/[id]/page.tsx");
  assert.match(page, /canWorkwear && !canManage/, "a Foreman-only workwear editor exists (PM+ use the full profile form)");
  assert.match(page, /<SaveForm action=\{updateWorkwearFormAction\}/, "uses the SaveForm SAVE→SAVING…→✓ Saved primitive");
  const formBlock = page.split("<SaveForm action={updateWorkwearFormAction}")[1].split("</SaveForm>")[0];
  assert.match(formBlock, /name="jacketSize"[\s\S]*name="trousersSize"[\s\S]*name="shoeSize"/, "the three workwear fields are present");
  assert.doesNotMatch(formBlock, /name="personalCode"|name="dateOfBirth"|name="emergencyContact"/, "the Foreman workwear form exposes NO sensitive fields");
  assert.match(page, /safe\?\.jacketSize/, "workwear display reads the Foreman-visible safe projection");
  const i18n = read("data/portal-i18n.ts");
  assert.match(i18n, /"Edit workwear": "Rediģēt darba apģērbu"/, "LV label");
  assert.match(i18n, /"Edit workwear": "Изменить спецодежду"/, "RU label");
});
