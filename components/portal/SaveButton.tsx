"use client";
import { useFormStatus } from "react-dom";
import { portalText, type PortalLanguage } from "../../data/portal-i18n";

// Lightweight pending-aware submit button for surfaces that stay as a plain `<form action=>`
// (auto-save toggles, one-click "mark" actions, and simple in-place saves). Drop it in place of a
// bare submit <button>: while the enclosing form is submitting it shows "Saving…", is disabled
// (no duplicate submission) and marks aria-busy — giving auto-save actions the required visible
// progress feedback without converting the action to useActionState.
export function SaveButton({ language, label, savingLabel, className = "os-primary-action", title }: {
  language: PortalLanguage;
  label: string;
  savingLabel?: string;
  className?: string;
  title?: string;
}) {
  const { pending } = useFormStatus();
  const t = (v: string) => portalText(language, v);
  return <button className={className} type="submit" disabled={pending} aria-busy={pending} title={title}>{pending ? (savingLabel ?? `${t("Saving")}…`) : label}</button>;
}
