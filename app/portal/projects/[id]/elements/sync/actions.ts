"use server";
import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {requireUser} from "../../../../../../lib/auth";
import {canManageProjectElements} from "../../../../../../lib/permissions";
import {applyElementImport,beginElementImportApply,createElementImport,getAppliedElementImport,getElementImport,getProject,hasAppliedElementImport,listProjectElements,logActivity,persistElementImportReview,prepareElementImport,runTransaction} from "../../../../../../lib/repositories";
import {UPLOAD_MAX_FILE_BYTES} from "../../../../../../lib/upload-config";
import {analyzeWorkbookIssues,autoMapHeaders,compareElementRegister,inspectXlsx,mapWorkbookRowsWithOverrides,prepareWorksheet,summarizeValidation,syncFields,type ColumnMapping,type DuplicateCodeGroup,type SyncDiff,type UnknownTypeGroup,type ValidationIssue,type WorkbookSheet} from "../../../../../../lib/element-sync";
import {elementTypes,type ElementType} from "../../../../../../lib/elements";
import {elementReviewUrl,parseElementReview,serializeElementReview,type PersistedElementReview} from "../../../../../../lib/element-review-session";

export type MappingView={worksheet:string;headerRow:number;headerCandidates:number[];columns:Array<{key:string;label:string;samples:string[]}>;automatic:ColumnMapping;selected:ColumnMapping};
export type SyncActionState={error:string;sessionId?:number;diff?:SyncDiff;worksheets?:string[];mapping?:MappingView;validation?:ValidationIssue[];validationSummary?:Array<{code:string;count:number}>;unknownTypes?:UnknownTypeGroup[];duplicates?:DuplicateCodeGroup[];typeMappings?:Record<string,ElementType>;excludedRows?:number[];acceptedRepeatedCodes?:string[];duplicate?:boolean};
const value=(data:FormData,key:string,max=300)=>String(data.get(key)??"").trim().slice(0,max);
const mappingFromForm=(data:FormData,automatic:ColumnMapping)=>Object.fromEntries(syncFields.map((field)=>{const selected=value(data,`map_${field}`,120)||"__auto__";return[field,selected==="__auto__"?automatic[field]??"":selected==="__skip__"?"":selected];})) as ColumnMapping;

export async function loadXlsxSyncSessionState(projectId:string,sessionId:number):Promise<SyncActionState>{const user=await requireUser(),record=getElementImport(sessionId);if(!record||record.projectId!==projectId||!["Mapping","Preview"].includes(record.status)||!canManageProjectElements(user,projectId))return{error:"Import review session is no longer available."};try{const sheets=(JSON.parse(record.sourcePayloadJson||record.payloadJson) as {sheets:WorkbookSheet[]}).sheets,saved=parseElementReview(record.mappingJson),base=sheets.find((sheet)=>sheet.name===record.worksheetName)??sheets[0],sheet=prepareWorksheet(base,saved.headerRow??base.headerRow),automatic=autoMapHeaders(sheet.columns),selected=saved.columns??automatic,issues=analyzeWorkbookIssues(sheet,selected,saved.typeMappings??{},saved.excludedRows??[]),unresolved=issues.duplicates.filter((group)=>!(saved.acceptedRepeatedCodes??[]).includes(group.code.toLocaleLowerCase())),common={error:"",sessionId,worksheets:sheets.map((item)=>item.name),mapping:{worksheet:sheet.name,headerRow:sheet.headerRow,headerCandidates:sheet.headerCandidates,columns:sheet.columns.map(({key,label,samples})=>({key,label,samples})),automatic,selected},typeMappings:saved.typeMappings??{},excludedRows:saved.excludedRows??[],acceptedRepeatedCodes:saved.acceptedRepeatedCodes??[],unknownTypes:issues.unknownTypes,duplicates:unresolved};if(record.status==="Preview"){const candidates=JSON.parse(record.payloadJson) as Parameters<typeof compareElementRegister>[1],existing=listProjectElements(projectId).map((row)=>({...row}));return{...common,diff:compareElementRegister(existing,candidates),duplicate:hasAppliedElementImport(projectId,record.sourceHash),unknownTypes:[],duplicates:[]};}return common;}catch{return{error:"Import review session is no longer available."};}}

export async function previewXlsxSyncAction(_:SyncActionState,data:FormData):Promise<SyncActionState>{
  const user=await requireUser(),projectId=value(data,"projectId",100),project=getProject(projectId);
  if(!project||!canManageProjectElements(user,projectId))return{error:"You do not have permission to synchronize this project register."};
  const requestedSession=Number(value(data,"sessionId",30)),existingSession=requestedSession?getElementImport(requestedSession):undefined;
  let sessionId=requestedSession,sheets:WorkbookSheet[],record=existingSession,createdSession=false;
  if(record){
    if(record.projectId!==projectId||!["Mapping","Preview"].includes(record.status))return{error:"Import review session is no longer available."};
    try{sheets=(JSON.parse(record.sourcePayloadJson||record.payloadJson) as {sheets:WorkbookSheet[]}).sheets;}catch{return{error:"Import review session is no longer available."};}
  }else{
    const file=data.get("file");
    if(!(file instanceof File)||file.size===0)return{error:"Select an XLSX file."};
    if(file.size>UPLOAD_MAX_FILE_BYTES)return{error:"File exceeds the limit."};
    if(!file.name.toLocaleLowerCase().endsWith(".xlsx"))return{error:"Only XLSX workbooks are supported."};
    let inspected:Awaited<ReturnType<typeof inspectXlsx>>;
    try{inspected=await inspectXlsx(Buffer.from(await file.arrayBuffer()));}catch(error){return{error:error instanceof Error?error.message:"Unsupported or corrupt XLSX workbook."};}
    const applied=getAppliedElementImport(projectId,inspected.hash);if(applied)redirect(`/portal/projects/${projectId}/elements?success=sync-already&import=${applied.id}`);sheets=inspected.sheets;
    sessionId=createElementImport({projectId,originalFilename:file.name.replace(/[\\/]/g,"_").slice(0,180),sourceRevision:value(data,"sourceRevision",100),sourceHash:inspected.hash,worksheetName:sheets[0].name,mappingJson:"{}",payloadJson:JSON.stringify({sheets}),summaryJson:"{}",status:"Mapping",notes:value(data,"notes",1000),importedById:user.id,importedBy:user.name});
    createdSession=true;
    record=getElementImport(sessionId);
  }
  const worksheet=value(data,"worksheet",120),base=sheets.find((item)=>item.name===worksheet)??sheets[0],requestedHeader=Number(value(data,"headerRow",8)),sheet=prepareWorksheet(base,requestedHeader>0?requestedHeader:base.headerRow),automatic=autoMapHeaders(sheet.columns),selected=mappingFromForm(data,automatic),mapping:MappingView={worksheet:sheet.name,headerRow:sheet.headerRow,headerCandidates:sheet.headerCandidates,columns:sheet.columns.map(({key,label,samples})=>({key,label,samples})),automatic,selected},common={error:"",sessionId,worksheets:sheets.map((item)=>item.name),mapping};
  if(createdSession)redirect(elementReviewUrl(projectId,sessionId,"mapping"));
  if(value(data,"stage",20)!=="preview")return common;
  const initialIssues=analyzeWorkbookIssues(sheet,selected),savedReview=parseElementReview(record?.mappingJson??"{}"),typeMappings={...(savedReview.typeMappings??{}),...Object.fromEntries(initialIssues.unknownTypes.map((group)=>{const selectedType=value(data,`type_${encodeURIComponent(group.normalizedValue)}`,80);return[group.normalizedValue,elementTypes.includes(selectedType as ElementType)?selectedType:""];} ).filter((entry)=>entry[1]))} as Record<string,ElementType>,submittedExclusions=[...data.entries()].filter(([key,item])=>key.startsWith("exclude_row_")&&item==="on").map(([key])=>Number(key.slice("exclude_row_".length))).filter(Number.isInteger),excludedRows=submittedExclusions.length?submittedExclusions:(savedReview.excludedRows??[]),submittedRepeated=[...data.entries()].filter(([key,item])=>key.startsWith("accept_repeat_")&&item==="on").map(([key])=>decodeURIComponent(key.slice("accept_repeat_".length)).toLocaleLowerCase()),acceptedRepeatedCodes=[...new Set([...(savedReview.acceptedRepeatedCodes??[]),...submittedRepeated])],grouped=analyzeWorkbookIssues(sheet,selected,typeMappings,excludedRows),unresolvedRepeated=grouped.duplicates.filter((group)=>!acceptedRepeatedCodes.includes(group.code.toLocaleLowerCase())),review:PersistedElementReview={headerRow:sheet.headerRow,columns:selected,typeMappings,excludedRows,acceptedRepeatedCodes},reviewJson=serializeElementReview(review);
  persistElementImportReview(sessionId,projectId,sheet.name,reviewJson);
  if(grouped.unknownTypes.length||unresolvedRepeated.length)return{...common,unknownTypes:grouped.unknownTypes,duplicates:unresolvedRepeated,typeMappings,excludedRows,acceptedRepeatedCodes,error:"Resolve grouped import issues before synchronization."};
  const parsed=mapWorkbookRowsWithOverrides(sheet,selected,typeMappings,excludedRows);
  if(parsed.errors.length)return{...common,error:parsed.errors.some((issue)=>issue.code==="required_mapping")?"Required field is not mapped. Select the XLSX column manually.":"",validation:parsed.errors,validationSummary:summarizeValidation(parsed.errors)};
  const existing=listProjectElements(projectId).map((row)=>({...row})),diff=compareElementRegister(existing,parsed.candidates),summary={new:diff.newRows.length,changed:diff.changed.length,unchanged:diff.unchanged.length,missing:diff.missing.length,conflicts:diff.conflicts.length,installedAffected:diff.installedAffected};
  prepareElementImport(sessionId,projectId,{worksheetName:sheet.name,mappingJson:reviewJson,payloadJson:JSON.stringify(parsed.candidates),summaryJson:JSON.stringify(summary)});
  logActivity({userId:user.id,actor:user.name,action:"Previewed element register synchronization",entityType:"project",entityId:projectId,details:`Import #${sessionId} · ${record!.originalFilename}`});
  redirect(elementReviewUrl(projectId,sessionId,"preview"));
}

export async function applyXlsxSyncAction(data:FormData){
  const user=await requireUser(),projectId=value(data,"projectId",100),importId=Number(value(data,"importId",30)),record=getElementImport(importId);
  if(!record||record.projectId!==projectId||!canManageProjectElements(user,projectId))throw new Error("Synchronization is not authorized.");
  if(record.status==="Applied")redirect(`/portal/projects/${projectId}/elements?success=sync-already&import=${record.id}`);
  const previouslyApplied=getAppliedElementImport(projectId,record.sourceHash);
  if(previouslyApplied)redirect(`/portal/projects/${projectId}/elements?success=sync-already&import=${previouslyApplied.id}`);
  if(record.status==="Applying")redirect(`/portal/projects/${projectId}/elements?success=sync-applying&import=${record.id}`);
  if(record.status!=="Preview")throw new Error("Synchronization is not ready to apply.");
  const all=JSON.parse(record.payloadJson) as Array<{row?:number;matchedElementId?:number;code:string;elementType:string;floor:string;zone:string;drawingRef:string;description:string;weight:number|null;length:number|null;width:number|null;height:number|null;supplier:string;plannedDeliveryDate:string}>,existing=listProjectElements(projectId),diff=compareElementRegister(existing,all),conflictRows=new Set(diff.conflicts.map((item)=>item.incoming.row)),rows=all.filter((row)=>!conflictRows.has(row.row)||data.get(`conflict_${row.row}`)==="New"),missingDecisions=Object.fromEntries(diff.missing.map((row)=>[String(row.id),String(data.get(`missing_${row.id}`)??"Keep")]));
  const result:{outcome:"applied"|"already";appliedImportId:number}={outcome:"applied",appliedImportId:importId};
  runTransaction(()=>{const current=getElementImport(importId),existingApplied=getAppliedElementImport(projectId,record.sourceHash);if(current?.status==="Applied"){result.outcome="already";result.appliedImportId=current.id;return;}if(existingApplied){result.outcome="already";result.appliedImportId=existingApplied.id;return;}if(!current||current.status!=="Preview"||beginElementImportApply(importId,projectId).changes!==1)throw new Error("Synchronization is no longer ready to apply.");applyElementImport(importId,projectId,record.sourceRevision,rows,missingDecisions,user);logActivity({userId:user.id,actor:user.name,action:"Applied element register synchronization",entityType:"project",entityId:projectId,details:`Import #${importId} · ${record.originalFilename}`});});
  revalidatePath(`/portal/projects/${projectId}/elements`);revalidatePath(`/portal/projects/${projectId}/elements/sync`);
  redirect(result.outcome==="already"?`/portal/projects/${projectId}/elements?success=sync-already&import=${result.appliedImportId}`:`/portal/projects/${projectId}/elements?success=sync`);
}
