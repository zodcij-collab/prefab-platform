import { notFound } from "next/navigation";
import { PortalShell,PortalTopbar } from "../../../../../components/portal/PortalShell";
import { ProjectForm } from "../../../../../components/portal/ProjectForm";
import { requireUser } from "../../../../../lib/auth";
import { canManageProjects } from "../../../../../lib/permissions";
import {getPortalLanguage} from "../../../../../lib/portal-locale";import {portalText} from "../../../../../data/portal-i18n";
import { getProject,listEmployees } from "../../../../../lib/repositories";
import { updateProjectAction } from "../../actions";

export default async function EditProjectPage({params}:{params:Promise<{id:string}>}){const {id}=await params;const project=getProject(id);if(!project)notFound();const user=await requireUser();const language=await getPortalLanguage();const t=(v:string)=>portalText(language,v);if(!canManageProjects(user))return <PortalShell active="/portal/projects"><PortalTopbar eyebrow={project.name} title={t("Edit project")}/><section className="os-panel"><h2>{t("Restricted")}</h2><p>{t("Your role does not allow project editing.")}</p></section></PortalShell>;return <PortalShell active="/portal/projects"><PortalTopbar eyebrow={t("Project management")} title={`${t("Edit")} ${project.name}`}/><ProjectForm action={updateProjectAction} project={project} managers={listEmployees()} language={language}/></PortalShell>}
