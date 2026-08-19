import Link from "next/link";
import { notFound } from "next/navigation";
import { PortalShell, PortalTopbar } from "../../../../../components/portal/PortalShell";
import { BackLink } from "../../../../../components/portal/BackLink";
import { requireUser } from "../../../../../lib/auth";
import { canAccessProject } from "../../../../../lib/permissions";
import { getProject, projectErectionProgress } from "../../../../../lib/repositories";
import { listIssues } from "../../../../../lib/issues-repo";
import { getDailyLog, aggregateDailyLog } from "../../../../../lib/daily-ops-repo";
import { OPEN_STATUSES, isOverdue } from "../../../../../lib/issues";
import { appToday } from "../../../../../lib/datetime";
import { getPortalLanguage } from "../../../../../lib/portal-locale";
import { portalText } from "../../../../../data/portal-i18n";

export default async function TodayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const project = getProject(id);
  if (!project || !canAccessProject(user, id)) notFound();
  const language = await getPortalLanguage(), t = (v: string) => portalText(language, v), today = appToday();
  const log = getDailyLog(id, today);
  const agg = log ? aggregateDailyLog(log) : null;
  const openIssues = listIssues(id, {}).filter((i) => OPEN_STATUSES.includes(i.status as (typeof OPEN_STATUSES)[number]));
  const defects = openIssues.filter((i) => i.type !== "Task").length;
  const tasks = openIssues.filter((i) => i.type === "Task").length;
  const critical = openIssues.filter((i) => i.priority === "Critical").length;
  const overdue = openIssues.filter((i) => isOverdue(i.dueDate, i.status, today)).length;
  const progress = projectErectionProgress(id);
  const reportStatus = log ? t(log.status) : "—";

  const tile = (label: string, value: string | number, href?: string, emphasis?: boolean) => {
    const inner = <><span className="os-today-value">{value}</span><span className="os-today-label">{label}</span></>;
    return href ? <Link className={`os-today-tile${emphasis ? " os-today-emph" : ""}`} href={href}>{inner}</Link> : <div className={`os-today-tile${emphasis ? " os-today-emph" : ""}`}>{inner}</div>;
  };

  return <PortalShell active="/portal/projects">
    <BackLink href={`/portal/projects/${id}`} label={t("Back to project")} />
    <PortalTopbar eyebrow={`${project.name} · ${t("Today")}`} title={today} action={<Link className="os-secondary-action" href={`/portal/projects/${id}/daily-log?date=${today}`}>{t("Daily log")}</Link>} />
    <section className="os-today-grid">
      {tile(t("Workers on site"), agg?.workforce.present ?? 0, `/portal/projects/${id}/daily-log?date=${today}`)}
      {tile(t("Man-hours"), agg?.workforce.manHours ?? 0)}
      {tile(t("Installed elements"), `${progress.installed} / ${progress.total}`, `/portal/projects/${id}/elements`)}
      {tile(t("Open Defects"), defects, `/portal/projects/${id}/issues?scope=open`)}
      {tile(t("Open Tasks"), tasks, `/portal/projects/${id}/issues?scope=open`)}
      {tile(t("Critical"), critical, `/portal/projects/${id}/issues?priority=Critical`, critical > 0)}
      {tile(t("Overdue"), overdue, `/portal/projects/${id}/issues?attention=overdue`, overdue > 0)}
      {tile(t("Safety observations"), agg?.safety.length ?? 0)}
      {tile(t("Report status"), reportStatus, `/portal/projects/${id}/daily-log?date=${today}`)}
    </section>
  </PortalShell>;
}
