import test from "node:test";
import assert from "node:assert/strict";
import {
  ALL_CAPABILITIES,
  NO_CAPABILITIES,
  presetCapabilities,
  resolveProjectCapabilities,
  sanitizeCapabilityMap,
} from "../lib/project-access.ts";

test("global roles get every capability regardless of overrides or membership", () => {
  for (const role of ["Director", "Administrator"]) {
    const resolved = resolveProjectCapabilities({ role, hasOverride: false, hasLegacyAccess: false });
    assert.deepEqual(resolved, ALL_CAPABILITIES);
  }
});

test("a user with neither membership nor override has no capabilities", () => {
  assert.deepEqual(resolveProjectCapabilities({ role: "Project Manager", hasOverride: false, hasLegacyAccess: false }), NO_CAPABILITIES);
  assert.deepEqual(resolveProjectCapabilities({ role: "Foreman", hasOverride: false, hasLegacyAccess: false }), NO_CAPABILITIES);
});

test("base role defaults reproduce prior behaviour for accessible projects", () => {
  const foreman = resolveProjectCapabilities({ role: "Foreman", hasOverride: false, hasLegacyAccess: true });
  assert.equal(foreman["reports.create"], true);
  assert.equal(foreman["reports.approve"], false);
  assert.equal(foreman["elements.operate"], true);
  assert.equal(foreman["elements.manage"], false);
  assert.equal(foreman["timesheets.view"], false);
  const employee = resolveProjectCapabilities({ role: "Employee", hasOverride: false, hasLegacyAccess: true });
  assert.equal(employee["project.view"], true);
  assert.equal(employee["reports.create"], false);
  assert.equal(employee["elements.view"], false);
});

test("an override grants a capability the base role lacks", () => {
  const resolved = resolveProjectCapabilities({ role: "Foreman", hasOverride: true, hasLegacyAccess: true, overrideCapabilities: { "reports.approve": true, "timesheets.view": true } });
  assert.equal(resolved["reports.approve"], true);
  assert.equal(resolved["timesheets.view"], true);
  assert.equal(resolved["reports.create"], true, "unspecified capabilities fall back to base role");
});

test("an override restricts a capability the base role would allow (override precedence)", () => {
  const resolved = resolveProjectCapabilities({ role: "Project Manager", hasOverride: true, hasLegacyAccess: true, overrideCapabilities: { "reports.approve": false, "elements.manage": false } });
  assert.equal(resolved["reports.approve"], false);
  assert.equal(resolved["elements.manage"], false);
  assert.equal(resolved["project.view"], true);
});

test("an override that denies project.view removes all access (explicit revoke)", () => {
  const resolved = resolveProjectCapabilities({ role: "Project Manager", hasOverride: true, hasLegacyAccess: true, overrideCapabilities: { "project.view": false } });
  assert.deepEqual(resolved, NO_CAPABILITIES);
});

test("an override row alone grants access even without legacy membership", () => {
  const resolved = resolveProjectCapabilities({ role: "Foreman", hasOverride: true, hasLegacyAccess: false, overrideCapabilities: { "project.view": true } });
  assert.equal(resolved["project.view"], true);
  assert.equal(resolved["reports.create"], true);
});

test("fix pack — 'Default for role': an EMPTY override row grants membership with role-derived capabilities (never 'no access')", () => {
  // This is how the fixed "Default for role" preset is stored: an override row with an empty
  // capability map. It must grant visibility (membership) while capabilities come from the role.
  const foreman = resolveProjectCapabilities({ role: "Foreman", hasOverride: true, hasLegacyAccess: false, overrideCapabilities: {} });
  assert.equal(foreman["project.view"], true, "the project becomes visible");
  assert.equal(foreman["issues.manage"], true, "Foreman role capabilities apply");
  assert.equal(foreman["reports.approve"], false, "no capability the base role lacks");
  assert.equal(foreman["elements.manage"], false, "not elevated beyond the role");
  // Distinct from an explicit 'none' revoke (all-false map) which removes access.
  const revoked = resolveProjectCapabilities({ role: "Foreman", hasOverride: true, hasLegacyAccess: false, overrideCapabilities: presetCapabilities("none")! });
  assert.deepEqual(revoked, NO_CAPABILITIES, "'none' still means no access");
  // An Employee's empty-override membership inherits only what the Employee role grants.
  const employee = resolveProjectCapabilities({ role: "Employee", hasOverride: true, hasLegacyAccess: false, overrideCapabilities: {} });
  assert.equal(employee["project.view"], true);
  assert.equal(employee["issues.manage"], false, "Employee stays minimal — role-derived");
});

test("presets produce the expected capability maps", () => {
  assert.equal(presetCapabilities("role"), null);
  assert.deepEqual(presetCapabilities("full"), ALL_CAPABILITIES);
  const readonly = presetCapabilities("read-only")!;
  assert.equal(readonly["project.view"], true);
  assert.equal(readonly["reports.view"], true);
  assert.equal(readonly["reports.create"], false);
  assert.equal(readonly["elements.manage"], false);
  const none = presetCapabilities("none")!;
  assert.equal(none["project.view"], false);
});

test("sanitizeCapabilityMap ignores unknown keys and non-boolean values", () => {
  const sanitized = sanitizeCapabilityMap({ "project.view": true, "reports.approve": "yes", bogus: true, "elements.manage": false });
  assert.deepEqual(sanitized, { "project.view": true, "elements.manage": false });
});
