"use server";

export type ContactState={status:"idle"|"error"|"success";code:""|"invalid"|"spam"|"notConfigured"|"sent"};
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const value=(data:FormData,key:string,max:number)=>String(data.get(key)??"").trim().slice(0,max);

export async function submitContactAction(_state:ContactState,data:FormData):Promise<ContactState>{
  const startedAt=Number(data.get("startedAt"));
  if(value(data,"website",200)||!Number.isFinite(startedAt)||Date.now()-startedAt<2500)return{status:"error",code:"spam"};
  const payload={name:value(data,"name",120),company:value(data,"company",160),email:value(data,"email",254).toLowerCase(),phone:value(data,"phone",60),location:value(data,"location",200),message:value(data,"message",3000)};
  if(!payload.name||!EMAIL.test(payload.email)||!payload.location||!payload.message||data.get("consent")!=="on")return{status:"error",code:"invalid"};
  const endpoint=process.env.CONTACT_WEBHOOK_URL?.trim();
  if(!endpoint)return{status:"error",code:"notConfigured"};
  let url:URL;try{url=new URL(endpoint);}catch{return{status:"error",code:"notConfigured"};}
  if(url.protocol!=="https:")return{status:"error",code:"notConfigured"};
  try{const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...payload,source:"prefab.lv",submittedAt:new Date().toISOString()}),cache:"no-store",signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error("Delivery failed");return{status:"success",code:"sent"};}catch{return{status:"error",code:"notConfigured"};}
}
