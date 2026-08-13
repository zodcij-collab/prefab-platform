export const elementTypes=["Wall panel","Hollow core slab","Solid slab","Beam","Column","Stair","Balcony","Parapet","Landing","Steel element","Other"] as const;
export const elementStatuses=["Planned","Expected","Delivered","On site","Installed","Issue","Rejected / Hold","Replaced"] as const;
export type ElementType=(typeof elementTypes)[number];
export type ElementStatus=(typeof elementStatuses)[number];
export type ElementSummaryInput={id:number;code:string;elementType:string;floor:string;zone:string;status:string};
// Natural / numeric comparison of element marks so that MARK-9 sorts before MARK-10 and
// DPP-110-2 before DPP-110-10. One reusable comparator for every physical-element list —
// splits each mark into alternating text/number runs and compares number runs numerically.
// Case-insensitive; deterministic (no locale surprises).
export function compareMarks(a:string,b:string):number{
  const ax=String(a).toLowerCase().match(/\d+|\D+/g)??[];
  const bx=String(b).toLowerCase().match(/\d+|\D+/g)??[];
  const n=Math.min(ax.length,bx.length);
  for(let i=0;i<n;i++){
    const as=ax[i],bs=bx[i],aNum=as.charCodeAt(0)<=57&&as.charCodeAt(0)>=48,bNum=bs.charCodeAt(0)<=57&&bs.charCodeAt(0)>=48;
    if(aNum&&bNum){const d=Number(as)-Number(bs);if(d)return d<0?-1:1;}
    else if(as!==bs)return as<bs?-1:1;
  }
  return ax.length-bx.length;
}
// Order physical elements the way a planner reads them: by floor, then zone, then type,
// then natural mark, with the immutable id as a stable final tiebreak for repeated marks.
export function compareElementsByMark<T extends {floor:string;zone:string;elementType:string;code:string;id:number}>(a:T,b:T):number{
  return compareMarks(a.floor,b.floor)||compareMarks(a.zone,b.zone)||(a.elementType<b.elementType?-1:a.elementType>b.elementType?1:0)||compareMarks(a.code,b.code)||a.id-b.id;
}

export function isInstallableStatus(status:string){return ["Planned","Expected","Delivered","On site"].includes(status);}

// Overall project erection progress display. The calculation keeps full precision; only the
// LABEL is rounded. Rules: exactly zero installed → "0%"; a positive but sub-1% fraction
// shows one decimal (e.g. 1/671 → "0.1%") so the UI never implies "nothing installed"; a
// value that rounds below 0.1% shows "<0.1%"; ≥1% shows a whole percent.
export function formatProgressLabel(installed:number,total:number):string{
  if(total<=0||installed<=0)return "0%";
  const pct=installed/total*100;
  if(pct>=100)return "100%";
  if(pct<1){const one=Math.round(pct*10)/10;return one<0.1?"<0.1%":`${one}%`;}
  return `${Math.round(pct)}%`;
}
export function validateInstallationSelection(rows:ElementSummaryInput[],ids:number[]){const unique=[...new Set(ids)],byId=new Map(rows.map((row)=>[row.id,row]));if(unique.length!==ids.length)return{valid:false,error:"Duplicate element selection."};for(const id of unique){const row=byId.get(id);if(!row||!isInstallableStatus(row.status))return{valid:false,error:"Selected element is no longer available for installation."};}return{valid:true,error:""};}
export function validateBulkOperationalStatus(rows:ElementSummaryInput[],ids:number[],nextStatus:string){if(!["Expected","Delivered","On site"].includes(nextStatus))return{valid:false,error:"Invalid bulk status."};const unique=[...new Set(ids)],byId=new Map(rows.map((row)=>[row.id,row]));if(!unique.length||unique.length!==ids.length)return{valid:false,error:"Invalid element selection."};for(const id of unique){const row=byId.get(id);if(!row||row.status==="Installed"||["Issue","Rejected / Hold","Replaced"].includes(row.status))return{valid:false,error:"Selected element requires individual review."};}return{valid:true,error:""};}
export function elementRoleCapabilities(role:string){return{view:role!=="Employee",operate:["Foreman","Project Manager","Administrator","Director"].includes(role),manage:["Project Manager","Administrator","Director"].includes(role),correct:["Project Manager","Administrator","Director"].includes(role)};}
export function filterElements<T extends ElementSummaryInput>(rows:T[],filters:{q?:string;floor?:string;zone?:string;type?:string;status?:string}){const q=(filters.q??"").trim().toLocaleLowerCase();return rows.filter((row)=>(!q||`${row.code} ${row.elementType}`.toLocaleLowerCase().includes(q))&&(!filters.floor||row.floor===filters.floor)&&(!filters.zone||row.zone===filters.zone)&&(!filters.type||row.elementType===filters.type)&&(!filters.status||row.status===filters.status));}
export function elementProgress(rows:ElementSummaryInput[]){const active=rows.filter((row)=>row.status!=="Replaced"),installed=active.filter((row)=>row.status==="Installed").length,total=active.length;return{total,installed,remaining:total-installed,percentage:total?Math.round(installed/total*100):0,byType:groupProgress(active,"elementType"),byFloor:groupProgress(active,"floor")};}
function groupProgress(rows:ElementSummaryInput[],key:"elementType"|"floor"){return [...new Set(rows.map((row)=>row[key]||"—"))].sort().map((value)=>{const group=rows.filter((row)=>(row[key]||"—")===value),installed=group.filter((row)=>row.status==="Installed").length;return{value,total:group.length,installed};});}
export const importHeaders=["Element code","Element type","Floor","Zone","Drawing/reference","Description","Weight","Length","Width","Height","Supplier","Planned delivery date"] as const;
export type ElementImportCandidate={row:number;code:string;elementType:string;floor:string;zone:string;drawingRef:string;description:string;weight:number|null;length:number|null;width:number|null;height:number|null;supplier:string;plannedDeliveryDate:string;sourceKey?:string;matchedElementId?:number};
// Kept for backward-compatible callers; existing marks are no longer uniqueness blockers.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function parseElementCsv(csv:string,_existingCodes:string[]=[]){const lines=csv.replace(/^\uFEFF/,"").split(/\r?\n/).filter((line)=>line.trim()),errors:string[]=[],candidates:ElementImportCandidate[]=[];if(!lines.length)return{candidates,errors:["Import file is empty."]};const headers=parseCsvLine(lines[0]);if(headers[0]!=="Element code")return{candidates,errors:["The first column must be Element code."]};for(let i=1;i<lines.length;i++){const cells=parseCsvLine(lines[i]),code=(cells[0]??"").trim(),elementType=(cells[1]??"").trim();if(!code){errors.push(`Row ${i+1}: Element code is required.`);continue;}if(!elementTypes.includes(elementType as ElementType)){errors.push(`Row ${i+1}: Invalid element type.`);continue;}const number=(index:number)=>{const value=(cells[index]??"").trim();if(!value)return null;const parsed=Number(value);return Number.isFinite(parsed)&&parsed>=0?parsed:NaN;},weight=number(6),length=number(7),width=number(8),height=number(9);if([weight,length,width,height].some((value)=>Number.isNaN(value))){errors.push(`Row ${i+1}: Dimensions and weight must be non-negative numbers.`);continue;}const date=(cells[11]??"").trim();if(date&&!/^\d{4}-\d{2}-\d{2}$/.test(date)){errors.push(`Row ${i+1}: Planned delivery date must use YYYY-MM-DD.`);continue;}candidates.push({row:i+1,code,elementType,floor:(cells[2]??"").trim(),zone:(cells[3]??"").trim(),drawingRef:(cells[4]??"").trim(),description:(cells[5]??"").trim(),weight,length,width,height,supplier:(cells[10]??"").trim(),plannedDeliveryDate:date});}return{candidates,errors};}
function parseCsvLine(line:string){const result:string[]=[],pattern=/(?:^|,)(?:"((?:[^"]|"")*)"|([^",]*))/g;let match:RegExpExecArray|null;while((match=pattern.exec(line)))result.push((match[1]??match[2]??"").replace(/""/g,'"'));return result;}
