import { notFound } from "next/navigation";
import { PortalShell, PortalTopbar, StatusBadge } from "../../../../../components/portal/PortalShell";
import { BackLink } from "../../../../../components/portal/BackLink";
import { requireUser } from "../../../../../lib/auth";
import { canAccessProject, canConfirmDailyLog, canCreateDailyLog, canManageProjectAttendance, canViewDailyLog } from "../../../../../lib/permissions";
import { getProject } from "../../../../../lib/repositories";
import { getDailyLog, listDailyLogAttendance, dailyLogSnapshot } from "../../../../../lib/daily-ops-repo";
import { listProjectAssignedEmployees } from "../../../../../lib/personnel-repo";
import { ATTENDANCE_STATUSES } from "../../../../../lib/daily-ops";
import { appToday } from "../../../../../lib/datetime";
import { getPortalLanguage } from "../../../../../lib/portal-locale";
import { portalText } from "../../../../../data/portal-i18n";
import { SaveForm } from "../../../../../components/portal/SaveForm";
import { SaveButton } from "../../../../../components/portal/SaveButton";
import { confirmDailyLogAction, markAllPresentAction, openDailyLogAction, reopenDailyLogAction, setShiftAction, updateDailyLogFieldsFormAction, upsertAttendanceAction } from "./actions";

export default async function DailyLogPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ date?: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const project = getProject(id);
  if (!project || !canAccessProject(user, id) || !canViewDailyLog(user, id)) notFound();
  const language = await getPortalLanguage(), t = (v: string) => portalText(language, v);
  const q = await searchParams, date = /^\d{4}-\d{2}-\d{2}$/.test(q.date ?? "") ? q.date! : appToday();
  const log = getDailyLog(id, date);
  const canAttend = canManageProjectAttendance(user, id) && !project.archivedAt;
  const canEdit = canCreateDailyLog(user, id) && !project.archivedAt;
  const canConfirm = canConfirmDailyLog(user, id) && !project.archivedAt;
  const hidden = <><input type="hidden" name="projectId" value={id} /><input type="hidden" name="date" value={date} /></>;

  const dateNav = <form method="get" className="os-inline-form"><label>{t("Date")} <input type="date" name="date" defaultValue={date} /></label><button className="os-secondary-action" type="submit">{t("Apply")}</button></form>;

  if (!log) {
    return <PortalShell active="/portal/projects">
      <BackLink href={`/portal/projects/${id}`} label={t("Back to project")} />
      <PortalTopbar eyebrow={`${project.name} · ${t("Daily site log")}`} title={date} />
      {dateNav}
      <article className="os-panel"><p className="os-empty-state">{t("No daily log for this date yet.")}</p>
        {canEdit && <form action={openDailyLogAction}>{hidden}<button className="os-primary-action" type="submit">{t("Open daily log")}</button></form>}
      </article>
    </PortalShell>;
  }

  const snap = dailyLogSnapshot(log);
  const confirmed = log.status === "Confirmed";
  const attendance = listDailyLogAttendance(log.id);
  const entryOf = new Map(attendance.map((a) => [a.employeeId, a]));
  const crew = listProjectAssignedEmployees(id, true);
  const logHidden = <><input type="hidden" name="projectId" value={id} /><input type="hidden" name="date" value={date} /><input type="hidden" name="dailyLogId" value={log.id} /></>;
  const factList = (title: string, items: string[]) => <article className="os-panel"><div className="os-panel-head"><h2>{title}</h2></div>{items.length ? <ul className="os-fact-list">{items.map((s, i) => <li key={i}>{s}</li>)}</ul> : <p className="os-muted">—</p>}</article>;

  return <PortalShell active="/portal/projects">
    <BackLink href={`/portal/projects/${id}`} label={t("Back to project")} />
    <PortalTopbar eyebrow={`${project.name} · ${t("Daily site log")}`} title={date} action={<><StatusBadge status={confirmed ? "Installed" : "Planned"} label={t(log.status)} /><a className="os-secondary-action" href={`/portal/projects/${id}/daily-log/pdf?date=${date}`}>{t("Open Daily Report PDF")}</a></>} />
    {dateNav}
    {confirmed
      ? <p className="os-help">{t("Reopening a confirmed report is a historical modification and is audited.")} {log.confirmedBy && `· ${t("Confirmed by")}: ${log.confirmedBy}`}</p>
      : <p className="os-help">{t("Confirming freezes this report as a historical snapshot.")}</p>}

    {/* Attendance */}
    <article className="os-panel os-workspace-full"><div className="os-panel-head"><div><p>{t("Attendance").toUpperCase()}</p><h2>{t("Workers present")}: {snap.workforce.present} · {t("Man-hours")}: {snap.workforce.manHours}</h2></div></div>
      {!confirmed && canAttend && <div className="os-attendance-controls">
        <form action={setShiftAction} className="os-inline-form">{logHidden}<label>{t("Shift start")} <input type="time" name="shiftStart" defaultValue={log.shiftStart} /></label><label>{t("Shift end")} <input type="time" name="shiftEnd" defaultValue={log.shiftEnd} /></label><SaveButton language={language} className="os-secondary-action" label={t("Save shift")} /></form>
        <form action={markAllPresentAction}>{logHidden}<SaveButton language={language} label={`✓ ${t("Mark all present")}`} /></form>
      </div>}
      <div className="os-table-wrap"><table className="os-table"><thead><tr><th>{t("Name")}</th><th>{t("Present")}</th><th>{t("Worked hours")}</th>{!confirmed && canAttend && <th>{t("Manage")}</th>}</tr></thead>
        <tbody>{(confirmed ? snap.workforce.crew.map((c) => ({ employeeId: c.name, employeeName: c.name, status: c.status, startTime: c.startTime, endTime: c.endTime, workedHours: c.workedHours, comment: "" })) : crew.map((a) => entryOf.get(a.employeeId) ?? { employeeId: a.employeeId, employeeName: "", status: "", startTime: "", endTime: "", workedHours: 0, comment: "" })).map((row, i) => {
          const name = row.employeeName || crew.find((c) => c.employeeId === row.employeeId)?.projectRole || row.employeeId;
          return <tr key={i}><td>{name}</td><td>{row.status ? t(row.status) : "—"}</td><td>{row.status ? row.workedHours : "—"}</td>
            {!confirmed && canAttend && <td><details className="os-inline-editor"><summary>{row.status ? t("Edit") : "+"}</summary>
              <form action={upsertAttendanceAction} className="os-mini-form"><input type="hidden" name="projectId" value={id} /><input type="hidden" name="date" value={date} /><input type="hidden" name="dailyLogId" value={log.id} /><input type="hidden" name="employeeId" value={row.employeeId} />
                <label>{t("Present")}<select name="status" defaultValue={row.status || "Present"}>{ATTENDANCE_STATUSES.map((s) => <option key={s} value={s}>{t(s)}</option>)}</select></label>
                <label>{t("Start time")}<input type="time" name="startTime" defaultValue={row.startTime} /></label>
                <label>{t("End time")}<input type="time" name="endTime" defaultValue={row.endTime} /></label>
                <label className="wide">{t("Comment")}<input name="comment" defaultValue={row.comment} /></label>
                <SaveButton language={language} label={t("Save")} />
              </form></details></td>}
          </tr>;
        })}{!confirmed && !crew.length && <tr><td colSpan={4} className="os-empty">{t("No personnel yet.")}</td></tr>}</tbody></table></div>
    </article>

    {/* Automatically aggregated facts */}
    <p className="os-section-label">{t("Automatically aggregated")}</p>
    <section className="os-workspace-grid">
      {factList(t("Installed elements"), snap.installedElements.map((e) => `${e.code} · ${e.elementType}${e.zone ? ` · ${e.zone}` : ""}`))}
      {factList(t("Deliveries"), snap.deliveries.map((d) => `${t("Load")} ${d.loadNumber} · ${t(d.status)}`))}
      {factList(t("Defects"), snap.defects.map((d) => `#${d.issueNumber} · ${d.title} · ${t(d.status)}`))}
      {factList(t("Tasks"), snap.tasks.map((d) => `#${d.issueNumber} · ${d.title}`))}
      {factList(t("Critical items"), snap.critical.map((d) => `#${d.issueNumber} · ${d.title}`))}
      {factList(t("Safety observations"), snap.safety.map((r) => `${r.employee} · ${t(r.severity)} · ${r.description}`))}
    </section>

    {/* Site photos going into this report. The set comes from the same snapshot the PDF uses —
        live for a draft, and the FROZEN list for a confirmed log — so this preview never makes a
        historical report mutate. Thumbnails resolve live by id via the authenticated photo route
        (exactly as the Daily Report PDF loads them). This is a review surface, not a second photo
        manager: capture/toggle still live on the Site Photos page, linked below. */}
    <article className="os-panel os-workspace-full" id="daily-photos"><div className="os-panel-head"><div><p>{t("Site photos").toUpperCase()}</p><h2>{t("Photos in this report")}: {snap.photos.length}</h2></div><a className="os-secondary-action" href={`/portal/projects/${id}/site-photos`}>{t("Manage site photos")} →</a></div>
      {snap.photos.length === 0
        ? <p className="os-muted">{t("No site photos included for this date.")}</p>
        : <section className="os-photo-grid os-photo-grid-compact">{snap.photos.map((p) => <article key={p.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <a href={`/portal/files/photos/${p.id}`} target="_blank" rel="noreferrer"><img className="os-photo-image" src={`/portal/files/photos/${p.id}`} alt={p.caption || "site photo"} /></a>
            <div><strong>{p.caption || "—"}</strong>{p.area ? <span>{p.area}</span> : null}</div>
          </article>)}</section>}
    </article>

    {/* Manual entry */}
    <p className="os-section-label">{t("Manual entry")}</p>
    <article className="os-panel os-workspace-full">
      {confirmed
        ? <div className="os-doc-list">{[["Work performed", snap.manual.workPerformed], ["Delays / downtime", snap.manual.delays], ["Site events", snap.manual.siteEvents], ["Foreman comments", snap.manual.foremanComment]].filter(([, v]) => v).map(([k, v]) => <div key={k}><span>{t(k)}</span><section><small>{v}</small></section></div>)}</div>
        : canEdit && <SaveForm action={updateDailyLogFieldsFormAction} language={language} saveLabel={t("Save daily log")} className="os-mini-form">{logHidden}
          <label className="wide">{t("Work performed")}<textarea name="workPerformed" rows={3} defaultValue={log.workPerformed} placeholder={t("Describe the work — you can use voice dictation")} /></label>
          <label className="wide">{t("Delays / downtime")}<input name="delays" defaultValue={log.delays} /></label>
          <label className="wide">{t("Delay reason")}<input name="delayReason" defaultValue={log.delayReason} /></label>
          <label className="wide">{t("Site events")}<input name="siteEvents" defaultValue={log.siteEvents} /></label>
          <label className="wide">{t("Temporary equipment")}<input name="equipmentNote" defaultValue={log.equipmentNote} /></label>
          <label className="wide">{t("Materials note")}<input name="materialsNote" defaultValue={log.materialsNote} /></label>
          <label className="wide">{t("Foreman comments")}<textarea name="foremanComment" rows={2} defaultValue={log.foremanComment} /></label>
        </SaveForm>}
    </article>

    {/* Lifecycle. Reopen is a meaningful historical change, so it is a deliberate disclosure — the
        control is clearly visible but must be expanded (a confirmation step) before the audited
        reopen button appears. This keeps it discoverable without making accidental reopening easy. */}
    <article className="os-panel os-workspace-full os-lifecycle-panel">
      {!confirmed
        ? (canConfirm && <form action={confirmDailyLogAction}>{logHidden}<button className="os-primary-action os-primary-action-dark" type="submit">✓ {t("Confirm daily log")}</button></form>)
        : (canConfirm && <details className="os-inline-editor os-reopen-control"><summary>{t("Reopen this confirmed report")}</summary><p className="os-help">{t("Reopening returns this report to draft so it can be edited. This is a historical modification and is recorded in the audit history.")}</p><form action={reopenDailyLogAction}>{logHidden}<button className="os-delete-trigger" type="submit">{t("Reopen to draft")}</button></form></details>)}
    </article>
  </PortalShell>;
}
