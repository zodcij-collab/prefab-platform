import { PortalShell, PortalTopbar } from "../../../../components/portal/PortalShell";
import { ProjectForm } from "../../../../components/portal/ProjectForm";
import { requireUser } from "../../../../lib/auth";
import { canManageProjects } from "../../../../lib/permissions";
import {getPortalLanguage} from "../../../../lib/portal-locale";import {portalText} from "../../../../data/portal-i18n";
import { listEmployees } from "../../../../lib/repositories";
import { createProjectAction } from "../actions";

export default async function NewProjectPage(){const user=await requireUser();const language=await getPortalLanguage();const t=(v:string)=>portalText(language,v);if(!canManageProjects(user)) return <PortalShell active="/portal/projects"><PortalTopbar eyebrow={t("Project management")} title={t("New project")}/><section className="os-panel"><h2>{t("Restricted")}</h2><p>{t("Your role does not allow project creation.")}</p></section></PortalShell>;return <PortalShell active="/portal/projects"><PortalTopbar eyebrow={t("Project management")} title={t("New project")}/><ProjectForm action={createProjectAction} managers={listEmployees()} language={language}/></PortalShell>}
