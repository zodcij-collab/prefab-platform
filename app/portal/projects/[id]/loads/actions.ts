"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "../../../../../lib/auth";
import { canApproveLoadException, canManageProjectLoads } from "../../../../../lib/permissions";
import {
  acceptLoad, acknowledgeLoadException, assertLoadMutationAllowed, cancelLoad, createLoad, getLoad, getProjectElement,
  listLoadElements, listTransportProfiles, logActivity, nextProjectLoadNumber, replaceLoadElements, runTransaction, setLoadWeekendAck, updateLoadDetails,
  type LoadElementInput,
} from "../../../../../lib/repositories";
import { ELEMENT_ORIENTATIONS, LOAD_INTENTS, LOADING_DIRECTIONS, evaluateLoad, type LoadElementCalc, type TransportProfileCalc } from "../../../../../lib/loads";

export type LoadActionState = { error: string };
const value = (data: FormData, key: string, max = 4000) => String(data.get(key) ?? "").trim().slice(0, max);

function profileCalc(): TransportProfileCalc[] {
  return listTransportProfiles().map((p) => ({ id: p.id, name: p.name, active: p.active === 1, placeholder: p.placeholder === 1, rank: p.rank, maxPayloadT: p.maxPayloadT, maxLengthMm: p.maxLengthMm, maxWidthMm: p.maxWidthMm, maxHeightMm: p.maxHeightMm }));
}

export async function cancelLoadAction(data: FormData) {
  const user = await requireUser();
  const projectId = value(data, "projectId", 100), loadId = Number(value(data, "loadId", 30));
  assertLoadMutationAllowed(projectId);
  if (!canManageProjectLoads(user, projectId)) throw new Error("You do not have permission to cancel loads.");
  const load = getLoad(loadId);
  if (!load || load.projectId !== projectId) throw new Error("Load not found.");
  runTransaction(() => { cancelLoad(loadId, projectId); logActivity({ userId: user.id, actor: user.name, action: "Load cancelled", entityType: "project", entityId: projectId, details: `Load ${load.loadNumber}` }); });
  revalidatePath(`/portal/projects/${projectId}/loads`);
  redirect(`/portal/projects/${projectId}/loads`);
}

// Accept ("receive") a planned load. as_planned records the whole plan as received;
// with_discrepancies records per-element received/missing plus any extra elements that
// arrived. Received/added elements become On site; missing elements are released. Accepting
// with discrepancies is a supervisory action (loads.approve_exception).
export async function acceptLoadAction(data: FormData) {
  const user = await requireUser();
  const projectId = value(data, "projectId", 100), loadId = Number(value(data, "loadId", 30));
  assertLoadMutationAllowed(projectId);
  if (!canManageProjectLoads(user, projectId)) throw new Error("You do not have permission to receive loads.");
  const load = getLoad(loadId);
  if (!load || load.projectId !== projectId) throw new Error("Load not found.");
  const acceptanceType = value(data, "acceptanceType", 30) === "with_discrepancies" ? "with_discrepancies" : "as_planned";
  if (acceptanceType === "with_discrepancies" && !canApproveLoadException(user, projectId)) throw new Error("Accepting a load with discrepancies must be approved by a Project Manager or Administrator.");
  const comment = value(data, "comment", 2000);
  const operationDate = value(data, "operationDate", 10) || load.plannedDate;
  const received: number[] = [], missing: number[] = [];
  let added: Array<{ elementId: number; category: string; note: string }> = [];
  if (acceptanceType === "with_discrepancies") {
    for (const row of listLoadElements(loadId)) {
      if (value(data, `disp_${row.elementId}`, 20) === "missing") missing.push(row.elementId); else received.push(row.elementId);
    }
    let addedRaw: unknown;
    try { addedRaw = JSON.parse(value(data, "added", 50000) || "[]"); } catch { throw new Error("Invalid added-element list."); }
    added = (Array.isArray(addedRaw) ? addedRaw : []).map((a) => ({ elementId: Number((a as { elementId?: unknown }).elementId), category: String((a as { category?: unknown }).category ?? "").slice(0, 50), note: String((a as { note?: unknown }).note ?? "").slice(0, 500) })).filter((a) => Number.isInteger(a.elementId) && a.elementId > 0);
  }
  runTransaction(() => {
    acceptLoad(loadId, projectId, user, { acceptanceType, comment, operationDate, received, missing, added });
    const detail = acceptanceType === "as_planned" ? `Load ${load.loadNumber} received as planned` : `Load ${load.loadNumber} received with discrepancies (${received.length} received, ${missing.length} missing, ${added.length} added)`;
    logActivity({ userId: user.id, actor: user.name, action: "Load received", entityType: "project", entityId: projectId, details: detail });
  });
  revalidatePath(`/portal/projects/${projectId}/loads`);
  redirect(`/portal/projects/${projectId}/loads/${loadId}?received=1`);
}

// Save the load. A load only becomes a persistent record here, on the first successful
// save — opening the editor never creates a DB row. loadId "" / 0 means a new load.
// intent: "save" | "save_next". targetStatus: "Draft" | "Planned".
export async function saveLoadAction(_state: LoadActionState, data: FormData): Promise<LoadActionState> {
  const user = await requireUser();
  const projectId = value(data, "projectId", 100);
  const loadId = Number(value(data, "loadId", 30)) || 0;
  try {
    assertLoadMutationAllowed(projectId);
    if (!canManageProjectLoads(user, projectId)) return { error: "You do not have permission to plan loads for this project." };
    const existing = loadId ? getLoad(loadId) : null;
    if (loadId && (!existing || existing.projectId !== projectId)) return { error: "Load not found." };
    if (existing && existing.status === "Cancelled") return { error: "Cancelled loads cannot be edited." };

    const targetStatus = value(data, "targetStatus", 20) === "Planned" ? "Planned" : "Draft";
    const plannedDate = value(data, "plannedDate", 10), plannedTime = value(data, "plannedTime", 5);
    const loadingDirection = (LOADING_DIRECTIONS as readonly string[]).includes(value(data, "loadingDirection", 20)) ? value(data, "loadingDirection", 20) : "forward";
    const orientationNote = value(data, "orientationNote", 500), note = value(data, "note", 2000);
    const transportRaw = value(data, "transportProfileId", 30), transportProfileId = transportRaw ? Number(transportRaw) : null;

    let parsed: Array<{ elementId: number; orientation: string; intent: string; note: string }>;
    try { parsed = JSON.parse(value(data, "elements", 200000) || "[]"); } catch { return { error: "Invalid load contents." }; }
    if (!Array.isArray(parsed)) return { error: "Invalid load contents." };
    const elements: LoadElementInput[] = [];
    const calc: LoadElementCalc[] = [];
    for (let index = 0; index < parsed.length; index++) {
      const row = parsed[index];
      const elementId = Number(row?.elementId);
      if (!Number.isInteger(elementId) || elementId <= 0) return { error: "Invalid element in load." };
      const orientation = (ELEMENT_ORIENTATIONS as readonly string[]).includes(row?.orientation) ? row.orientation : "Vertical";
      const rowIntent = (LOAD_INTENTS as readonly string[]).includes(row?.intent) ? row.intent : "Direct erection";
      const element = getProjectElement(elementId);
      if (!element || element.projectId !== projectId || !element.active) return { error: "Selected element is not available for this project." };
      elements.push({ elementId, position: index, orientation, intent: rowIntent, note: String(row?.note ?? "").slice(0, 500) });
      calc.push({ elementType: element.elementType, orientation, weight: element.weight, length: element.length, width: element.width, height: element.height });
    }

    const profiles = profileCalc();
    if (transportProfileId && !profiles.some((p) => p.id === transportProfileId)) return { error: "Selected transport is invalid." };
    const wantsAck = value(data, "exceptionAck", 5) === "on";
    const canAck = canApproveLoadException(user, projectId);
    const exceptionAcknowledged = wantsAck && canAck;
    const weekendAcknowledged = value(data, "weekendAck", 5) === "on";
    const evaluation = evaluateLoad({ elements: calc, profiles, selectedProfileId: transportProfileId, targetStatus, plannedDate, plannedTime, exceptionAcknowledged, weekendAcknowledged });
    if (targetStatus === "Planned" && evaluation.blocking) {
      if (wantsAck && !canAck && evaluation.messages.some((m) => m.code === "non_standard_ack" || m.code === "exceeds_selected")) return { error: "You are not authorized to acknowledge a transport exception. A Project Manager or Administrator must approve it." };
      return { error: "This load cannot be planned until the blocking issues are resolved." };
    }

    let savedId = loadId;
    runTransaction(() => {
      if (!savedId) {
        savedId = createLoad({ projectId, loadNumber: nextProjectLoadNumber(projectId), status: targetStatus, plannedDate, plannedTime, transportProfileId, recommendedProfileId: evaluation.recommendedProfileId, loadingDirection, orientationNote, note, createdById: user.id, createdBy: user.name });
      } else {
        updateLoadDetails(savedId, projectId, { status: targetStatus, plannedDate, plannedTime, transportProfileId, recommendedProfileId: evaluation.recommendedProfileId, loadingDirection, orientationNote, note });
      }
      replaceLoadElements(savedId, projectId, 1, elements);
      setLoadWeekendAck(savedId, projectId, weekendAcknowledged, user);
      if (exceptionAcknowledged) acknowledgeLoadException(savedId, projectId, user, value(data, "exceptionReason", 500));
      const number = getLoad(savedId)!.loadNumber;
      logActivity({ userId: user.id, actor: user.name, action: !loadId ? "Load created" : targetStatus === "Planned" ? "Load planned" : "Load updated", entityType: "project", entityId: projectId, details: `Load ${number} · ${elements.length} elements` });
      if (exceptionAcknowledged) logActivity({ userId: user.id, actor: user.name, action: "Load transport exception acknowledged", entityType: "project", entityId: projectId, details: `Load ${number}` });
    });
    revalidatePath(`/portal/projects/${projectId}/loads`);
    if (value(data, "intent", 20) === "save_next") {
      // Carry planning context forward (never elements) into a fresh unsaved editor.
      const carry = new URLSearchParams();
      if (plannedDate) carry.set("date", plannedDate);
      if (plannedTime) carry.set("time", plannedTime);
      if (transportProfileId) carry.set("transport", String(transportProfileId));
      if (loadingDirection) carry.set("direction", loadingDirection);
      redirect(`/portal/projects/${projectId}/loads/new?${carry.toString()}`);
    }
    redirect(`/portal/projects/${projectId}/loads/${savedId}?saved=1`);
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    if (typeof error === "object" && error !== null && "digest" in error && String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) throw error;
    return { error: error instanceof Error ? error.message : "Unable to save the load." };
  }
}
