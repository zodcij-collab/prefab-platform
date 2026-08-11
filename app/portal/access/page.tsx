import { PortalShell,PortalTopbar,StatusBadge } from "../../../components/portal/PortalShell";
import { CreateUserForm,EditUserForm,type AccessUserDto } from "../../../components/portal/UserManagementForms";
import { requireUser } from "../../../lib/auth";
import { formatAppDate } from "../../../lib/datetime";
import { canManageAccess } from "../../../lib/permissions";
import { getProjectPermission,listProjects,listUsers } from "../../../lib/repositories";
import { PROJECT_CAPABILITIES,isGlobalRole,presetCapabilities,type AccessPreset,type CapabilityMap } from "../../../lib/project-access";
import { setUserProjectAccessAction } from "./actions";
import {getPortalLanguage} from "../../../lib/portal-locale";
import {portalText} from "../../../data/portal-i18n";

function derivePreset(capabilities:CapabilityMap|undefined):AccessPreset|"custom"{
  if(!capabilities)return "role";
  const matches=(preset:AccessPreset)=>{const target=presetCapabilities(preset);return target?PROJECT_CAPABILITIES.every((capability)=>Boolean(capabilities[capability])===Boolean(target[capability])):false;};
  if(matches("full"))return "full";if(matches("read-only"))return "read-only";if(matches("none"))return "none";return "custom";
}
function ProjectAccessEditor({userId,role,projects,t}:{userId:number;role:string;projects:{id:string;name:string}[];t:(v:string)=>string}){
  if(isGlobalRole(role))return <p className="os-muted">{t("Global role has access to all projects.")}</p>;
  if(projects.length===0)return <p className="os-muted">{t("No projects yet.")}</p>;
  return <div className="os-access-editor">{projects.map((project)=>{const current=derivePreset(getProjectPermission(userId,project.id)?.capabilities);return <form action={setUserProjectAccessAction} className="os-access-row" key={project.id}><input type="hidden" name="userId" value={userId}/><input type="hidden" name="projectId" value={project.id}/><span className="os-access-project">{project.name}</span><select name="preset" defaultValue={current==="custom"?"custom":current} aria-label={t("Access level")}><option value="role">{t("Role default")}</option><option value="read-only">{t("Read-only")}</option><option value="full">{t("Full access")}</option><option value="none">{t("No project access")}</option>{current==="custom"&&<option value="custom" disabled>{t("Custom")}</option>}</select><button className="os-secondary-action" type="submit">{t("Save")}</button></form>;})}</div>;
}

export default async function AccessPage(){
  const currentUser=await requireUser();
  const language=await getPortalLanguage();const t=(value:string)=>portalText(language,value);
  const allowed=canManageAccess(currentUser);
  const users:AccessUserDto[]=allowed?listUsers().map((row)=>({id:Number(row.id),name:String(row.name),email:String(row.email),role:String(row.role),active:Boolean(row.active),createdAt:String(row.createdAt)})):[];
  const accessProjects=allowed?listProjects().filter((project)=>!project.archivedAt).map((project)=>({id:project.id,name:project.name})):[];
  return <PortalShell active="/portal/access">
    <PortalTopbar eyebrow={t("Administration")} title={t("Access & roles")} action={<StatusBadge status={currentUser.role} label={t(currentUser.role)}/>}/>
    {!allowed?<section className="os-panel"><h2>{t("Restricted")}</h2><p>{t("Your role does not allow user-access administration.")}</p></section>:<>
      <div className="os-access-actions"><details className="os-add-user"><summary>+ {t("Add user")}</summary><CreateUserForm/></details></div>
      <section className="os-table-card">
        <div className="os-panel-head os-table-head"><div><p>{t("Users").toUpperCase()}</p><h2>{t("Platform access")}</h2></div><span className="os-muted">{t("Director and Administrator controls")}</span></div>
        <div className="os-table-wrap"><table className="os-table"><thead><tr><th>{t("Name")}</th><th>{t("Email")}</th><th>{t("Role")}</th><th>{t("Status")}</th><th>{t("Created")}</th><th>{t("Manage")}</th></tr></thead><tbody>{users.map((user)=><tr key={user.id}><td><strong>{user.name}</strong>{user.id===currentUser.id&&<><br/><small>{t("Current account")}</small></>}</td><td>{user.email}</td><td><StatusBadge status={user.role} label={t(user.role)}/></td><td>{t(user.active?"Active":"Inactive")}</td><td>{formatAppDate(user.createdAt)}</td><td><details className="os-edit-user"><summary>{t("Edit")}</summary><EditUserForm user={user} currentUserId={currentUser.id}/></details><details className="os-edit-user"><summary>{t("Manage project access")}</summary><ProjectAccessEditor userId={user.id} role={user.role} projects={accessProjects} t={t}/></details></td></tr>)}</tbody></table></div>
      </section>
    </>}
  </PortalShell>;
}
