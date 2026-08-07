import { PortalShell, PortalTopbar, StatusBadge } from "../../../components/portal/PortalShell";
import { requireUser } from "../../../lib/auth";
import { canManageAccess } from "../../../lib/permissions";
import { listUsers } from "../../../lib/repositories";

export default async function AccessPage() {
  const user = await requireUser();
  const allowed = canManageAccess(user);
  const users = allowed ? listUsers() : [];
  return <PortalShell active="/portal/access"><PortalTopbar eyebrow="Administration" title="Access & roles" action={<StatusBadge status={user.role} />} />
    {!allowed ? <section className="os-panel"><h2>Restricted</h2><p>Your role does not allow user-access administration.</p></section> : <section className="os-table-card"><div className="os-panel-head os-table-head"><div><p>USERS</p><h2>Platform access</h2></div><span className="os-muted">Role-based access foundation</span></div><div className="os-table-wrap"><table className="os-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th></tr></thead><tbody>{users.map((u)=><tr key={u.id}><td><strong>{u.name}</strong></td><td>{u.email}</td><td><StatusBadge status={u.role}/></td><td>{u.active ? "Active" : "Disabled"}</td><td>{u.createdAt.slice(0,10)}</td></tr>)}</tbody></table></div></section>}
  </PortalShell>;
}
