"use client";
import {useActionState} from "react";
import type {PortalLanguage} from "../../data/portal-i18n";
import {portalText} from "../../data/portal-i18n";
import type {ApprovalActionState} from "../../app/portal/reports/new/actions";

export function ReportApprovalForm({action,reportId,language}:{action:(state:ApprovalActionState,data:FormData)=>Promise<ApprovalActionState>;reportId:number;language:PortalLanguage}){
  const [state,formAction,pending]=useActionState(action,{error:""});
  const t=(value:string)=>portalText(language,value);
  return <form className="os-print-hide" action={formAction}>
    <input type="hidden" name="reportId" value={reportId}/>
    <button className="os-primary-action" type="submit" disabled={pending}>{pending?t("Approving report…"):t("Approve report")}</button>
    {state.error&&<small className="os-form-error" role="alert">{t(state.error)}</small>}
  </form>;
}
