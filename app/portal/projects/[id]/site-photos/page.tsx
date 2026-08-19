import { notFound } from "next/navigation";
import { PortalShell, PortalTopbar } from "../../../../../components/portal/PortalShell";
import { BackLink } from "../../../../../components/portal/BackLink";
import { requireUser } from "../../../../../lib/auth";
import { canAccessProject, canCaptureSitePhotos, canViewDailyLog } from "../../../../../lib/permissions";
import { getProject, listInstallationZones } from "../../../../../lib/repositories";
import { listSitePhotos } from "../../../../../lib/daily-ops-repo";
import { appToday } from "../../../../../lib/datetime";
import { getPortalLanguage } from "../../../../../lib/portal-locale";
import { portalText } from "../../../../../data/portal-i18n";
import { SaveForm } from "../../../../../components/portal/SaveForm";
import { SaveButton } from "../../../../../components/portal/SaveButton";
import { captureSitePhotoAction, togglePhotoIncludeAction, updateSitePhotoFormAction } from "./actions";

const PAGE_SIZE = 20;

export default async function SitePhotosPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ date?: string; zone?: string; status?: string; limit?: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const project = getProject(id);
  if (!project || !canAccessProject(user, id) || !(canCaptureSitePhotos(user, id) || canViewDailyLog(user, id))) notFound();
  const language = await getPortalLanguage(), t = (v: string) => portalText(language, v), today = appToday();
  const canCapture = canCaptureSitePhotos(user, id) && !project.archivedAt;
  const zones = listInstallationZones(id);
  const all = listSitePhotos(id);

  // Filters (all GET params so the page stays a plain server component — no client state).
  const q = await searchParams;
  const fDate = /^\d{4}-\d{2}-\d{2}$/.test(q.date ?? "") ? q.date! : "";
  const fZone = (q.zone ?? "").slice(0, 120);
  const fStatus = q.status === "in" || q.status === "out" ? q.status : "";
  const limit = Math.min(Math.max(Number(q.limit) || PAGE_SIZE, PAGE_SIZE), 1000);
  const areaOptions = [...new Set(all.map((p) => p.area).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const filtered = all.filter((p) => (!fDate || p.photoDate === fDate) && (!fZone || p.area === fZone) && (!fStatus || (fStatus === "in" ? p.includeInDaily : !p.includeInDaily)));
  const shown = filtered.slice(0, limit);
  // Preserve active filters when building the "load more" / clear links.
  const qs = (over: Record<string, string | number>) => {
    const p = new URLSearchParams();
    if (fDate) p.set("date", fDate); if (fZone) p.set("zone", fZone); if (fStatus) p.set("status", fStatus);
    for (const [k, v] of Object.entries(over)) p.set(k, String(v));
    const s = p.toString(); return s ? `?${s}` : "?";
  };
  const hasFilters = Boolean(fDate || fZone || fStatus);

  const zoneField = (defaultArea: string) => zones.length > 0
    ? <><label>{t("Zone / floor")}<select name="installationZoneId" defaultValue=""><option value="">{t("— Select saved zone / floor —")}</option>{zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select></label>
      <label>{t("Other location")}<input name="area" maxLength={120} defaultValue={defaultArea} placeholder={t("Only if not a saved zone")} /></label></>
    : <label className="wide">{t("Zone / floor")}<input name="area" maxLength={120} defaultValue={defaultArea} /></label>;

  return <PortalShell active="/portal/projects">
    <BackLink href={`/portal/projects/${id}`} label={t("Back to project")} />
    <PortalTopbar eyebrow={`${project.name} · ${t("Site photos")}`} title={t("Site photos")} />
    {canCapture && <article className="os-panel os-workspace-full"><div className="os-panel-head"><h2>{t("Capture site photo")}</h2></div>
      <form action={captureSitePhotoAction} className="os-mini-form" encType="multipart/form-data"><input type="hidden" name="projectId" value={id} />
        <label className="wide"><input type="file" name="photo" accept="image/*" capture="environment" required /></label>
        <label>{t("Date")}<input type="date" name="photoDate" defaultValue={today} /></label>
        {zones.length > 0
          ? <><label>{t("Zone / floor")}<select name="installationZoneId" defaultValue=""><option value="">{t("— Select saved zone / floor —")}</option>{zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select></label>
            <label>{t("Other location")}<input name="area" maxLength={120} placeholder={t("Only if not a saved zone")} /></label></>
          : <label className="wide">{t("Zone / floor")}<input name="area" maxLength={120} /><small className="os-help">{t("Tip: create Installation Zones in the Element register to pick them here.")}</small></label>}
        <label className="wide">{t("Caption")}<input name="caption" maxLength={500} /></label>
        <label className="os-report-include"><input type="checkbox" name="includeInDaily" value="1" defaultChecked /> <span>{t("Include in daily report")}</span></label>
        <SaveButton language={language} label={t("Capture site photo")} />
      </form></article>}

    {all.length === 0
      ? <p className="os-empty-state">{t("No site photos yet.")}</p>
      : <>
        {/* Filters — keep the gallery manageable with many photos. */}
        <form method="get" className="os-photo-toolbar">
          <label>{t("Date")}<input type="date" name="date" defaultValue={fDate} /></label>
          <label>{t("Zone / floor")}<select name="zone" defaultValue={fZone}><option value="">{t("All zones")}</option>{areaOptions.map((a) => <option key={a} value={a}>{a}</option>)}</select></label>
          <label>{t("Daily report")}<select name="status" defaultValue={fStatus}><option value="">{t("All statuses")}</option><option value="in">{t("In daily report")}</option><option value="out">{t("Not in report")}</option></select></label>
          <button className="os-secondary-action" type="submit">{t("Apply")}</button>
          {hasFilters && <a className="os-secondary-action" href="?">{t("Clear filters")}</a>}
          <span className="os-photo-count">{shown.length} / {filtered.length}</span>
        </form>

        {filtered.length === 0
          ? <p className="os-empty-state">{t("No photos match these filters.")}</p>
          : <section id="gallery" className="os-photo-gallery">{shown.map((p) => {
            const meta = `${p.photoDate}${p.area ? ` · ${p.area}` : ""}`;
            const statusPill = canCapture
              ? <form action={togglePhotoIncludeAction} className="os-inline-form"><input type="hidden" name="projectId" value={id} /><input type="hidden" name="photoId" value={p.id} /><input type="hidden" name="include" value={p.includeInDaily ? "0" : "1"} /><SaveButton language={language} className={`os-report-toggle ${p.includeInDaily ? "is-on" : "is-off"}`} label={p.includeInDaily ? `✓ ${t("In daily report")}` : t("Not in report")} title={t("Toggle inclusion in the Daily Report")} /></form>
              : <span className={`os-report-toggle ${p.includeInDaily ? "is-on" : "is-off"}`}>{p.includeInDaily ? `✓ ${t("In daily report")}` : t("Not in report")}</span>;
            return <article className="os-photo-card" key={p.id}>
              {/* Thumbnail: uniform box, object-fit cover (crops the preview only — the stored file
                  is untouched). Clicking opens the full-size lightbox (#p{id}). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <a className="os-thumb-link" href={`#p${p.id}`} aria-label={p.caption || meta}><img className="os-thumb" src={`/portal/files/photos/${p.id}`} alt={p.caption || "site photo"} loading="lazy" /></a>
              <div className="os-photo-card-meta">
                <span className="os-photo-when">{meta}</span>
                <span className="os-photo-caption" title={p.caption || ""}>{p.caption || "—"}</span>
                {statusPill}
              </div>
              {/* Full-size lightbox + edit. Same image URL as the thumbnail (loaded once), shown
                  uncropped here (object-fit: contain). Closes to #gallery. */}
              <div className="os-lightbox" id={`p${p.id}`}>
                <a className="os-lightbox-backdrop" href="#gallery" aria-label={t("Close")}></a>
                <div className="os-lightbox-inner">
                  <a className="os-lightbox-x" href="#gallery" aria-label={t("Close")}>×</a>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="os-lightbox-img" src={`/portal/files/photos/${p.id}`} alt={p.caption || "site photo"} />
                  <div className="os-lightbox-body">
                    <p className="os-lightbox-caption">{p.caption || "—"}</p>
                    <p className="os-muted">{meta} · {p.author}</p>
                    {canCapture && <SaveForm action={updateSitePhotoFormAction} language={language} saveLabel={t("Save changes")}><input type="hidden" name="projectId" value={id} /><input type="hidden" name="photoId" value={p.id} />
                      <label>{t("Date")}<input type="date" name="photoDate" defaultValue={p.photoDate} /></label>
                      {zoneField(p.area)}
                      <label className="wide">{t("Caption")}<input name="caption" maxLength={500} defaultValue={p.caption} /></label>
                      <label className="os-report-include"><input type="checkbox" name="includeInDaily" value="1" defaultChecked={Boolean(p.includeInDaily)} /> <span>{t("Include in daily report")}</span></label>
                    </SaveForm>}
                  </div>
                </div>
              </div>
            </article>;
          })}</section>}

        {filtered.length > shown.length && <div className="os-load-more"><a className="os-secondary-action" href={qs({ limit: limit + PAGE_SIZE })}>{t("Load more")} ({filtered.length - shown.length})</a></div>}
      </>}
  </PortalShell>;
}
