import { PortalShell, PortalTopbar } from "../../../../components/portal/PortalShell";
import { ProjectForm } from "../../../../components/portal/ProjectForm";
import { requireUser } from "../../../../lib/auth";
import { canManageProjects } from "../../../../lib/permissions";
import { listEmployees } from "../../../../lib/repositories";
import { createProjectAction } from "../actions";

export default async function NewProjectPage(){const user=await requireUser();if(!canManageProjects(user)) return <PortalShell active="/portal/projects"><PortalTopbar eyebrow="Project management" title="New project"/><section className="os-panel"><h2>Restricted</h2><p>Your role does not allow project creation.</p></section></PortalShell>;return <PortalShell active="/portal/projects"><PortalTopbar eyebrow="Project management · Sprint 7" title="New project"/><ProjectForm action={createProjectAction} managers={listEmployees()}/></PortalShell>}
