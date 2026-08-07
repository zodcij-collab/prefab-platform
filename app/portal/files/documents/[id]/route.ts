import { requireUser } from "../../../../../lib/auth";
import { getProjectDocument } from "../../../../../lib/repositories";
import { contentDisposition,readStoredFile } from "../../../../../lib/storage";

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){await requireUser();const {id}=await params;const document=getProjectDocument(Number(id));if(!document)return new Response("Not found",{status:404});try{const file=await readStoredFile(document.storedPath);return new Response(file,{headers:{"Content-Type":document.mimeType,"Content-Length":String(file.length),"Content-Disposition":contentDisposition(document.originalFilename),"X-Content-Type-Options":"nosniff","Cache-Control":"private, no-store"}});}catch{return new Response("File unavailable",{status:404});}}
