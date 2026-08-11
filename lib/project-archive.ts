import { createHash } from "node:crypto";
import {
  getProject,
  listAttendanceForReport,
  listDeliveries,
  listElementImports,
  listElementHistory,
  listEmployeeAssignments,
  listProjectActivity,
  listProjectDocuments,
  listProjectElements,
  listProjectEvents,
  listProjectIssues,
  listProjectMembers,
  listProjectPhotos,
  listReportElements,
  listReports,
  listReportWeather,
} from "./repositories.ts";

// Sprint 11.3 — offline project archive package. Produces a machine-readable
// manifest plus JSON data files (and a list of media to attach). Physical server
// paths are never included in the exported data.
export const ARCHIVE_SCHEMA_VERSION = "1.0";

export type ArchiveMediaRef = { kind: "document" | "photo"; id: number; storedPath: string; filename: string; mimeType: string; archivePath: string };

function sha256(content: string) {
  return createHash("sha256").update(content).digest("hex");
}
function safeName(name: string) {
  return (name || "file").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
}
function withoutStoredPath<T extends { storedPath?: string }>(row: T) {
  const copy: Record<string, unknown> = { ...row };
  delete copy.storedPath;
  return copy;
}

export function collectProjectArchive(projectId: string, exportedBy: string, exportDate: string) {
  const project = getProject(projectId);
  if (!project) throw new Error("Project not found.");

  const reports = listReports().filter((report) => report.projectId === projectId).map((report) => ({
    report,
    attendance: listAttendanceForReport(report.id),
    weather: listReportWeather(report.id),
    elementIds: listReportElements(report.id).map((element) => element.id),
  }));
  const elements = listProjectElements(projectId);
  const elementHistory = elements.flatMap((element) => listElementHistory(element.id));
  const documents = listProjectDocuments(projectId);
  const photos = listProjectPhotos(projectId);
  const imports = listElementImports(projectId);
  const members = listProjectMembers(projectId);
  const assignments = members.flatMap((member) => listEmployeeAssignments(member.id).filter((assignment) => assignment.projectId === projectId));
  const deliveries = listDeliveries(projectId);
  const issues = listProjectIssues(projectId);
  const events = listProjectEvents(projectId);
  const activity = listProjectActivity(projectId);

  const data: Record<string, unknown> = {
    project,
    reports: reports.map((entry) => ({ ...entry })),
    elements,
    "element-history": elementHistory,
    documents: documents.map(withoutStoredPath),
    photos: photos.map(withoutStoredPath),
    imports,
    members,
    assignments,
    deliveries,
    issues,
    events,
    activity,
  };

  const files: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) files[`data/${key}.json`] = JSON.stringify(value, null, 2);

  const media: ArchiveMediaRef[] = [
    ...documents.filter((document) => document.storedPath).map((document) => ({ kind: "document" as const, id: document.id, storedPath: document.storedPath, filename: document.originalFilename, mimeType: document.mimeType, archivePath: `media/documents/${document.id}-${safeName(document.originalFilename)}` })),
    ...photos.filter((photo) => photo.storedPath).map((photo) => ({ kind: "photo" as const, id: photo.id, storedPath: photo.storedPath, filename: photo.originalFilename, mimeType: photo.mimeType, archivePath: `media/photos/${photo.id}-${safeName(photo.originalFilename)}` })),
  ];

  const recordCounts = { reports: reports.length, elements: elements.length, elementHistory: elementHistory.length, documents: documents.length, photos: photos.length, imports: imports.length, members: members.length, assignments: assignments.length, deliveries: deliveries.length, issues: issues.length, events: events.length, activity: activity.length };
  const checksums = Object.fromEntries(Object.entries(files).map(([name, content]) => [name, sha256(content)]));
  const manifest = {
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    projectId: project.id,
    projectName: project.name,
    exportDate,
    exportedBy,
    recordCounts,
    dataFiles: Object.keys(files).sort(),
    media: media.map((item) => ({ archivePath: item.archivePath, filename: item.filename, mimeType: item.mimeType, kind: item.kind })),
    checksums,
  };
  files["manifest.json"] = JSON.stringify(manifest, null, 2);
  return { manifest, files, media };
}
