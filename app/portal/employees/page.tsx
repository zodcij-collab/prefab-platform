import { PortalShell, PortalTopbar, StatusBadge } from "../../../components/portal/PortalShell";
import { listEmployees } from "../../../lib/repositories";

export default function EmployeesPage() {
  const employees = listEmployees();
  return <PortalShell active="/portal/employees"><PortalTopbar eyebrow="HR · Personnel" title="Employees" action={<button className="os-primary-action" type="button">+ Add employee</button>} /><div className="os-toolbar"><div className="os-search">⌕ <input aria-label="Search employees" placeholder="Search name, role or project…" /></div><div className="os-filter">All employees ▾</div></div><div className="os-table-wrap os-table-card"><table className="os-table"><thead><tr><th>Employee</th><th>Role</th><th>Project</th><th>Status</th><th>Certificates</th><th>Phone</th></tr></thead><tbody>{employees.map((employee) => <tr key={employee.id}><td><div className="os-person"><span>{employee.name.split(" ").map((part) => part[0]).join("")}</span><strong>{employee.name}</strong></div></td><td>{employee.role}</td><td>{employee.project}</td><td><StatusBadge status={employee.status} /></td><td>{employee.certificates.length ? employee.certificates.join(", ") : "—"}</td><td>{employee.phone}</td></tr>)}</tbody></table></div></PortalShell>;
}
