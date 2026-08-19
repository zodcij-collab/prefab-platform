// Platform save-feedback consistency — tests for the reusable primitive (lib/form-state + the
// SaveForm/SaveButton components) and its adoption on the priority surfaces.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runSave, SAVE_IDLE } from "../lib/form-state.ts";
import { portalText } from "../data/portal-i18n.ts";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

test("§SAVE-idle: the initial save state is neither saved nor errored", () => {
  assert.deepEqual(SAVE_IDLE, { error: "", saved: false });
});

test("§SAVE-ok (B): a successful action yields a Saved state", async () => {
  let ran = false;
  const s = await runSave(async () => { ran = true; });
  assert.equal(ran, true);
  assert.deepEqual(s, { error: "", saved: true });
});

test("§SAVE-err (C): a thrown error becomes a recoverable Error state, never a crash", async () => {
  const s = await runSave(() => { throw new Error("Photo not found."); });
  assert.deepEqual(s, { error: "Photo not found.", saved: false });
  const blank = await runSave(() => { throw new Error(""); });
  assert.equal(blank.saved, false);
  assert.equal(blank.error, "Could not save changes", "a message-less failure still reports a save error");
});

test("§SAVE-i18n (J): every feedback string is localized in LV and RU (no English fallback)", () => {
  const rows: [string, string, string][] = [
    ["Save changes", "Saglabāt izmaiņas", "Сохранить изменения"],
    ["Changes saved", "Izmaiņas saglabātas", "Изменения сохранены"],
    ["Could not save changes", "Neizdevās saglabāt izmaiņas", "Не удалось сохранить изменения"],
    ["Unsaved changes", "Nesaglabātas izmaiņas", "Несохранённые изменения"],
  ];
  for (const [k, lv, ru] of rows) {
    assert.equal(portalText("lv", k), lv);
    assert.equal(portalText("ru", k), ru);
    assert.notEqual(portalText("lv", k), k, `${k} must not fall through to English on LV`);
    assert.notEqual(portalText("ru", k), k, `${k} must not fall through to English on RU`);
  }
  // "Saving" pre-existed and must also be non-English on both routes.
  assert.notEqual(portalText("lv", "Saving"), "Saving");
  assert.notEqual(portalText("ru", "Saving"), "Saving");
});

test("§SAVE-primitive (A,E): SaveForm renders pending/saved/error/dirty via the accepted pattern", () => {
  const s = read("components/portal/SaveForm.tsx");
  assert.match(s, /useActionState/, "wraps a state-returning action");
  assert.match(s, /useFormStatus/, "reads pending");
  assert.match(s, /disabled=\{pending\}/, "prevents duplicate submit while saving");
  assert.match(s, /role="status"/, "success/progress announced politely (not colour-only)");
  assert.match(s, /role="alert"/, "errors are announced");
  assert.match(s, /Saving/);
  assert.match(s, /Changes saved/);
  assert.match(s, /Could not save changes/);
  assert.match(s, /Unsaved changes/, "editing after a save shows an unsaved-changes state (E)");
  const b = read("components/portal/SaveButton.tsx");
  assert.match(b, /useFormStatus/);
  assert.match(b, /disabled=\{pending\}/, "auto-save/toggle buttons disable + show progress while saving");
});

test("§SAVE-surfaces (F,G,H,I): the priority surfaces adopt the primitive", () => {
  const photos = read("app/portal/projects/[id]/site-photos/page.tsx");
  assert.match(photos, /<SaveForm[\s\S]{0,400}updateSitePhotoFormAction/, "F: Site Photos edit uses SaveForm");
  assert.match(photos, /<SaveButton/, "I: capture + auto-save inclusion toggle show progress");
  assert.match(read("app/portal/projects/[id]/daily-log/page.tsx"), /<SaveForm[\s\S]{0,400}updateDailyLogFieldsFormAction/, "G: Daily Log manual save uses SaveForm");
  assert.match(read("app/portal/projects/[id]/page.tsx"), /saveDeliveryFormAction/, "Material Delivery uses SaveForm");
  assert.match(read("app/portal/employees/[id]/page.tsx"), /updateEmployeeProfileFormAction/, "H: Employee profile uses SaveForm");
});

test("§SAVE-nonregress: state-returning wrappers do not redirect (would break in-place feedback)", () => {
  // The Daily Log manual wrapper must revalidate in place, not call the redirecting back() — a
  // redirect thrown inside runSave would be swallowed as a false error and never navigate.
  const dl = read("app/portal/projects/[id]/daily-log/actions.ts");
  const body = (dl.split("export async function updateDailyLogFieldsFormAction")[1] ?? "").split("\nexport async function")[0];
  assert.ok(body, "the form-state wrapper exists");
  assert.match(body, /revalidatePath/, "wrapper revalidates in place");
  assert.doesNotMatch(body, /\bredirect\(/, "wrapper does not redirect");
  assert.doesNotMatch(body, /\bback\(/, "wrapper does not call the redirecting back() helper");
});
