import Link from "next/link";
import { notFound } from "next/navigation";
import { PortalShell, PortalTopbar, StatusBadge } from "../../../../components/portal/PortalShell";
import { BackLink } from "../../../../components/portal/BackLink";
import { EmployeePhoto } from "../../../../components/portal/EmployeePhoto";
import { requireUser } from "../../../../lib/auth";
import { canManageEmployees, canManagePersonnel, canManagePersonnelDocuments, canManageWorkwear, canViewPersonnel, canViewPersonnelDocuments, canViewPersonnelSensitive } from "../../../../lib/permissions";
import { getEmployee } from "../../../../lib/repositories";
import { getEmployeeFull, getEmployeeSafe, getEmployeePhoto, listEmployeeSkills, listEmployeeOvp, employeeOvpStatus, listEmployeeQualifications, listEmployeeDocuments, listEmployeeAssignments, listEmployeeSafetyRecords, employeeSafetySummary, getActiveOffboarding, listOffboardingItems } from "../../../../lib/personnel-repo";
import { QUALIFICATION_CATEGORIES, SAFETY_SEVERITIES, SKILL_OPTIONS, TERMINATION_REASONS, OFFBOARDING_ITEM_STATES, expiryStatus, type ExpiryStatus } from "../../../../lib/personnel";
import { appToday } from "../../../../lib/datetime";
import { getPortalLanguage } from "../../../../lib/portal-locale";
import { portalText } from "../../../../data/portal-i18n";
import { addOvpAction, addQualificationAction, addSafetyRecordAction, completeOffboardingAction, removeEmployeeDocumentAction, removeQualificationAction, setSkillsAction, startOffboardingAction, updateEmployeeProfileFormAction, updateWorkwearFormAction, updateOffboardingItemAction, uploadEmployeeDocumentAction, uploadEmployeePhotoAction } from "../personnel-actions";
import { SaveForm } from "../../../../components/portal/SaveForm";
import { SaveButton } from "../../../../components/portal/SaveButton";

const EXPIRY_LABEL: Record<ExpiryStatus, string> = { valid: "Valid", expiring: "Expiring soon", expired: "Expired", none: "No expiry" };
function Expiry({ status, t }: { status: ExpiryStatus; t: (v: string) => string }) {
  return <span className={`os-expiry os-expiry-${status}`}>{t(EXPIRY_LABEL[status])}</span>;
}

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const employee = getEmployee(id);
  if (!employee) notFound();
  const user = await requireUser();
  if (!canViewPersonnel(user)) notFound();
  const language = await getPortalLanguage(), t = (v: string) => portalText(language, v), today = appToday();
  const canManage = canManagePersonnel(user), canSensitive = canViewPersonnelSensitive(user), canDocs = canViewPersonnelDocuments(user), canManageDocs = canManagePersonnelDocuments(user), canWorkwear = canManageWorkwear(user);
  const full = canSensitive ? getEmployeeFull(id) : null;
  const safe = getEmployeeSafe(id); // workwear sizes are operational (safe projection), visible Foreman+
  const photo = getEmployeePhoto(id);
  const skills = listEmployeeSkills(id), ovp = listEmployeeOvp(id), ovpStatus = employeeOvpStatus(id, today);
  const quals = listEmployeeQualifications(id), assignments = listEmployeeAssignments(id);
  const documents = canDocs ? listEmployeeDocuments(id) : [];
  const safety = listEmployeeSafetyRecords(id), safetySummary = employeeSafetySummary(id, today);
  const offboarding = getActiveOffboarding(id), offItems = offboarding ? listOffboardingItems(offboarding.id) : [];
  const hidden = <input type="hidden" name="employeeId" value={id} />;

  return <PortalShell active="/portal/employees">
    <BackLink href="/portal/employees" label={t("Back to employees")} />
    <PortalTopbar eyebrow={t("Personnel register")} title={employee.name} action={<><StatusBadge status={employee.status} label={t(employee.status)} />{canManageEmployees(user) && <Link className="os-secondary-action" href={`/portal/employees/${id}/edit`}>{t("Edit")}</Link>}</>} />
    {!canSensitive && <p className="os-help">{t("Sensitive personnel data is visible to managers only.")}</p>}

    <section className="os-project-summary">
      <div><span>{t("Position")}</span><strong>{t(employee.role)}</strong></div>
      <div><span>{t("Phone")}</span><strong>{employee.phone || "—"}</strong></div>
      <div><span>{t("Email")}</span><strong>{employee.email || "—"}</strong></div>
      <div><span>{t("OVP status")}</span><strong><Expiry status={ovpStatus.status} t={t} /></strong></div>
    </section>

    <section className="os-workspace-grid">
      {/* Personal & employment (sensitive fields gated) */}
      <article className="os-panel">
        <div className="os-panel-head"><h2>{t("Personal & employment")}</h2></div>
        {photo && <EmployeePhoto employeeId={id} name={employee.name} />}
        <p>{t("Start")}: {employee.employmentStartDate || "—"} · {t("End")}: {employee.employmentEndDate || "—"}</p>
        {canSensitive && full && <>
          <p>{t("Date of birth")}: {full.dateOfBirth || "—"}</p>
          <p>{t("Personal code")}: {full.personalCode || "—"}</p>
          <p>{t("Emergency contact")}: {full.emergencyContact || "—"}{full.emergencyContactPhone ? ` · ${full.emergencyContactPhone}` : ""}</p>
        </>}
        <p>{t("Workwear")}: {[safe?.jacketSize, safe?.trousersSize, safe?.shoeSize].filter(Boolean).join(" · ") || "—"}</p>
        {canManage && <details className="os-inline-editor"><summary>{t("Edit")}</summary>
          <SaveForm action={updateEmployeeProfileFormAction} language={language} saveLabel={t("Save")} className="os-mini-form">{hidden}
            <label>{t("Date of birth")}<input type="date" name="dateOfBirth" defaultValue={full?.dateOfBirth || ""} /></label>
            <label>{t("Personal code")}<input name="personalCode" defaultValue={full?.personalCode || ""} maxLength={40} /></label>
            <label>{t("Emergency contact")}<input name="emergencyContact" defaultValue={full?.emergencyContact || ""} maxLength={120} /></label>
            <label>{t("Emergency contact phone")}<input name="emergencyContactPhone" defaultValue={full?.emergencyContactPhone || ""} maxLength={60} /></label>
            <label>{t("Jacket size")}<input name="jacketSize" defaultValue={full?.jacketSize || ""} maxLength={20} /></label>
            <label>{t("Trousers size")}<input name="trousersSize" defaultValue={full?.trousersSize || ""} maxLength={20} /></label>
            <label>{t("Shoe size")}<input name="shoeSize" defaultValue={full?.shoeSize || ""} maxLength={20} /></label>
          </SaveForm>
          <details className="os-inline-editor"><summary>{t("Upload photo")}</summary><form action={uploadEmployeePhotoAction} className="os-mini-form" encType="multipart/form-data">{hidden}<input type="file" name="photo" accept="image/*" required /><SaveButton language={language} className="os-secondary-action" label={t("Upload photo")} /></form></details>
        </details>}
        {/* Operational workwear sizing — editable by Foreman+ (PM+ edit it in the full profile form
            above). This surface never exposes sensitive HR fields. */}
        {canWorkwear && !canManage && <details className="os-inline-editor"><summary>{t("Edit workwear")}</summary>
          <SaveForm action={updateWorkwearFormAction} language={language} saveLabel={t("Save")} className="os-mini-form">{hidden}
            <label>{t("Jacket size")}<input name="jacketSize" defaultValue={safe?.jacketSize || ""} maxLength={20} /></label>
            <label>{t("Trousers size")}<input name="trousersSize" defaultValue={safe?.trousersSize || ""} maxLength={20} /></label>
            <label>{t("Shoe size")}<input name="shoeSize" defaultValue={safe?.shoeSize || ""} maxLength={20} /></label>
          </SaveForm>
        </details>}
      </article>

      {/* Skills */}
      <article className="os-panel">
        <div className="os-panel-head"><h2>{t("Skills")}</h2></div>
        <div className="os-chip-row">{skills.length ? skills.map((s) => <span key={s.id} className="os-chip">{s.skill}</span>) : <span className="os-muted">—</span>}</div>
        {canManage && <details className="os-inline-editor"><summary>{t("Edit")}</summary>
          <form action={setSkillsAction} className="os-mini-form">{hidden}
            <label className="wide">{t("Skills (comma-separated)")}<input name="skills" defaultValue={skills.map((s) => s.skill).join(", ")} placeholder={SKILL_OPTIONS.slice(0, 4).join(", ")} /></label>
            <button className="os-primary-action" type="submit">{t("Save skills")}</button>
          </form></details>}
      </article>

      {/* OVP */}
      <article className="os-panel os-workspace-full">
        <div className="os-panel-head"><div><p>{t("OVP").toUpperCase()}</p><h2>{t("Health examination (OVP)")}</h2></div></div>
        <div className="os-doc-list">{ovp.length ? ovp.map((o) => <div key={o.id}><span>{o.validUntil || "—"}</span><section><strong><Expiry status={expiryStatus(o.validUntil, today)} t={t} /></strong><small>{t("Examination date")}: {o.examDate || "—"}{o.provider ? ` · ${o.provider}` : ""}{o.comment ? ` · ${o.comment}` : ""}</small></section></div>) : <p className="os-muted">—</p>}</div>
        {canManage && <details className="os-inline-editor"><summary>+ {t("Add health examination")}</summary>
          <form action={addOvpAction} className="os-mini-form" encType="multipart/form-data">{hidden}
            <label>{t("Examination date")}<input type="date" name="examDate" required /></label>
            <label>{t("Valid until")}<input type="date" name="validUntil" /><small className="os-muted">{t("Default +1 year — editable")}</small></label>
            <label>{t("Provider")}<input name="provider" maxLength={160} /></label>
            <label className="wide">{t("Comment")}<input name="comment" maxLength={1000} /></label>
            {canManageDocs && <label className="wide">{t("Attach document")}<input type="file" name="document" accept="application/pdf,image/*" /></label>}
            <button className="os-primary-action" type="submit">{t("Add OVP")}</button>
          </form></details>}
      </article>

      {/* Qualifications */}
      <article className="os-panel os-workspace-full">
        <div className="os-panel-head"><div><p>{t("Qualifications").toUpperCase()}</p><h2>{t("Qualifications / Certificates")}</h2></div></div>
        <div className="os-doc-list">{quals.length ? quals.map((q) => <div key={q.id}><span>{q.validUntil || t("No expiry")}</span><section><strong>{q.category === "Other" ? q.customTitle || t("Other") : t(q.category)} {q.validUntil && <Expiry status={expiryStatus(q.validUntil, today)} t={t} />}</strong><small>{[q.certNumber, q.organization, q.issueDate].filter(Boolean).join(" · ") || "—"}</small></section>{canManage && <form action={removeQualificationAction}>{hidden}<input type="hidden" name="qualificationId" value={q.id} /><button className="os-delete-trigger" type="submit">{t("Remove")}</button></form>}</div>) : <p className="os-muted">—</p>}</div>
        {canManage && <details className="os-inline-editor"><summary>+ {t("Add qualification")}</summary>
          <form action={addQualificationAction} className="os-mini-form" encType="multipart/form-data">{hidden}
            <label>{t("Category")}<select name="category" defaultValue="General site safety">{QUALIFICATION_CATEGORIES.map((c) => <option key={c} value={c}>{t(c)}</option>)}</select></label>
            <label>{t("Custom title")}<input name="customTitle" maxLength={120} placeholder={t("Other")} /></label>
            <label>{t("Certificate number")}<input name="certNumber" maxLength={80} /></label>
            <label>{t("Organization")}<input name="organization" maxLength={160} /></label>
            <label>{t("Issue date")}<input type="date" name="issueDate" /></label>
            <label>{t("Valid until")}<input type="date" name="validUntil" /></label>
            {canManageDocs && <label className="wide">{t("Attach document")}<input type="file" name="document" accept="application/pdf,image/*" /></label>}
            <button className="os-primary-action" type="submit">{t("Add qualification")}</button>
          </form></details>}
      </article>

      {/* Documents (PM+) */}
      {canDocs && <article className="os-panel os-workspace-full">
        <div className="os-panel-head"><h2>{t("Documents")}</h2></div>
        <div className="os-doc-list">{documents.length ? documents.map((d) => <div key={d.id}><span>{t(d.relationType === "general" ? "Documents" : d.relationType.toUpperCase())}</span><section><a href={`/portal/files/employee-docs/${d.id}`} target="_blank" rel="noreferrer"><strong>{d.title || d.originalFilename}</strong></a><small>{d.uploadedBy}</small></section>{canManageDocs && <form action={removeEmployeeDocumentAction}>{hidden}<input type="hidden" name="documentId" value={d.id} /><button className="os-delete-trigger" type="submit">{t("Remove")}</button></form>}</div>) : <p className="os-muted">—</p>}</div>
        {canManageDocs && <details className="os-inline-editor"><summary>+ {t("Attach document")}</summary>
          <form action={uploadEmployeeDocumentAction} className="os-mini-form" encType="multipart/form-data">{hidden}
            <label>{t("Category")}<select name="relationType" defaultValue="general"><option value="general">{t("Documents")}</option><option value="ovp">{t("OVP")}</option><option value="qualification">{t("Qualifications")}</option><option value="safety">{t("Safety record")}</option></select></label>
            <label className="wide">{t("Custom title")}<input name="title" maxLength={160} /></label>
            <label className="wide"><input type="file" name="document" accept="application/pdf,image/*" required /></label>
            <button className="os-primary-action" type="submit">{t("Attach document")}</button>
          </form></details>}
      </article>}

      {/* Assignments */}
      <article className="os-panel">
        <div className="os-panel-head"><h2>{t("Project assignments")}</h2></div>
        <div className="os-doc-list">{assignments.length ? assignments.map((a) => <div key={a.id}><span>{a.startDate}</span><section><strong>{a.projectName}</strong><small>{t(a.projectRole)} · {a.endDate ? a.endDate : t("Current")}</small></section></div>) : <p className="os-muted">{t("Not assigned to any project")}</p>}</div>
      </article>

      {/* Safety record */}
      <article className="os-panel">
        <div className="os-panel-head"><div><p>{t("Last 12 months")}</p><h2>{t("Safety record")}</h2></div></div>
        <p className="os-safety-summary">{safetySummary.total} {t("Safety observations").toLowerCase()} · {safetySummary.major} {t("Major").toLowerCase()} · {safetySummary.critical} {t("Critical").toLowerCase()}</p>
        <div className="os-doc-list">{safety.slice(0, 6).map((r) => <div key={r.id}><span>{(r.occurredAt || "").slice(0, 10)}</span><section><strong>{t(r.severity)}</strong><small>{r.category ? `${r.category} · ` : ""}{r.description}</small></section></div>)}{!safety.length && <p className="os-muted">{t("No safety records")}</p>}</div>
        {canManage && <details className="os-inline-editor"><summary>+ {t("Add safety observation")}</summary>
          <form action={addSafetyRecordAction} className="os-mini-form" encType="multipart/form-data">{hidden}
            <label>{t("Severity")}<select name="severity" defaultValue="Observation">{SAFETY_SEVERITIES.map((s) => <option key={s} value={s}>{t(s)}</option>)}</select></label>
            <label>{t("Date")}<input type="date" name="occurredAt" defaultValue={today} /></label>
            <label>{t("Category")}<input name="category" maxLength={80} /></label>
            <label className="wide">{t("Description")}<textarea name="description" rows={2} maxLength={2000} required /></label>
            <label className="wide">{t("Action taken")}<input name="actionTaken" maxLength={2000} /></label>
            {canManageDocs && <label className="wide">{t("Attach document")}<input type="file" name="document" accept="application/pdf,image/*" /></label>}
            <button className="os-primary-action" type="submit">{t("Record observation")}</button>
          </form></details>}
      </article>

      {/* Offboarding */}
      {canManage && <article className="os-panel os-workspace-full">
        <div className="os-panel-head"><h2>{t("Offboarding")}</h2></div>
        {!offboarding
          ? (employee.status !== "Inactive" && <form action={startOffboardingAction}>{hidden}<button className="os-delete-trigger" type="submit">{t("Start offboarding")}</button></form>)
          : <>
            <div className="os-doc-list">{offItems.map((it) => <div key={it.id}><span className={`os-off-state os-off-${it.state.replace(/\s/g, "").toLowerCase()}`}>{t(it.state)}</span><section><strong>{it.label}</strong>{it.comment && <small>{it.comment}</small>}</section><form action={updateOffboardingItemAction} className="os-inline-form">{hidden}<input type="hidden" name="itemId" value={it.id} /><select name="state" defaultValue={it.state}>{OFFBOARDING_ITEM_STATES.map((s) => <option key={s} value={s}>{t(s)}</option>)}</select><button className="os-secondary-action" type="submit">{t("Save")}</button></form></div>)}</div>
            {offItems.some((it) => it.state !== "Closed") && <p className="os-attention-banner">{t("Unresolved items remain")}</p>}
            <details className="os-inline-editor"><summary>{t("Complete offboarding")}</summary>
              <form action={completeOffboardingAction} className="os-mini-form">{hidden}<input type="hidden" name="offboardingId" value={offboarding.id} />
                <label>{t("Termination date")}<input type="date" name="terminationDate" defaultValue={today} required /></label>
                <label>{t("Termination reason")}<select name="reason">{TERMINATION_REASONS.map((r) => <option key={r} value={r}>{t(r)}</option>)}</select></label>
                <label className="wide">{t("Comment")}<input name="reasonComment" maxLength={1000} /></label>
                <button className="os-delete-trigger" type="submit">{t("Complete offboarding")}</button>
              </form></details>
          </>}
      </article>}
    </section>
  </PortalShell>;
}
