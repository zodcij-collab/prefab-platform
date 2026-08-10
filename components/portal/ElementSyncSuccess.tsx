"use client";
import {useSearchParams} from "next/navigation";
import {portalText,type PortalLanguage} from "../../data/portal-i18n";

export function ElementSyncSuccess({language}:{language:PortalLanguage}){
  const status=useSearchParams().get("success"),message=status==="sync"?"Element register synchronized successfully.":status==="sync-already"?"This synchronization has already been applied.":status==="sync-applying"?"Synchronization is already being applied.":"";
  return message?<p className="os-form-success" role="status">{portalText(language,message)}</p>:null;
}
