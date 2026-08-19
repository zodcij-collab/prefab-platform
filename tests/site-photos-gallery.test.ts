// Site Photos gallery UX — regression coverage for the new photo edit ("Save changes"), the
// project-scoped update, inclusion flowing into the Daily Log, and the gallery/lightbox/filters UI.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setupTestDb, type TestDb } from "./helpers/test-db.ts";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

let ctx: TestDb; let repo: TestDb["repo"];
let dops: typeof import("../lib/daily-ops-repo.ts");
const actor = { id: 0, name: "T" };
let seq = 0;
function project(id: string) {
  repo.createProject({ id, name: id, location: "Rīga", client: "C", status: "Active", manager: "PM", managerEmployeeId: null, startDate: "", targetDate: "", description: "", latitude: null, longitude: null });
}
function addPhoto(projectId: string, opts: { date?: string; area?: string; caption?: string; include?: boolean } = {}): number {
  return dops.addSitePhoto({ projectId, photoDate: opts.date ?? "2026-08-18", area: opts.area ?? "", caption: opts.caption ?? "", author: "T", originalFilename: "p.jpg", storedPath: `photos/p${seq++}.jpg`, fileSize: 1, mimeType: "image/jpeg", includeInDaily: opts.include ?? true, issueId: null, installationZoneId: null, uploadedById: actor.id }, actor);
}
before(async () => {
  ctx = await setupTestDb(); repo = ctx.repo; dops = await import("../lib/daily-ops-repo.ts");
  actor.id = Number(repo.createUserAccess({ name: "T", email: "gal@test", role: "Director", active: 1, passwordHash: "s:h" }).lastInsertRowid);
});
after(() => ctx.cleanup());

test("§GAL-edit: Save changes persists caption/date/zone/inclusion and is project-scoped", () => {
  project("gal-a"); project("gal-b");
  const pid = addPhoto("gal-a", { caption: "old", area: "X", include: true });
  const ok = dops.updateSitePhoto(pid, "gal-a", { photoDate: "2026-08-20", area: "Level 3 · Grid B", caption: "new caption", includeInDaily: false, installationZoneId: null }, actor);
  assert.equal(ok, true);
  const p = dops.listSitePhotos("gal-a").find((x) => x.id === pid)!;
  assert.equal(p.caption, "new caption");
  assert.equal(p.area, "Level 3 · Grid B");
  assert.equal(p.photoDate, "2026-08-20");
  assert.equal(p.includeInDaily, 0, "inclusion can be turned off via Save changes");
  // project scoping: editing through the wrong project id must fail and change nothing.
  const bad = dops.updateSitePhoto(pid, "gal-b", { photoDate: "2020-01-01", area: "HACK", caption: "HACK", includeInDaily: true, installationZoneId: null }, actor);
  assert.equal(bad, false);
  assert.equal(dops.listSitePhotos("gal-a").find((x) => x.id === pid)!.caption, "new caption", "cross-project edit changed nothing");
});

test("§GAL-include: an edited inclusion flows into the Daily Log snapshot", () => {
  project("gal-inc");
  const day = "2026-08-18";
  const pid = addPhoto("gal-inc", { date: day, include: false });
  let snap = dops.dailyLogSnapshot(dops.getOrCreateDailyLog("gal-inc", day, actor));
  assert.equal(snap.photos.length, 0, "an excluded photo is not in the report");
  dops.updateSitePhoto(pid, "gal-inc", { photoDate: day, area: "", caption: "", includeInDaily: true, installationZoneId: null }, actor);
  snap = dops.dailyLogSnapshot(dops.getDailyLog("gal-inc", day)!);
  assert.deepEqual(snap.photos.map((x) => x.id), [pid], "after Save changes it is included");
});

test("§GAL-image: editing metadata never touches the stored image file", () => {
  project("gal-img");
  const pid = addPhoto("gal-img", { caption: "c" });
  const before = dops.listSitePhotos("gal-img").find((x) => x.id === pid)!.storedPath;
  dops.updateSitePhoto(pid, "gal-img", { photoDate: "2026-08-19", area: "Z", caption: "edited", includeInDaily: true, installationZoneId: null }, actor);
  const after = dops.listSitePhotos("gal-img").find((x) => x.id === pid)!.storedPath;
  assert.equal(after, before, "the stored source file reference is unchanged — only metadata is edited");
});

test("§GAL-ui: gallery grid, lightbox, filters and Save changes are wired; thumbnails crop only the preview", () => {
  const page = read("app/portal/projects/[id]/site-photos/page.tsx");
  assert.match(page, /os-photo-gallery/, "responsive gallery grid");
  assert.match(page, /os-photo-toolbar/, "filter toolbar");
  assert.match(page, /name="date"[\s\S]*name="zone"[\s\S]*name="status"/, "filters by date, zone/floor and Daily Report status");
  assert.match(page, /href=\{`#p\$\{p\.id\}`\}/, "clicking a thumbnail opens its lightbox");
  assert.match(page, /os-lightbox-img/, "the lightbox shows the full-size image");
  assert.match(page, /updateSitePhotoFormAction/, "the lightbox edit form saves changes (via the SaveForm feedback primitive)");
  assert.match(page, /t\("Save changes"\)/, "explicit Save changes button");
  assert.match(page, /t\("Load more"\)/, "pagination / load more");
  const css = read("app/globals.css");
  assert.match(css, /\.os-thumb\{[^}]*object-fit:cover/, "thumbnails use object-fit: cover (uniform box, no distortion)");
  assert.match(css, /\.os-thumb\{[^}]*aspect-ratio:4\/3/, "thumbnails share one fixed aspect ratio");
  assert.match(css, /\.os-lightbox-img\{[^}]*object-fit:contain/, "the lightbox shows the uncropped original");
  assert.match(css, /\.os-lightbox:target\{display:flex\}/, "the :target lightbox opens on thumbnail click");
  assert.match(css, /\.os-photo-caption\{[^}]*text-overflow:ellipsis/, "long captions truncate in the gallery");
  assert.match(css, /repeat\(auto-fill,minmax\(200px,1fr\)\)/, "responsive ~4–5 per row grid");
});
