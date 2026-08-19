import Link from "next/link";
import { notFound } from "next/navigation";
import { PortalShell, PortalTopbar } from "../../../../../components/portal/PortalShell";
import { BackLink } from "../../../../../components/portal/BackLink";
import { requireUser } from "../../../../../lib/auth";
import { canAccessProject, canAssignProjectPersonnel, canManageProjectInduction, canViewPersonnel } from "../../../../../lib/permissions";
import { getProject, listEmployees } from "../../../../../lib/repositories";
import { listProjectAssignedEmployees, listProjectInductions, employeeOvpStatus } from "../../../../../lib/personnel-repo";
import { appToday } from "../../../../../lib/datetime";
import { getPortalLanguage } from "../../../../../lib/portal-locale";
import { portalText } from "../../../../../data/portal-i18n";
import { assignEmployeeAction, setInductionAction, unassignEmployeeAction } from "./actions";

export default async function ProjectPersonnelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const project = getProject(id);
  if (!project || !canAccessProject(user, id) || !canViewPersonnel(user)) notFound();
  const language = await getPortalLanguage(), t = (v: string) => portalText(language, v), today = appToday();
  const canAssign = canAssignProjectPersonnel(user, id) && !project.archivedAt;
  const canInduct = canManageProjectInduction(user, id) && !project.archivedAt;
  const assigned = listProjectAssignedEmployees(id, true);
  const inductions = new Map(listProjectInductions(id).map((i) => [i.employeeId, i]));
  const allEmployees = listEmployees();
  const nameOf = new Map(allEmployees.map((e) => [e.id, e.name]));
  const assignedIds = new Set(assigned.map((a) => a.employeeId));
  const available = allEmployees.filter((e) => e.status !== "Inactive" && !assignedIds.has(e.id));
  const inductedCount = assigned.filter((a) => inductions.get(a.employeeId)?.completed).length;

  return <PortalShell active="/portal/projects">
    <BackLink href={`/portal/projects/${id}`} label={t("Back to project")} />
    <PortalTopbar eyebrow={`${project.name} · ${t("Project personnel")}`} title={t("Project personnel")} />
    <section className="os-project-summary">
      <div><span>{t("Assigned employees")}</span><strong>{assigned.length}</strong></div>
      <div><span>{t("Induction completed")}</span><strong>{inductedCount} / {assigned.length}</strong></div>
      <div><span>{t("Induction not completed")}</span><strong>{assigned.length - inductedCount}</strong></div>
    </section>

    {canAssign && available.length > 0 && <article className="os-panel os-workspace-full"><div className="os-panel-head"><h2>{t("Assign employee")}</h2></div>
      <form action={assignEmployeeAction} className="os-compact-form"><input type="hidden" name="projectId" value={id} />
        <select name="employeeId" required><option value="">—</option>{available.map((e) => <option key={e.id} value={e.id}>{e.name} · {t(e.role)}</option>)}</select>
        <input name="projectRole" placeholder={t("Project role")} defaultValue="Team member" />
        <button className="os-primary-action" type="submit">{t("Assign to project")}</button>
      </form></article>}

    <section className="os-table-card"><div className="os-table-wrap"><table className="os-table">
      <thead><tr><th>{t("Name")}</th><th>{t("OVP status")}</th><th>{t("Safety induction")}</th><th>{t("Manage")}</th></tr></thead>
      <tbody>{assigned.length ? assigned.map((a) => {
        const ind = inductions.get(a.employeeId); const ovp = employeeOvpStatus(a.employeeId, today);
        return <tr key={a.id}>
          <td><Link href={`/portal/employees/${a.employeeId}`}><strong>{nameOf.get(a.employeeId) || a.employeeId}</strong></Link><br /><small className="os-muted">{t(a.projectRole)}</small></td>
          <td><span className={`os-expiry os-expiry-${ovp.status}`}>{t({ valid: "Valid", expiring: "Expiring soon", expired: "Expired", none: "No expiry" }[ovp.status])}</span></td>
          <td>{ind?.completed ? <span className="os-badge os-badge-installed">{t("Completed")}{ind.completionDate ? ` · ${ind.completionDate}` : ""}</span> : <span className="os-attention-pill">{t("Not completed")}</span>}</td>
          <td>{canInduct && !ind?.completed && <details className="os-inline-editor"><summary>{t("Record induction")}</summary><form action={setInductionAction} className="os-mini-form"><input type="hidden" name="projectId" value={id} /><input type="hidden" name="employeeId" value={a.employeeId} /><input type="hidden" name="completed" value="1" /><label>{t("Completion date")}<input type="date" name="completionDate" defaultValue={today} /></label><label>{t("Conducted by")}<input name="conductedBy" defaultValue={user.name} /></label><label className="wide">{t("Comment")}<input name="comment" /></label><button className="os-primary-action" type="submit">{t("Mark completed")}</button></form></details>}
            {canAssign && <form action={unassignEmployeeAction} className="os-inline-form"><input type="hidden" name="projectId" value={id} /><input type="hidden" name="assignmentId" value={a.id} /><button className="os-delete-trigger" type="submit">{t("Unassign")}</button></form>}</td>
        </tr>;
      }) : <tr><td colSpan={4} className="os-empty">{t("No personnel yet.")}</td></tr>}</tbody>
    </table></div></section>
  </PortalShell>;
}
