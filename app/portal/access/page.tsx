import { PortalShell,PortalTopbar,StatusBadge } from "../../../components/portal/PortalShell";
import { CreateUserForm,EditUserForm,type AccessUserDto } from "../../../components/portal/UserManagementForms";
import { requireUser } from "../../../lib/auth";
import { formatAppDate } from "../../../lib/datetime";
import { canManageAccess } from "../../../lib/permissions";
import { listUsers } from "../../../lib/repositories";
import {getPortalLanguage} from "../../../lib/portal-locale";
import {portalText} from "../../../data/portal-i18n";

export default async function AccessPage(){
  const currentUser=await requireUser();
  const language=await getPortalLanguage();const t=(value:string)=>portalText(language,value);
  const allowed=canManageAccess(currentUser);
  const users:AccessUserDto[]=allowed?listUsers().map((row)=>({id:Number(row.id),name:String(row.name),email:String(row.email),role:String(row.role),active:Boolean(row.active),createdAt:String(row.createdAt)})):[];
  return <PortalShell active="/portal/access">
    <PortalTopbar eyebrow={t("Administration")} title={t("Access & roles")} action={<StatusBadge status={currentUser.role} label={t(currentUser.role)}/>}/>
    {!allowed?<section className="os-panel"><h2>{t("Restricted")}</h2><p>{t("Your role does not allow user-access administration.")}</p></section>:<>
      <div className="os-access-actions"><details className="os-add-user"><summary>+ {t("Add user")}</summary><CreateUserForm/></details></div>
      <section className="os-table-card">
        <div className="os-panel-head os-table-head"><div><p>{t("Users").toUpperCase()}</p><h2>{t("Platform access")}</h2></div><span className="os-muted">{t("Director and Administrator controls")}</span></div>
        <div className="os-table-wrap"><table className="os-table"><thead><tr><th>{t("Name")}</th><th>{t("Email")}</th><th>{t("Role")}</th><th>{t("Status")}</th><th>{t("Created")}</th><th>{t("Manage")}</th></tr></thead><tbody>{users.map((user)=><tr key={user.id}><td><strong>{user.name}</strong>{user.id===currentUser.id&&<><br/><small>{t("Current account")}</small></>}</td><td>{user.email}</td><td><StatusBadge status={user.role} label={t(user.role)}/></td><td>{t(user.active?"Active":"Inactive")}</td><td>{formatAppDate(user.createdAt)}</td><td><details className="os-edit-user"><summary>{t("Edit")}</summary><EditUserForm user={user} currentUserId={currentUser.id}/></details></td></tr>)}</tbody></table></div>
      </section>
    </>}
  </PortalShell>;
}
