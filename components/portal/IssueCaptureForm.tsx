"use client";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { portalText, type PortalLanguage } from "../../data/portal-i18n";
import { ISSUE_CAPTURE_MAX_FILES, mergePendingFiles, removePendingFile } from "../../lib/issues";
import { captureIssueAction, type CaptureState } from "../../app/portal/projects/[id]/issues/actions";

// Mobile-first quick site capture: photo/video + a big dictation-friendly description → Save.
// Selected files are held in client state (a native <input> can't remove one file); the input's
// FileList is rebuilt via DataTransfer on every change, so the submitted payload always matches
// the visible list. Removing a pending file uploads nothing for it. Persists only on Save; the
// submit button disables while pending so a double-tap cannot create two issues.
export function IssueCaptureForm({ projectId, language }: { projectId: string; language: PortalLanguage }) {
  const t = (v: string) => portalText(language, v);
  const [state, formAction, pending] = useActionState<CaptureState, FormData>(captureIssueAction, { error: "" });
  const [files, setFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reflect the client list back into the real <input> so the form submits exactly these files.
  const sync = (next: File[]) => {
    const dt = new DataTransfer();
    next.forEach((f) => dt.items.add(f));
    if (inputRef.current) inputRef.current.files = dt.files;
    setFiles(next);
  };
  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    sync(mergePendingFiles(files, Array.from(event.target.files ?? []), ISSUE_CAPTURE_MAX_FILES));
  };
  const remove = (index: number) => sync(removePendingFile(files, index));

  // Object-URL previews for image files only; revoked when the selection changes / unmounts.
  const previews = useMemo(() => files.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : "")), [files]);
  useEffect(() => () => { previews.forEach((url) => url && URL.revokeObjectURL(url)); }, [previews]);

  return (
    <form action={formAction} className="os-capture-form">
      <input type="hidden" name="projectId" value={projectId} />
      {state.error && <p className="os-form-error" role="alert">{t(state.error)}</p>}

      <div className="os-capture-intent" role="radiogroup" aria-label={t("What is this?")}>
        <label><input type="radio" name="intent" value="Defect" defaultChecked /> {t("Defect / Issue")}</label>
        <label><input type="radio" name="intent" value="Task" /> {t("Task")}</label>
      </div>

      <label className="os-capture-media">
        <span className="os-capture-media-btn">📷 {t("Add photos / video")}</span>
        <input ref={inputRef} type="file" name="media" accept="image/*,video/*,application/pdf" multiple onChange={onPick} />
        <small>{files.length > 0 ? `${files.length} / ${ISSUE_CAPTURE_MAX_FILES} ${t("selected")}` : t("Take a photo or choose from your device")}</small>
      </label>

      {files.length > 0 && <ul className="os-pending-media">{files.map((file, index) => (
        <li key={`${file.name}-${file.size}-${file.lastModified}`} className="os-pending-item">
          {previews[index]
            // eslint-disable-next-line @next/next/no-img-element
            ? <img className="os-pending-thumb" src={previews[index]} alt={file.name} />
            : <span className="os-pending-icon" aria-hidden="true">{file.type === "application/pdf" ? "📄" : "🎬"}</span>}
          <span className="os-pending-name">{file.name}</span>
          <button type="button" className="os-pending-remove" onClick={() => remove(index)} aria-label={`${t("Remove")}: ${file.name}`}>×</button>
        </li>
      ))}</ul>}

      <label className="os-capture-field">
        <span>{t("Description")}</span>
        <textarea name="details" rows={5} maxLength={8000} placeholder={t("Describe the issue — you can use voice dictation")} autoCapitalize="sentences" />
      </label>

      <details className="os-capture-more">
        <summary>{t("Add a short title (optional)")}</summary>
        <label className="os-capture-field"><input name="title" maxLength={200} placeholder={t("Short title")} /></label>
      </details>

      <p className="os-form-hint">{t("Project, author and time are recorded automatically. You can classify this later.")}</p>
      <div className="os-form-actions">
        <button type="submit" className="os-primary-action os-primary-action-dark os-capture-save" disabled={pending}>{pending ? `${t("Saving")}…` : t("Save capture")}</button>
      </div>
    </form>
  );
}
