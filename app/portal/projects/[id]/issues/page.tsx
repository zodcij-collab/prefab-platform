import Link from "next/link";
import { notFound } from "next/navigation";
import { PortalShell, PortalTopbar, StatusBadge } from "../../../../../components/portal/PortalShell";
import { BackLink } from "../../../../../components/portal/BackLink";
import { MetricCard } from "../../../../../components/portal/MetricCard";
import { requireUser } from "../../../../../lib/auth";
import { canCaptureProjectIssues, canManageProjectIssues, canViewProjectIssues } from "../../../../../lib/permissions";
import { getProject, getUserEmployeeId, listInstallationZones, listProjectMembers } from "../../../../../lib/repositories";
import { listActiveIssues, listIssues, projectIssueStats } from "../../../../../lib/issues-repo";
import { attentionReasons, isOverdue, issueMatchesQuery, ISSUE_PRIORITIES, ISSUE_STATUSES, ISSUE_TYPES, visibleAttentionReasons, type AttentionReason } from "../../../../../lib/issues";
import { appToday } from "../../../../../lib/datetime";
import { getPortalLanguage } from "../../../../../lib/portal-locale";
import { portalText } from "../../../../../data/portal-i18n";

const REASON_LABEL: Record<AttentionReason, string> = { needs_classification: "Needs classification", assigned_to_me: "Assigned to you", due_today: "Due today", overdue: "Overdue", critical_unresolved: "Critical", awaiting_closure: "Awaiting closure" };

export default async function IssuesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; status?: string; type?: string; priority?: string; assignedToId?: string; izone?: string; scope?: string; attention?: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const project = getProject(id);
  if (!project || !canViewProjectIssues(user, id)) notFound();
  const f = await searchParams, language = await getPortalLanguage(), t = (v: string) => portalText(language, v);
  const today = appToday();
  const canManage = canManageProjectIssues(user, id), canCapture = canCaptureProjectIssues(user, id) && !project.archivedAt;
  const employeeId = getUserEmployeeId(user.id);
  const zones = listInstallationZones(id), members = listProjectMembers(id);
  const stats = projectIssueStats(id, today);

  // Requires Attention — derived from authoritative issue state, filtered by role/personal scope.
  const attention = listActiveIssues(id).map((issue) => ({ issue, reasons: visibleAttentionReasons(attentionReasons({ status: issue.status, classified: issue.classified, priority: issue.priority, dueDate: issue.dueDate, assignedToId: issue.assignedToId }, { today, employeeId }), { canManage, canCapture }) })).filter((row) => row.reasons.length);

  // Deep-link scopes from the Project Overview metric (bookmarkable, survive refresh).
  const openOnly = f.scope === "open" || f.attention === "overdue";
  const rows = listIssues(id, { status: f.status, type: f.type, priority: f.priority, assignedToId: f.assignedToId, installationZoneId: f.izone ? Number(f.izone) : undefined, openOnly: openOnly || undefined })
    .filter((issue) => f.attention !== "overdue" || isOverdue(issue.dueDate, issue.status, today))
    .filter((issue) => issueMatchesQuery({ issueNumber: issue.issueNumber, title: issue.title, details: issue.details, type: issue.type, assignedTo: issue.assignedTo }, f.q ?? ""));
  const activeScope = f.attention === "overdue" ? t("Overdue") : f.scope === "open" ? t("Open issues") : f.priority === "Critical" ? t("Critical") : "";

  return <PortalShell active="/portal/projects">
    <BackLink href={`/portal/projects/${id}`} label={t("Back to project")} />
    <PortalTopbar eyebrow={`${project.name} · ${t("Site issues")}`} title={t("Issues & tasks")} action={canCapture ? <Link className="os-primary-action os-primary-action-dark" href={`/portal/projects/${id}/issues/new`}>+ {t("New capture")}</Link> : undefined} />
    {project.archivedAt && <p className="os-archived-banner">{t("This project is archived and read-only.")}</p>}

    <section className="os-metrics-grid os-metrics-compact">
      <MetricCard value={stats.open} label={t("Open issues")} note={t("Not resolved")} />
      <MetricCard value={stats.critical} label={t("Critical")} note={t("Unresolved")} />
      <MetricCard value={stats.overdue} label={t("Overdue")} note={t("Past due date")} />
      <MetricCard value={attention.length} label={t("Requires attention")} note={t("Actionable now")} />
    </section>

    {attention.length > 0 && <section className="os-panel os-attention-panel">
      <div className="os-panel-head"><div><p>{t("Site issues").toUpperCase()}</p><h2>{t("Requires attention")}</h2></div></div>
      <div className="os-attention-list">{attention.slice(0, 12).map(({ issue, reasons }) => (
        <Link className="os-attention-row" key={issue.id} href={`/portal/projects/${id}/issues/${issue.id}`}>
          <span className="os-attention-id">#{issue.issueNumber}</span>
          <span className="os-attention-title">{issue.title || t("Capture")}</span>
          <span className="os-attention-chips">{reasons.map((r) => <span key={r} className={`os-chip os-chip-${r.replace(/_/g, "-")}`}>{t(REASON_LABEL[r])}</span>)}</span>
        </Link>
      ))}</div>
    </section>}

    {activeScope && <p className="os-active-filter">{t("Showing")}: <strong>{activeScope}</strong> · <Link href={`/portal/projects/${id}/issues`}>{t("Clear filter")}</Link></p>}
    <form className="os-filter-grid" method="get">
      <input name="q" defaultValue={f.q} placeholder={t("Search issues…")} aria-label={t("Search issues…")} />
      <select name="status" defaultValue={f.status ?? ""}><option value="">{t("All statuses")}</option>{ISSUE_STATUSES.map((s) => <option key={s} value={s}>{t(s)}</option>)}</select>
      <select name="type" defaultValue={f.type ?? ""}><option value="">{t("All types")}</option>{ISSUE_TYPES.map((s) => <option key={s} value={s}>{t(s)}</option>)}</select>
      <select name="priority" defaultValue={f.priority ?? ""}><option value="">{t("All priorities")}</option>{ISSUE_PRIORITIES.map((s) => <option key={s} value={s}>{t(s)}</option>)}</select>
      <select name="assignedToId" defaultValue={f.assignedToId ?? ""}><option value="">{t("Anyone")}</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
      {zones.length > 0 && <select name="izone" defaultValue={f.izone ?? ""}><option value="">{t("All installation zones")}</option>{zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select>}
      <button className="os-secondary-action" type="submit">{t("Filter")}</button>
    </form>

    <section className="os-issue-list">{rows.map((issue) => {
      const overdue = isOverdue(issue.dueDate, issue.status, today);
      return <Link className="os-issue-card" key={issue.id} href={`/portal/projects/${id}/issues/${issue.id}`}>
        <div className="os-issue-card-head"><strong>#{issue.issueNumber} · {issue.title || t("Capture")}</strong><StatusBadge status={issue.status} label={t(issue.status)} /></div>
        <div className="os-issue-card-meta">
          <span className={`os-prio os-prio-${issue.priority.toLowerCase()}`}>{t(issue.priority)}</span>
          <span>{t(issue.type)}</span>
          {issue.classified !== 1 && <span className="os-chip os-chip-needs-classification">{t("Needs classification")}</span>}
          {issue.installationZoneName && <span>▣ {issue.installationZoneName}</span>}
          {issue.elementCode && <span>◱ {issue.elementCode}</span>}
          {issue.assignedTo && <span>◎ {issue.assignedTo}</span>}
          {issue.dueDate && <span className={overdue ? "os-overdue" : ""}>⏱ {issue.dueDate}</span>}
          {issue.mediaCount > 0 && <span>🖼 {issue.mediaCount}</span>}
        </div>
      </Link>;
    })}</section>
    {rows.length === 0 && <p className="os-empty-state">{t("No issues match these filters.")}</p>}
  </PortalShell>;
}
