import Link from "next/link";
import { PortalShell, PortalTopbar, StatusBadge } from "../../../components/portal/PortalShell";
import { listEmployees, listProjects } from "../../../lib/repositories";
import { getPortalLanguage } from "../../../lib/portal-locale";
import { portalText } from "../../../data/portal-i18n";
import { requireUser } from "../../../lib/auth";
import { canManageEmployees, hasGlobalWorkforceAccess, permittedProjectIds } from "../../../lib/permissions";
import { employeeOvpStatus, employeeQualificationWarning, listActiveAssignments } from "../../../lib/personnel-repo";
import { appToday } from "../../../lib/datetime";

const EXPIRY_LABEL = { valid: "Valid", expiring: "Expiring soon", expired: "Expired", none: "No expiry" } as const;

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; project?: string }> }) {
  const user = await requireUser();
  const language = await getPortalLanguage(), t = (v: string) => portalText(language, v);
  if (user.role === "Employee") return <PortalShell active="/portal/employees"><PortalTopbar eyebrow={t("Personnel")} title={t("Restricted")} /><section className="os-panel"><p>{t("Your role does not allow workforce register access.")}</p></section></PortalShell>;
  const params = await searchParams;
  const projects = listProjects();
  const allowed = new Set(permittedProjectIds(user, projects.map((p) => p.id)));
  const today = appToday();

  // Canonical project participation = active employee↔project assignments (the SAME source used
  // by Project Personnel and the Daily Log crew). Role rank is never a factor here: a Project
  // Manager assigned to the project is a participant like anyone else. (What SENSITIVE data the
  // viewer may see stays a separate concern, enforced on the detail page + document routes.)
  const assignedByEmployee = new Map<string, { ids: Set<string>; names: string[] }>();
  for (const a of listActiveAssignments()) {
    let e = assignedByEmployee.get(a.employeeId);
    if (!e) { e = { ids: new Set(), names: [] }; assignedByEmployee.set(a.employeeId, e); }
    if (!e.ids.has(a.projectId)) { e.ids.add(a.projectId); e.names.push(a.projectName); }
  }
  const projectsOf = (id: string) => assignedByEmployee.get(id) ?? { ids: new Set<string>(), names: [] as string[] };

  const q = (params.q ?? "").trim().toLocaleLowerCase();
  const employees = listEmployees()
    // Visibility: a global workforce role sees everyone; otherwise the viewer sees employees who
    // participate in a project the viewer can access — via assignment, independent of role rank.
    .filter((e) => hasGlobalWorkforceAccess(user) || [...projectsOf(e.id).ids].some((pid) => allowed.has(pid)))
    .filter((e) => !q || `${e.name} ${e.role} ${projectsOf(e.id).names.join(" ")}`.toLocaleLowerCase().includes(q))
    .filter((e) => !params.status || e.status === params.status)
    // Project filter uses the SAME assignment source → it can never disagree with the column,
    // Project Personnel, or the Daily Log crew.
    .filter((e) => !params.project || projectsOf(e.id).ids.has(params.project));

  return <PortalShell active="/portal/employees">
    <PortalTopbar eyebrow={`HR · ${t("Personnel")}`} title={t("Employees")} action={canManageEmployees(user) ? <Link className="os-primary-action" href="/portal/employees/new">+ {t("Add employee")}</Link> : undefined} />
    <form className="os-toolbar" method="get">
      <div className="os-search">⌕ <input name="q" aria-label={t("Search employees")} placeholder={t("Search name, role or project…")} defaultValue={params.q} /></div>
      <select className="os-filter" name="project" defaultValue={params.project ?? ""}><option value="">{t("All projects")}</option>{projects.filter((p) => allowed.has(p.id)).map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}</select>
      <select className="os-filter" name="status" defaultValue={params.status ?? ""}><option value="">{t("All statuses")}</option>{["Active", "Unavailable", "Inactive"].map((s) => <option value={s} key={s}>{t(s)}</option>)}</select>
      <button className="os-secondary-action" type="submit">{t("Filter")}</button>
    </form>
    <div className="os-table-wrap os-table-card"><table className="os-table">
      <thead><tr><th>{t("Employee")}</th><th>{t("Position / trade")}</th><th>{t("Assigned project(s)")}</th><th>{t("Status")}</th><th>{t("OVP status")}</th><th>{t("Phone")}</th><th>{t("Manage")}</th></tr></thead>
      <tbody>{employees.map((employee) => {
        const ovp = employeeOvpStatus(employee.id, today), warn = employeeQualificationWarning(employee.id, today);
        const projectNames = projectsOf(employee.id).names;
        return <tr key={employee.id}>
          <td><div className="os-person"><span>{employee.name.split(" ").map((part) => part[0]).join("")}</span><strong>{employee.name}</strong></div></td>
          <td>{t(employee.role)}</td>
          <td>{projectNames.length ? projectNames.join(", ") : "—"}</td>
          <td><StatusBadge status={employee.status} label={t(employee.status)} /></td>
          <td><span className={`os-expiry os-expiry-${ovp.status}`}>{t(EXPIRY_LABEL[ovp.status])}</span>{(warn.expired > 0 || warn.expiring > 0) && <small className="os-qual-warn"> · {warn.expired > 0 ? `${warn.expired} ${t("Expired").toLowerCase()}` : `${warn.expiring} ${t("Expiring soon").toLowerCase()}`}</small>}</td>
          <td>{employee.phone || "—"}</td>
          <td><Link href={`/portal/employees/${employee.id}`}>{t("View")} →</Link></td>
        </tr>;
      })}</tbody>
    </table>{employees.length === 0 && <p className="os-empty-state">{t("No employees match these filters.")}</p>}</div>
  </PortalShell>;
}
