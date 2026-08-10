"use client";

import {useRef,useState} from "react";
import type {PortalLanguage} from "../../data/portal-i18n";
import {portalText} from "../../data/portal-i18n";

export function DailyReportExportMenu({reportId,project,date,language}:{reportId:number;project:string;date:string;language:PortalLanguage}){
  const t=(value:string)=>portalText(language,value),url=`/portal/reports/${reportId}/pdf`,[message,setMessage]=useState(""),[fallbackUrl,setFallbackUrl]=useState(""),busy=useRef(false);
  const subject=t("Daily Report e-mail subject").replace("{project}",project).replace("{date}",date).replace("{number}",String(reportId));
  const body=t("Daily Report e-mail body").replace("{project}",project).replace("{date}",date).replace("{number}",String(reportId));
  async function pdf(){const response=await fetch(url,{credentials:"same-origin"});if(!response.ok)throw new Error();return response.blob();}
  function reset(){setMessage("");setFallbackUrl("");}
  function print(){
    reset();window.location.assign(`/portal/reports/${reportId}/print`);
  }
  async function email(){
    if(busy.current)return;busy.current=true;reset();setMessage(t("Preparing the PDF and e-mail draft…"));
    try{const blob=await pdf();download(blob,`PREFAB-Daily-Report-${reportId}.pdf`);setMessage(t("PDF downloaded. Attach it manually to the e-mail draft before sending."));openMailDraft(subject,body);}
    catch{setMessage(t("Unable to prepare the PDF and e-mail draft."));setFallbackUrl(url);}
    finally{busy.current=false;}
  }
  async function share(){
    reset();
    try{
      const blob=await pdf(),file=new File([blob],`PREFAB-Daily-Report-${reportId}.pdf`,{type:"application/pdf"});
      if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){await navigator.share({title:subject,text:body,files:[file]});setMessage(t("Share sheet opened."));return;}
      download(blob,file.name);setMessage(t("PDF downloaded. Share it with your preferred application."));
    }catch(error){if((error as DOMException).name!=="AbortError")setMessage(t("Unable to prepare the PDF for sharing."));}
  }
  return <div className="os-report-export"><details><summary className="os-secondary-action">{t("Export / Share")}</summary><div className="os-report-export-menu" role="menu"><a href={url} role="menuitem">{t("Download PDF")}</a><button type="button" role="menuitem" onClick={print}>{t("Print")}</button><button type="button" role="menuitem" onClick={email}>{t("E-mail")}</button><button type="button" role="menuitem" onClick={share}>{t("Share")}</button></div></details>{message&&<small aria-live="polite">{message}{fallbackUrl&&<> <a href={fallbackUrl} target="_blank" rel="noreferrer">{t("Open printable PDF")}</a></>}</small>}</div>;
}
function download(blob:Blob,name:string){const href=URL.createObjectURL(blob),anchor=document.createElement("a");anchor.href=href;anchor.download=name;document.body.append(anchor);anchor.click();anchor.remove();URL.revokeObjectURL(href);}
function openMailDraft(subject:string,body:string){const anchor=document.createElement("a");anchor.href=`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;anchor.style.display="none";document.body.append(anchor);anchor.click();anchor.remove();}
