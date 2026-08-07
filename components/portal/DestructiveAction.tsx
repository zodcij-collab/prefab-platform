"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";

type DestructiveActionProps = {
  action: (formData: FormData) => void | Promise<void>;
  itemLabel: string;
  itemType: string;
  fields: Record<string, string | number>;
};

function DeleteButton() {
  const { pending } = useFormStatus();
  return <button className="os-confirm-delete" type="submit" disabled={pending}>{pending ? "Deleting…" : "Delete permanently"}</button>;
}

export function DestructiveAction({ action, itemLabel, itemType, fields }: DestructiveActionProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return <>
    <button className="os-delete-trigger" type="button" onClick={() => dialogRef.current?.showModal()}>Delete</button>
    <dialog className="os-confirm-dialog" ref={dialogRef} onCancel={() => dialogRef.current?.close()}>
      <div className="os-confirm-dialog-body">
        <span className="os-confirm-eyebrow">Permanent deletion</span>
        <h2>Delete {itemType}?</h2>
        <strong>{itemLabel}</strong>
        <p>This action cannot be undone.</p>
        <form action={action} className="os-confirm-actions">
          {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value}/>) }
          <button className="os-confirm-cancel" type="button" onClick={() => dialogRef.current?.close()}>Cancel</button>
          <DeleteButton/>
        </form>
      </div>
    </dialog>
  </>;
}
