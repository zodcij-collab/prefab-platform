"use client";
import {useRef} from "react";
import {useFormStatus} from "react-dom";
import {portalText,type PortalLanguage} from "../../data/portal-i18n";

type Props={action:(formData:FormData)=>void|Promise<void>;itemLabel:string;itemType:string;fields:Record<string,string|number>;language?:PortalLanguage;triggerLabel?:string};
function DeleteButton({label,pendingLabel}:{label:string;pendingLabel:string}){const {pending}=useFormStatus();return <button className="os-confirm-delete" type="submit" disabled={pending}>{pending?pendingLabel:label}</button>}
export function DestructiveAction({action,itemLabel,itemType,fields,language="en",triggerLabel}:Props){
  const dialogRef=useRef<HTMLDialogElement>(null),t=(value:string)=>portalText(language,value);
  return <><button className="os-delete-trigger" type="button" onClick={()=>dialogRef.current?.showModal()}>{triggerLabel??t("Delete")}</button><dialog className="os-confirm-dialog" ref={dialogRef} onCancel={()=>dialogRef.current?.close()}><div className="os-confirm-dialog-body"><span className="os-confirm-eyebrow">{t("Permanent deletion")}</span><h2>{t("Delete")} {itemType}?</h2><strong>{itemLabel}</strong><p>{t("This action cannot be undone.")}</p><form action={action} className="os-confirm-actions">{Object.entries(fields).map(([name,value])=><input key={name} type="hidden" name={name} value={value}/>)}<button className="os-confirm-cancel" type="button" onClick={()=>dialogRef.current?.close()}>{t("Cancel")}</button><DeleteButton label={t("Delete permanently")} pendingLabel={t("Deleting…")}/></form></div></dialog></>;
}
