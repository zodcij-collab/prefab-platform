"use server";
import { redirect } from "next/navigation";
import { requireUser } from "../../../../lib/auth";
import { addProjectEvent, createReport, getProject, logActivity } from "../../../../lib/repositories";

export async function createDailyReportAction(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId") ?? "");
  const project = getProject(projectId);
  if (!project) throw new Error("Project not found");
  createReport({
    projectId,
    project: project.name,
    date: String(formData.get("date") ?? new Date().toISOString().slice(0, 10)),
    people: Number(formData.get("people") ?? 0),
    work: String(formData.get("work") ?? "").trim(),
    deliveries: Number(formData.get("deliveries") ?? 0),
    issues: Number(formData.get("issues") ?? 0),
    weather: String(formData.get("weather") ?? ""),
    notes: String(formData.get("notes") ?? "").trim(),
    author: user.name,
  });
  const reportDate = String(formData.get("date") ?? new Date().toISOString().slice(0, 10));
  addProjectEvent({ projectId, date: reportDate, time: "", type: "Report", title: "Daily report submitted", details: String(formData.get("work") ?? "").trim(), author: user.name });
  logActivity({ userId: user.id, actor: user.name, action: "Created daily report", entityType: "project", entityId: projectId, details: project.name });
  redirect("/portal/reports");
}
