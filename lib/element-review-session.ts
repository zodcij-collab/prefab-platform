import type {ColumnMapping} from "./element-sync";
import type {ElementType} from "./elements";

export type PersistedElementReview={headerRow:number;columns:ColumnMapping;typeMappings:Record<string,ElementType>;excludedRows:number[];acceptedRepeatedCodes:string[]};

export function parseElementReview(value:string):Partial<PersistedElementReview>{try{return JSON.parse(value||"{}") as Partial<PersistedElementReview>;}catch{return{};}}
export function serializeElementReview(review:PersistedElementReview){return JSON.stringify(review);}
export function elementReviewUrl(projectId:string,sessionId:number,stage:"mapping"|"preview"){return `/portal/projects/${projectId}/elements/sync?session=${sessionId}&stage=${stage}`;}
export function elementReviewKey(sessionId:number,hasPreview:boolean){return `${sessionId||"new"}-${hasPreview?"preview":"mapping"}`;}
export function importApplyDecision(status:string,sourceHash:string,appliedHash?:string):"apply"|"already"|"applying"|"not-ready"{if(status==="Applied"||Boolean(appliedHash&&appliedHash===sourceHash))return"already";if(status==="Applying")return"applying";return status==="Preview"?"apply":"not-ready";}
