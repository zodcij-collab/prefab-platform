import { notFound } from "next/navigation";
import { PortalShell,PortalTopbar } from "../../../../../components/portal/PortalShell";
import { ProjectForm } from "../../../../../components/portal/ProjectForm";
import { requireUser } from "../../../../../lib/auth";
import { canManageProjects } from "../../../../../lib/permissions";
import { getProject,listEmployees } from "../../../../../lib/repositories";
import { updateProjectAction } from "../../actions";

export default async function EditProjectPage({params}:{params:Promise<{id:string}>}){const {id}=await params;const project=getProject(id);if(!project)notFound();const user=await requireUser();if(!canManageProjects(user))return <PortalShell active="/portal/projects"><PortalTopbar eyebrow={project.name} title="Edit project"/><section className="os-panel"><h2>Restricted</h2><p>Your role does not allow project editing.</p></section></PortalShell>;return <PortalShell active="/portal/projects"><PortalTopbar eyebrow="Project management · Sprint 7" title={`Edit ${project.name}`}/><ProjectForm action={updateProjectAction} project={project} managers={listEmployees()}/></PortalShell>}
