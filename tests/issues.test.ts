import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { attentionReasons, canTransition, isOverdue, issueMatchesQuery, isValidType, mergePendingFiles, needsClassification, nextIssueNumber, removePendingFile, visibleAttentionReasons, ALL_ISSUE_TYPES, ISSUE_CAPTURE_MAX_FILES, ISSUE_STATUSES, ISSUE_TYPES } from "../lib/issues.ts";
import { issueMediaKind, storeUpload, validateUpload } from "../lib/storage.ts";
import { portalText } from "../data/portal-i18n.ts";

test("§1A: a PDF is an accepted issue attachment type and maps to the 'document' kind", () => {
  assert.equal(validateUpload(new File([new Uint8Array([1, 2, 3])], "drawing.pdf", { type: "application/pdf" }), "issues"), ".pdf");
  assert.equal(issueMediaKind(".pdf"), "document");
  assert.equal(issueMediaKind(".jpg"), "image");
  assert.equal(issueMediaKind(".mp4"), "video");
  assert.throws(() => validateUpload(new File([new Uint8Array([1])], "x.exe", { type: "application/x-msdownload" }), "issues"), /Unsupported/);
});

test("§1A: a fake (non-%PDF) file with a .pdf extension is rejected by the magic-byte check", async () => {
  const fake = new File([new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04])], "fake.pdf", { type: "application/pdf" });
  await assert.rejects(() => storeUpload(fake, "issues"), /does not match its declared type/);
});

test("§2G/H: sibling issue actions never redirect (navigation would wipe unsaved classify state)", () => {
  const src = readFileSync(join(process.cwd(), "app/portal/projects/[id]/issues/actions.ts"), "utf8");
  // Only the create flow (captureIssueAction) navigates; every in-page mutation revalidates in place.
  assert.equal((src.match(/redirect\(/g) ?? []).length, 1, "exactly one redirect() — the quick-capture create flow");
});

test("§3I: user-facing types offer Task + Defect (not the redundant 'Issue'); 'Issue' stays valid internally", () => {
  assert.ok(ISSUE_TYPES.includes("Task") && ISSUE_TYPES.includes("Defect"));
  assert.equal((ISSUE_TYPES as readonly string[]).includes("Issue"), false, "'Issue' is not an offered type");
  assert.ok((ALL_ISSUE_TYPES as readonly string[]).includes("Issue"), "'Issue' remains valid for legacy data");
  assert.equal(isValidType("Issue"), true);
  assert.equal(isValidType("Task"), true);
});

test("§4J/K/L: Sprint 13 terminology is localized — no raw English in LV/RU, correct Defect/Task wording", () => {
  // J: LV quick-capture / module labels are translated (not English "Site Capture").
  assert.equal(portalText("lv", "New capture"), "Jauna fiksācija");
  assert.equal(portalText("lv", "Issues & tasks"), "Defekti un uzdevumi");
  assert.notEqual(portalText("lv", "Site issues"), "Site issues");
  // K: RU assignment control is translated (the reported raw "Assign").
  assert.equal(portalText("ru", "Assign"), "Назначить");
  assert.equal(portalText("ru", "Issues & tasks"), "Дефекты и задачи");
  // EN uses the accepted capitalization.
  assert.equal(portalText("en", "Issues & tasks"), "Issues & Tasks");
  // L: required normal-path keys have LV + RU (never fall back to the English key).
  for (const key of ["Issue", "Task", "Defect", "New capture", "Capture", "Assign", "Responsible", "Due date", "Priority", "Manage", "Resolve issue", "Add media", "Requires attention", "Needs classification", "PDF attachment"]) {
    assert.notEqual(portalText("lv", key), key, `LV missing: ${key}`);
    assert.notEqual(portalText("ru", key), key, `RU missing: ${key}`);
  }
});

// A minimal File-like shape for the pure pending-media selection helpers.
const pf = (name: string, size = 100, lastModified = 1) => ({ name, size, lastModified });

test("A/C: a pending file can be removed while the others are preserved", () => {
  const list = [pf("a.jpg"), pf("b.jpg"), pf("c.mp4")];
  const after = removePendingFile(list, 1);
  assert.deepEqual(after.map((f) => f.name), ["a.jpg", "c.mp4"]);
});
test("B: the removed pending file is absent from the resulting selection (nothing to submit)", () => {
  const list = [pf("wrong.jpg"), pf("right.jpg")];
  assert.equal(removePendingFile(list, 0).some((f) => f.name === "wrong.jpg"), false);
});
test("D: a replacement/additional file can be added after removal (merge, dedupe)", () => {
  let list = mergePendingFiles([], [pf("a.jpg"), pf("b.jpg")]);
  list = removePendingFile(list, 0); // remove a.jpg
  list = mergePendingFiles(list, [pf("c.jpg")]); // add another
  assert.deepEqual(list.map((f) => f.name), ["b.jpg", "c.jpg"]);
  // Selecting the same file twice does not duplicate it.
  assert.deepEqual(mergePendingFiles(list, [pf("c.jpg")]).map((f) => f.name), ["b.jpg", "c.jpg"]);
});
test("E: the maximum-files rule is preserved when merging", () => {
  const many = Array.from({ length: 8 }, (_, i) => pf(`f${i}.jpg`));
  assert.equal(mergePendingFiles([], many).length, ISSUE_CAPTURE_MAX_FILES);
});

test("A: issue forms with a function server action specify no encType/method (invalid-config guard)", () => {
  for (const rel of ["app/portal/projects/[id]/issues/[issueId]/page.tsx", "components/portal/IssueCaptureForm.tsx", "components/portal/IssueClassifyForm.tsx"]) {
    const src = readFileSync(join(process.cwd(), rel), "utf8");
    assert.equal(/encType/.test(src), false, `${rel} must not set encType on a server-action form`);
    assert.equal(/method=["']post["']/i.test(src), false, `${rel} must not set method on a server-action form`);
  }
});

test("B/C/D/E: overdue derivation across past / today / future / terminal", () => {
  const today = "2026-08-14";
  assert.equal(isOverdue("2026-08-12", "Open", today), true, "past due → overdue");
  assert.equal(isOverdue(today, "Open", today), false, "today → not overdue");
  assert.equal(isOverdue("2026-09-01", "Open", today), false, "future → not overdue");
  assert.equal(isOverdue("2026-08-12", "Closed", today), false, "terminal → not overdue");
  assert.equal(isOverdue("2026-08-12", "Cancelled", today), false);
  const dueToday = attentionReasons({ status: "Open", classified: 1, priority: "Normal", dueDate: today, assignedToId: null }, { today, employeeId: null });
  assert.ok(dueToday.includes("due_today") && !dueToday.includes("overdue"), "today is due-today, not overdue");
});

test("lifecycle: captured flows toward resolution; terminal states are dead ends", () => {
  assert.ok(canTransition("Captured", "Open"));
  assert.ok(canTransition("Open", "In progress"));
  assert.ok(canTransition("In progress", "Resolved"));
  assert.ok(canTransition("Resolved", "Closed"));
  assert.ok(canTransition("Resolved", "In progress"), "a resolved issue can be reopened");
  assert.equal(canTransition("Closed", "Open"), false, "closed is terminal");
  assert.equal(canTransition("Cancelled", "Open"), false, "cancelled is terminal");
  assert.equal(canTransition("Captured", "Closed"), false, "cannot skip straight to closed");
  assert.ok(ISSUE_STATUSES.includes("Captured") && ISSUE_TYPES.includes("Defect"));
});

test("overdue is derived from due date + status, never stored", () => {
  assert.equal(isOverdue("2026-08-01", "Open", "2026-08-13"), true);
  assert.equal(isOverdue("2026-08-20", "Open", "2026-08-13"), false, "future due date is not overdue");
  assert.equal(isOverdue("2026-08-01", "Resolved", "2026-08-13"), false, "resolved work is not overdue");
  assert.equal(isOverdue("2026-08-01", "Closed", "2026-08-13"), false);
  assert.equal(isOverdue("", "Open", "2026-08-13"), false, "no due date → never overdue");
});

test("N/O/P/Q/R: attention reasons are derived from authoritative state; terminal issues yield none", () => {
  const base = { status: "Open", classified: 1, priority: "Normal", dueDate: "", assignedToId: null as string | null };
  const ctx = { today: "2026-08-13", employeeId: "emp-1" };
  // P: unclassified capture
  assert.deepEqual(attentionReasons({ ...base, status: "Captured", classified: 0 }, ctx), ["needs_classification"]);
  // assigned to me
  assert.deepEqual(attentionReasons({ ...base, assignedToId: "emp-1" }, ctx), ["assigned_to_me"]);
  // N: due today
  assert.ok(attentionReasons({ ...base, dueDate: "2026-08-13" }, ctx).includes("due_today"));
  // O: overdue
  assert.ok(attentionReasons({ ...base, dueDate: "2026-08-01" }, ctx).includes("overdue"));
  // Q: critical unresolved
  assert.ok(attentionReasons({ ...base, priority: "Critical" }, ctx).includes("critical_unresolved"));
  // awaiting closure
  assert.deepEqual(attentionReasons({ ...base, status: "Resolved" }, ctx), ["awaiting_closure"]);
  // R: closed/cancelled produce nothing actionable
  assert.deepEqual(attentionReasons({ ...base, status: "Closed", priority: "Critical", dueDate: "2026-08-01" }, ctx), []);
  assert.deepEqual(attentionReasons({ ...base, status: "Cancelled" }, ctx), []);
});

test("S: attention visibility respects role — managers see project-wide, others see personal only", () => {
  const reasons = ["needs_classification", "overdue", "critical_unresolved", "assigned_to_me"] as const;
  assert.deepEqual(visibleAttentionReasons([...reasons], { canManage: true, canCapture: true }), [...reasons], "manager sees all");
  assert.deepEqual(visibleAttentionReasons([...reasons], { canManage: false, canCapture: true }), ["needs_classification", "assigned_to_me"]);
  assert.deepEqual(visibleAttentionReasons([...reasons], { canManage: false, canCapture: false }), ["assigned_to_me"], "no capture right hides unclassified");
});

test("needsClassification: a quick capture or unclassified record needs classification", () => {
  assert.equal(needsClassification({ status: "Captured", classified: 0 }), true);
  assert.equal(needsClassification({ status: "Open", classified: 0 }), true);
  assert.equal(needsClassification({ status: "Open", classified: 1 }), false);
});

test("numbering is monotonic and never backfills", () => {
  assert.equal(nextIssueNumber([]), 1);
  assert.equal(nextIssueNumber([1, 2, 3]), 4);
  assert.equal(nextIssueNumber([1, 5]), 6);
});

test("issue list query matches number (#12 / 12), title, type and assignee", () => {
  const issue = { issueNumber: 12, title: "Cracked panel", details: "north wall", type: "Defect", assignedTo: "Anna" };
  assert.ok(issueMatchesQuery(issue, "#12"));
  assert.ok(issueMatchesQuery(issue, "12"));
  assert.ok(issueMatchesQuery(issue, "crack"));
  assert.ok(issueMatchesQuery(issue, "defect"));
  assert.ok(issueMatchesQuery(issue, "anna"));
  assert.ok(issueMatchesQuery(issue, ""), "empty query matches all");
  assert.equal(issueMatchesQuery(issue, "beam"), false);
});
