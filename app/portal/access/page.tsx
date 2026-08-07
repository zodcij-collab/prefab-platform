import { PortalShell,PortalTopbar,StatusBadge } from "../../../components/portal/PortalShell";
import { CreateUserForm,EditUserForm,type AccessUserDto } from "../../../components/portal/UserManagementForms";
import { requireUser } from "../../../lib/auth";
import { formatAppDate } from "../../../lib/datetime";
import { canManageAccess } from "../../../lib/permissions";
import { listUsers } from "../../../lib/repositories";

export default async function AccessPage(){
  const currentUser=await requireUser();
  const allowed=canManageAccess(currentUser);
  const users:AccessUserDto[]=allowed?listUsers().map((row)=>({id:Number(row.id),name:String(row.name),email:String(row.email),role:String(row.role),active:Boolean(row.active),createdAt:String(row.createdAt)})):[];
  return <PortalShell active="/portal/access">
    <PortalTopbar eyebrow="Administration" title="Access & roles" action={<StatusBadge status={currentUser.role}/>}/>
    {!allowed?<section className="os-panel"><h2>Restricted</h2><p>Your role does not allow user-access administration.</p></section>:<>
      <div className="os-access-actions"><details className="os-add-user"><summary>+ Add user</summary><CreateUserForm/></details></div>
      <section className="os-table-card">
        <div className="os-panel-head os-table-head"><div><p>USERS</p><h2>Platform access</h2></div><span className="os-muted">Director and Administrator controls</span></div>
        <div className="os-table-wrap"><table className="os-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Manage</th></tr></thead><tbody>{users.map((user)=><tr key={user.id}><td><strong>{user.name}</strong>{user.id===currentUser.id&&<><br/><small>Current account</small></>}</td><td>{user.email}</td><td><StatusBadge status={user.role}/></td><td>{user.active?"Active":"Inactive"}</td><td>{formatAppDate(user.createdAt)}</td><td><details className="os-edit-user"><summary>Edit</summary><EditUserForm user={user} currentUserId={currentUser.id}/></details></td></tr>)}</tbody></table></div>
      </section>
    </>}
  </PortalShell>;
}
