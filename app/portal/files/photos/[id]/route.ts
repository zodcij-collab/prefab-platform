import { requireUser } from "../../../../../lib/auth";
import { getProjectPhoto } from "../../../../../lib/repositories";
import { contentDisposition,readStoredFile } from "../../../../../lib/storage";

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){await requireUser();const {id}=await params;const photo=getProjectPhoto(Number(id));if(!photo?.storedPath)return new Response("Not found",{status:404});try{const file=await readStoredFile(photo.storedPath);return new Response(file,{headers:{"Content-Type":photo.mimeType,"Content-Length":String(file.length),"Content-Disposition":contentDisposition(photo.originalFilename),"X-Content-Type-Options":"nosniff","Cache-Control":"private, no-store"}});}catch{return new Response("File unavailable",{status:404});}}
