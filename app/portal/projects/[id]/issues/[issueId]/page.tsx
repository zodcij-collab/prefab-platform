import { notFound } from "next/navigation";
import { PortalShell, PortalTopbar, StatusBadge } from "../../../../../../components/portal/PortalShell";
import { BackLink } from "../../../../../../components/portal/BackLink";
import { requireUser } from "../../../../../../lib/auth";
import { canCommentProjectIssues, canCaptureProjectIssues, canManageProjectIssues, canViewProjectIssues } from "../../../../../../lib/permissions";
import { getProject, listInstallationZones, listProjectElements, listProjectMembers } from "../../../../../../lib/repositories";
import { getIssue, listIssueEvents, listIssueMedia } from "../../../../../../lib/issues-repo";
import { canTransition, isOverdue } from "../../../../../../lib/issues";
import { IssueClassifyForm } from "../../../../../../components/portal/IssueClassifyForm";
import { appToday, formatAppDateTime } from "../../../../../../lib/datetime";
import { getPortalLanguage } from "../../../../../../lib/portal-locale";
import { portalText } from "../../../../../../data/portal-i18n";
import { addIssueMediaAction, assignIssueAction, cancelIssueAction, closeIssueAction, commentIssueAction, resolveIssueAction, statusIssueAction } from "../actions";
import { clearIssueMarkerAction } from "../../drawings/actions";

const EVENT_LABEL: Record<string, string> = { created: "Captured", classified: "Classified", assigned: "Assignment changed", status: "Status changed", priority: "Priority changed", due: "Due date changed", media: "Media added", marker: "Marker added", marker_changed: "Marker moved", marker_removed: "Marker removed", comment: "Comment", resolved: "Resolved", closed: "Closed", cancelled: "Cancelled" };

export default async function IssueDetailPage({ params }: { params: Promise<{ id: string; issueId: string }> }) {
  const { id, issueId } = await params;
  const user = await requireUser();
  const project = getProject(id);
  if (!project || !canViewProjectIssues(user, id)) notFound();
  const issue = getIssue(Number(issueId));
  if (!issue || issue.projectId !== id) notFound();
  const language = await getPortalLanguage(), t = (v: string) => portalText(language, v);
  const canManage = canManageProjectIssues(user, id) && !project.archivedAt;
  const canCapture = canCaptureProjectIssues(user, id) && !project.archivedAt;
  const canComment = canCommentProjectIssues(user, id) && !project.archivedAt;
  const media = listIssueMedia(issue.id), events = listIssueEvents(issue.id);
  const zones = listInstallationZones(id), members = listProjectMembers(id);
  const elements = canManage ? listProjectElements(id, { available: true }) : [];
  const today = appToday(), overdue = isOverdue(issue.dueDate, issue.status, today);
  const terminal = issue.status === "Closed" || issue.status === "Cancelled";
  const nextStatuses = ["Open", "Assigned", "In progress"].filter((s) => canTransition(issue.status, s));
  const evidence = media.filter((m) => m.role !== "resolution" && m.role !== "drawing-location"), resolutionMedia = media.filter((m) => m.role === "resolution");
  const mediaTag = (m: typeof media[number]) => m.kind === "video"
    ? <video key={m.id} className="os-issue-media" controls preload="metadata" src={`/portal/files/issue-media/${m.id}`} />
    : m.kind === "document"
    ? <a key={m.id} className="os-issue-doc" href={`/portal/files/issue-media/${m.id}`} target="_blank" rel="noreferrer"><span className="os-issue-doc-icon" aria-hidden="true">📄</span><span className="os-issue-doc-name">{m.originalFilename}</span></a>
    : <a key={m.id} href={`/portal/files/issue-media/${m.id}`} target="_blank" rel="noreferrer">
        {/* Private, auth-gated media served with no-store; next/image optimization does not apply. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="os-issue-media" src={`/portal/files/issue-media/${m.id}`} alt={m.caption || m.originalFilename} />
      </a>;

  return <PortalShell active="/portal/projects">
    <BackLink href={`/portal/projects/${id}/issues`} label={t("Back to issues")} />
    <PortalTopbar eyebrow={`${project.name} · ${t("Issue")} #${issue.issueNumber}`} title={issue.title || t("Capture")} action={<><span className="os-issue-doc-actions"><a className="os-secondary-action" href={`/portal/projects/${id}/issues/${issue.id}/pdf`}>{t("PDF")}</a><a className="os-secondary-action" href={`/portal/projects/${id}/issues/${issue.id}/pdf?inline=1`} target="_blank" rel="noreferrer">{t("Print")}</a></span><StatusBadge status={issue.status} label={t(issue.status)} /></>} />
    {issue.classified !== 1 && <p className="os-attention-banner">{t("This capture needs classification.")}</p>}

    <section className="os-workspace-grid">
      <article className="os-panel os-workspace-full">
        <div className="os-panel-head"><div><p>{t("Site issues").toUpperCase()}</p><h2>{t("Details")}</h2></div><span className={`os-prio os-prio-${issue.priority.toLowerCase()}`}>{t(issue.priority)}</span></div>
        <div className="os-issue-summary">
          <div><span>{t("Type")}</span><strong>{t(issue.type)}</strong></div>
          <div><span>{t("Installation zone")}</span><strong>{issue.installationZoneName || "—"}</strong></div>
          <div><span>{t("Element")}</span><strong>{issue.elementCode || "—"}</strong></div>
          <div><span>{t("Responsible")}</span><strong>{issue.assignedTo || t("Unassigned")}</strong></div>
          <div><span>{t("Due date")}</span><strong className={overdue ? "os-overdue" : ""}>{issue.dueDate || "—"}{overdue ? ` · ${t("Overdue")}` : ""}</strong></div>
          <div><span>{t("Captured by")}</span><strong>{issue.createdBy} · {formatAppDateTime(issue.createdAt)}</strong></div>
          {issue.documentId && <div><span>{t("Drawing")}</span><strong>{issue.documentTitle || `#${issue.documentId}`} · {t("Page")} {issue.drawingPage}</strong></div>}
        </div>
        {issue.documentId
          ? <div className="os-drawing-actions">
              <a className="os-secondary-action" href={`/portal/projects/${id}/drawings/${issue.documentId}?page=${issue.drawingPage}&issue=${issue.id}`}>📐 {t("Show on drawing")}</a>
              {canManage && <><a className="os-secondary-action" href={`/portal/projects/${id}/drawings/${issue.documentId}?page=${issue.drawingPage}&setIssue=${issue.id}`}>{t("Move on drawing")}</a><form action={clearIssueMarkerAction} className="os-inline-form"><input type="hidden" name="projectId" value={id} /><input type="hidden" name="issueId" value={issue.id} /><button className="os-delete-trigger" type="submit">{t("Remove location")}</button></form></>}
            </div>
          : canManage && !terminal && <div className="os-drawing-actions"><a className="os-secondary-action" href={`/portal/projects/${id}/drawings?setIssue=${issue.id}`}>📐 {t("Set location on drawing")}</a></div>}
        {issue.details && <p className="os-issue-details">{issue.details}</p>}
        {evidence.length > 0 && <div className="os-issue-media-grid">{evidence.map(mediaTag)}</div>}
      </article>

      {(issue.status === "Resolved" || issue.status === "Closed") && <article className="os-panel os-workspace-full">
        <div className="os-panel-head"><div><p>{t("Resolution").toUpperCase()}</p><h2>{t("Resolution")}</h2></div></div>
        <p className="os-issue-details">{issue.resolution || "—"}</p>
        <p className="os-form-hint">{issue.resolvedBy ? `${t("Resolved by")} ${issue.resolvedBy}` : ""}{issue.closedBy ? ` · ${t("Closed by")} ${issue.closedBy}` : ""}</p>
        {resolutionMedia.length > 0 && <div className="os-issue-media-grid">{resolutionMedia.map(mediaTag)}</div>}
      </article>}

      {issue.status === "Cancelled" && <article className="os-panel os-workspace-full"><div className="os-panel-head"><h2>{t("Cancelled")}</h2></div><p className="os-issue-details">{issue.cancelReason}</p></article>}

      {canManage && !terminal && <article className="os-panel os-workspace-full">
        <div className="os-panel-head"><div><p>{t("Manage").toUpperCase()}</p><h2>{issue.classified !== 1 ? t("Classify") : t("Update classification")}</h2></div></div>
        <IssueClassifyForm projectId={id} issueId={issue.id} language={language} isClassified={issue.classified === 1}
          issue={{ type: issue.type, title: issue.title, details: issue.details, priority: issue.priority, installationZoneId: issue.installationZoneId, elementId: issue.elementId, dueDate: issue.dueDate }}
          zones={zones.map((z) => ({ id: z.id, name: z.name }))}
          elements={elements.map((e) => ({ id: e.id, code: e.code, elementType: e.elementType, floor: e.floor, installationZoneId: e.installationZoneId }))} />
      </article>}

      {canManage && !terminal && <article className="os-panel os-workspace-full">
        <div className="os-panel-head"><div><p>{t("Manage").toUpperCase()}</p><h2>{t("Assign & status")}</h2></div></div>
        <form action={assignIssueAction} className="os-compact-form">
          <input type="hidden" name="projectId" value={id} /><input type="hidden" name="issueId" value={issue.id} />
          <select name="assignedToId" defaultValue={issue.assignedToId ?? ""}><option value="">{t("Unassigned")}</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          <button className="os-secondary-action" type="submit">{t("Assign")}</button>
        </form>
        <div className="os-issue-status-actions">
          {nextStatuses.map((s) => <form key={s} action={statusIssueAction} className="os-inline-form"><input type="hidden" name="projectId" value={id} /><input type="hidden" name="issueId" value={issue.id} /><input type="hidden" name="status" value={s} /><button className="os-secondary-action" type="submit">→ {t(s)}</button></form>)}
        </div>
        {canTransition(issue.status, "Resolved") && <details className="os-inline-editor"><summary>{t("Resolve issue")}</summary>
          <form action={resolveIssueAction} className="os-mini-form"><input type="hidden" name="projectId" value={id} /><input type="hidden" name="issueId" value={issue.id} />
            <label className="wide">{t("Resolution description")}<textarea name="resolution" rows={3} maxLength={8000} required placeholder={t("Describe how it was resolved — you can use voice dictation")} /></label>
            <label className="wide">{t("Resolution photos / video (optional)")}<input type="file" name="media" accept="image/*,video/*,application/pdf" multiple /></label>
            <button className="os-primary-action" type="submit">{t("Mark resolved")}</button>
          </form></details>}
        {canTransition(issue.status, "Closed") && <form action={closeIssueAction} className="os-inline-form"><input type="hidden" name="projectId" value={id} /><input type="hidden" name="issueId" value={issue.id} /><button className="os-primary-action" type="submit">{t("Close issue")}</button></form>}
        <details className="os-inline-editor"><summary>{t("Cancel issue")}</summary>
          <form action={cancelIssueAction} className="os-mini-form"><input type="hidden" name="projectId" value={id} /><input type="hidden" name="issueId" value={issue.id} />
            <label className="wide">{t("Cancellation reason")}<input name="reason" maxLength={2000} required /></label>
            <button className="os-delete-trigger" type="submit">{t("Cancel issue")}</button>
          </form></details>
      </article>}

      {canCapture && !terminal && <article className="os-panel os-workspace-full">
        <div className="os-panel-head"><h2>{t("Add media")}</h2></div>
        <form action={addIssueMediaAction} className="os-mini-form"><input type="hidden" name="projectId" value={id} /><input type="hidden" name="issueId" value={issue.id} /><input type="hidden" name="role" value="evidence" />
          <label className="wide"><input type="file" name="media" accept="image/*,video/*,application/pdf" multiple required /></label>
          <button className="os-secondary-action" type="submit">{t("Upload media")}</button>
        </form>
      </article>}

      <article className="os-panel os-workspace-full" id="activity">
        <div className="os-panel-head"><div><p>{t("History").toUpperCase()}</p><h2>{t("Activity")}</h2></div><span className="os-muted">{events.length} {t("events")}</span></div>
        {canComment && <form action={commentIssueAction} className="os-compact-form"><input type="hidden" name="projectId" value={id} /><input type="hidden" name="issueId" value={issue.id} /><input name="comment" maxLength={4000} placeholder={t("Add a comment…")} required /><button className="os-secondary-action" type="submit">{t("Comment")}</button></form>}
        <div className="os-event-feed">{[...events].reverse().map((event) => <div className="os-event-row" key={event.id}><time>{formatAppDateTime(event.createdAt)}</time><span className="os-event-type">{t(EVENT_LABEL[event.kind] ?? event.kind)}</span><section>{event.detail && <p>{event.kind === "comment" ? event.detail : t(event.detail)}</p>}<small>{event.actor}</small></section></div>)}</div>
      </article>
    </section>
  </PortalShell>;
}
