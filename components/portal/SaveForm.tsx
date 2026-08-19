"use client";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { portalText, type PortalLanguage } from "../../data/portal-i18n";
import { SAVE_IDLE, type SaveState } from "../../lib/form-state";

// Reusable explicit-save form (the platform save-feedback primitive). Generalises the accepted
// IssueClassifyForm pattern: wrap a state-returning server action and render
//   Save changes → Saving… → ✓ Changes saved   (or ✕ Could not save changes)
// plus an "Unsaved changes" hint once the user edits again after a save. The action MUST
// revalidate IN PLACE (never redirect) so this component stays mounted to show the result.
// Status is text-based (never colour alone) and announced via role=status/alert.
//
// React 19 auto-resets an uncontrolled form after its action runs, which would wipe the user's
// entered values on a FAILED save. To honour "input survives a recoverable error", the field
// values are snapshotted on submit and restored after an errored result — so the fields keep the
// user's text and they can simply retry (on success, in-place revalidation supplies the values).
export function SaveForm({ action, language, saveLabel, className = "os-mini-form", children }: {
  action: (state: SaveState, data: FormData) => Promise<SaveState>;
  language: PortalLanguage;
  saveLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  const t = (v: string) => portalText(language, v);
  const [state, formAction] = useActionState(action, SAVE_IDLE);
  const [dirty, setDirty] = useState(false);
  // Each completed submit (success OR error) clears "dirty" — the on-screen values now match the
  // last attempt, so its result shows until the user edits again. React "adjust state while
  // rendering when a tracked value changes" pattern (no effect, no extra commit).
  const [seenState, setSeenState] = useState(state);
  if (seenState !== state) { setSeenState(state); if (dirty) setDirty(false); }

  const formRef = useRef<HTMLFormElement>(null);
  const draft = useRef<{ name: string; value: string; checked: boolean; type: string }[]>([]);
  const snapshot = () => {
    const form = formRef.current; if (!form) return;
    draft.current = Array.from(form.elements as HTMLCollectionOf<HTMLInputElement>)
      .filter((el) => el.name && el.type !== "file")
      .map((el) => ({ name: el.name, value: el.value, checked: el.checked, type: el.type }));
  };
  // Restore the user's entered values after a failed save (they survive the React form reset).
  useEffect(() => {
    if (!state.error) return;
    const form = formRef.current; if (!form) return;
    for (const item of draft.current) {
      const el = form.elements.namedItem(item.name) as HTMLInputElement | null;
      if (!el || el.type === "file") continue;
      if (item.type === "checkbox" || item.type === "radio") el.checked = item.checked; else el.value = item.value;
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className={className} onSubmit={snapshot} onInput={() => setDirty(true)}>
      {children}
      <div className="os-save-bar">
        <SaveSubmit t={t} label={saveLabel ?? t("Save changes")} />
        <SaveStatus t={t} state={state} dirty={dirty} />
      </div>
    </form>
  );
}

function SaveSubmit({ t, label }: { t: (v: string) => string; label: string }) {
  const { pending } = useFormStatus();
  // Disabled while submitting → no accidental duplicate save. Fixed min-width avoids a layout jump.
  return <button className="os-primary-action" type="submit" disabled={pending} aria-busy={pending}>{pending ? `${t("Saving")}…` : label}</button>;
}

function SaveStatus({ t, state, dirty }: { t: (v: string) => string; state: SaveState; dirty: boolean }) {
  const { pending } = useFormStatus();
  if (pending) return <span className="os-save-status os-form-saving" role="status" aria-live="polite">{t("Saving")}…</span>;
  if (dirty) return <span className="os-save-status os-form-dirty" role="status" aria-live="polite">{t("Unsaved changes")}</span>;
  if (state.error) return <span className="os-save-status os-form-error" role="alert">✕ {t("Could not save changes")}</span>;
  if (state.saved) return <span className="os-save-status os-form-success" role="status" aria-live="polite">✓ {t("Changes saved")}</span>;
  return null;
}
