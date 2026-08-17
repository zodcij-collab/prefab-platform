"use client";

import { useRef } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createUserAction, setUserActiveAction, updateUserAction, type UserFormState } from "../../app/portal/access/actions";
import { ROLES } from "../../lib/roles";
import { isGlobalRole } from "../../lib/project-access";
import { portalText, type PortalLanguage } from "../../data/portal-i18n";

export type AccessUserDto = { id: number; name: string; email: string; role: string; active: boolean; createdAt: string };

const initial: UserFormState = { error: "", success: "" };
function Submit({ label, saving }: { label: string; saving: string }) { const { pending } = useFormStatus(); return <button className="os-primary-action" type="submit" disabled={pending}>{pending ? saving : label}</button>; }
function Result({ state }: { state: UserFormState }) { return <>{state.error && <p className="os-form-error" role="alert">{state.error}</p>}{state.success && <p className="os-form-success" role="status">{state.success}</p>}</>; }
// The <option> value stays the canonical English role (the server validates against ROLES); only
// the visible label is localized.
function RoleSelect({ defaultValue, t }: { defaultValue?: string; t: (v: string) => string }) { return <select name="role" defaultValue={defaultValue ?? "Employee"} required>{ROLES.map((role) => <option key={role} value={role}>{t(role)}</option>)}</select>; }

// A standing reminder that role ≠ project access (the two-layer model): assigning a role never
// grants project visibility — that is done per user via "Manage project access".
function ProjectAccessNote({ t }: { t: (v: string) => string }) {
  return <p className="os-access-note" role="note">🔐 {t("Role permissions do not automatically grant access to projects.")} {t("After creating the user, open “Manage project access” below to grant access to specific projects.")}</p>;
}

export function CreateUserForm({ language = "en" }: { language?: PortalLanguage }) {
  const t = (v: string) => portalText(language, v);
  const [state, action] = useActionState(createUserAction, initial);
  return <form action={action} className="os-user-form">
    <label>{t("Name")}<input name="name" maxLength={120} autoComplete="name" required /></label>
    <label>{t("Email")}<input name="email" type="email" maxLength={254} autoComplete="email" required /></label>
    <label>{t("Password")}<input name="password" type="password" minLength={12} autoComplete="new-password" required /></label>
    <label>{t("Confirm password")}<input name="confirmPassword" type="password" minLength={12} autoComplete="new-password" required /></label>
    <label>{t("Role")}<RoleSelect t={t} /></label>
    <label>{t("Status")}<select name="status" defaultValue="Active" required><option value="Active">{t("Account active")}</option><option value="Inactive">{t("Account inactive")}</option></select></label>
    <ProjectAccessNote t={t} />
    <div className="os-user-form-actions"><Submit label={t("Create user")} saving={t("Saving…")} /><Result state={state} /></div>
  </form>;
}

export function EditUserForm({ user, currentUserId, language = "en" }: { user: AccessUserDto; currentUserId: number; language?: PortalLanguage }) {
  const t = (v: string) => portalText(language, v);
  const [state, action] = useActionState(updateUserAction, initial);
  const isCurrent = user.id === currentUserId;
  return <form action={action} className="os-user-form os-user-edit-form">
    <input type="hidden" name="id" value={user.id} />
    <label>{t("Name")}<input name="name" maxLength={120} defaultValue={user.name} required /></label>
    <label>{t("Email")}<input name="email" type="email" maxLength={254} defaultValue={user.email} required /></label>
    <label>{t("Role")}<RoleSelect defaultValue={user.role} t={t} /></label>
    <label>{t("Status")}<select name="status" defaultValue={user.active ? "Active" : "Inactive"} required><option value="Active">{t("Account active")}</option><option value="Inactive" disabled={isCurrent}>{t("Account inactive")}</option></select>{isCurrent && <small>{t("Your active session cannot deactivate itself.")}</small>}</label>
    {!isGlobalRole(user.role) && <ProjectAccessNote t={t} />}
    <div className="os-user-form-actions"><Submit label={t("Save user")} saving={t("Saving…")} /><Result state={state} /></div>
  </form>;
}

// Explicit, confirmed account-access lifecycle. Deactivate opens a confirmation (it revokes
// sign-in + active sessions); Reactivate is a direct restore. The current account shows a locked
// note instead of a deactivate control. History/attribution are always preserved server-side.
export function UserLifecycleControl({ user, currentUserId, language = "en" }: { user: AccessUserDto; currentUserId: number; language?: PortalLanguage }) {
  const t = (v: string) => portalText(language, v);
  const dialogRef = useRef<HTMLDialogElement>(null);
  if (user.id === currentUserId) return <p className="os-muted os-lifecycle-self">{t("Current account")}</p>;
  if (!user.active) return <form action={setUserActiveAction} className="os-inline-form"><input type="hidden" name="id" value={user.id} /><input type="hidden" name="active" value="1" /><button className="os-secondary-action" type="submit">{t("Reactivate user")}</button></form>;
  return <>
    <button className="os-delete-trigger" type="button" onClick={() => dialogRef.current?.showModal()}>{t("Deactivate")}</button>
    <dialog className="os-confirm-dialog" ref={dialogRef} onCancel={() => dialogRef.current?.close()}>
      <div className="os-confirm-dialog-body">
        <span className="os-confirm-eyebrow">{t("Account access")}</span>
        <h2>{t("Deactivate user?")}</h2>
        <strong>{user.name} · {user.email}</strong>
        <p>{t("A deactivated user cannot sign in; their active sessions end immediately. History and attribution are preserved, and they can be reactivated later.")}</p>
        <form action={setUserActiveAction} className="os-confirm-actions">
          <input type="hidden" name="id" value={user.id} /><input type="hidden" name="active" value="0" />
          <button className="os-confirm-cancel" type="button" onClick={() => dialogRef.current?.close()}>{t("Cancel")}</button>
          <button className="os-confirm-delete" type="submit">{t("Deactivate user")}</button>
        </form>
      </div>
    </dialog>
  </>;
}
