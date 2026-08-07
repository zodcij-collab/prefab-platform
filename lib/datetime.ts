export const APP_TIMEZONE = process.env.APP_TIMEZONE?.trim() || "Europe/Riga";
function utcDate(value:string){const normalized=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)?`${value.replace(" ","T")}Z`:value;const date=new Date(normalized);if(Number.isNaN(date.getTime()))throw new Error("Invalid timestamp.");return date;}
function format(value:string,options:Intl.DateTimeFormatOptions){return new Intl.DateTimeFormat("en-GB",{timeZone:APP_TIMEZONE,...options}).format(utcDate(value));}
export function formatAppDate(value:string){return format(value,{day:"2-digit",month:"short",year:"numeric"});}
export function formatAppTime(value:string){return format(value,{hour:"2-digit",minute:"2-digit",hour12:false});}
export function formatAppDateTime(value:string){return format(value,{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false});}
export function appToday(){const parts=new Intl.DateTimeFormat("en-GB",{timeZone:APP_TIMEZONE,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const get=(type:Intl.DateTimeFormatPartTypes)=>parts.find((part)=>part.type===type)?.value??"";return `${get("year")}-${get("month")}-${get("day")}`;}
