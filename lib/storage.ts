import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { extname, join, resolve } from "node:path";
import { UPLOAD_MAX_FILE_BYTES } from "./upload-config.ts";

export type StorageArea = "documents" | "photos" | "issues";
const root = resolve(process.cwd(), "storage", "uploads");
const documentTypes: Record<string,string[]> = { ".pdf":["application/pdf"], ".docx":["application/vnd.openxmlformats-officedocument.wordprocessingml.document"], ".xlsx":["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], ".csv":["text/csv","application/vnd.ms-excel"], ".txt":["text/plain"], ".jpg":["image/jpeg"], ".jpeg":["image/jpeg"], ".png":["image/png"] };
const photoTypes: Record<string,string[]> = { ".jpg":["image/jpeg"], ".jpeg":["image/jpeg"], ".png":["image/png"], ".webp":["image/webp"] };
// Site-capture attachments: phone photos + short clips + supporting PDF documents (drawing
// extracts, specs, deviation acts). No transcoding — stored as uploaded.
const issueTypes: Record<string,string[]> = { ".jpg":["image/jpeg"], ".jpeg":["image/jpeg"], ".png":["image/png"], ".webp":["image/webp"], ".mp4":["video/mp4"], ".webm":["video/webm"], ".mov":["video/quicktime"], ".pdf":["application/pdf"] };
const IMAGE_EXTENSIONS = new Set([".jpg",".jpeg",".png",".webp"]);
export function issueMediaKind(extension: string): "image" | "video" | "document" {
  const ext = extension.toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (ext === ".pdf") return "document";
  return "video";
}

function allowedTypes(area: StorageArea) { return area === "photos" ? photoTypes : area === "issues" ? issueTypes : documentTypes; }
export function validateUpload(file: File, area: StorageArea) {
  const extension=extname(file.name).toLowerCase(); const allowed=allowedTypes(area);
  if(!file.name||file.size<=0||file.size>UPLOAD_MAX_FILE_BYTES||!allowed[extension]?.includes(file.type)) throw new Error(`Unsupported ${area === "documents" ? "document" : "media"} file. Maximum size is ${UPLOAD_MAX_FILE_BYTES / 1024 / 1024} MB.`);
  return extension;
}
function validSignature(bytes:Buffer,extension:string){if(extension===".pdf")return bytes.subarray(0,5).toString()==="%PDF-";if([".jpg",".jpeg"].includes(extension))return bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;if(extension===".png")return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));if(extension===".webp")return bytes.subarray(0,4).toString()==="RIFF"&&bytes.subarray(8,12).toString()==="WEBP";if([".mp4",".mov"].includes(extension))return bytes.subarray(4,8).toString("latin1")==="ftyp";if(extension===".webm")return bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));if([".docx",".xlsx"].includes(extension))return bytes[0]===0x50&&bytes[1]===0x4b;if([".txt",".csv"].includes(extension))return !bytes.subarray(0,4096).includes(0);return false;}
export async function storeUpload(file: File, area: StorageArea) { const extension=validateUpload(file,area); const bytes=Buffer.from(await file.arrayBuffer());if(!validSignature(bytes,extension))throw new Error("File content does not match its declared type.");const storedName=`${randomUUID()}${extension}`; const relative=`${area}/${storedName}`; const directory=join(root,area); await mkdir(directory,{recursive:true}); await writeFile(join(directory,storedName),bytes,{flag:"wx"}); return {storedPath:relative,storedName}; }
// Persist a client-captured drawing snapshot (a PNG data URL). Used only for the optional
// 'drawing-location' crop embedded in the Issue PDF. Validated by magic bytes + size cap, so a
// malformed or oversized payload is rejected rather than stored. Returns null when the payload
// is absent/invalid — callers treat the snapshot as best-effort and never fail on its absence.
const SNAPSHOT_MAX_BYTES = 3 * 1024 * 1024;
export async function storeSnapshotPng(dataUrl: string): Promise<{ storedPath: string; fileSize: number } | null> {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec((dataUrl ?? "").trim());
  if (!match) return null;
  let bytes: Buffer;
  try { bytes = Buffer.from(match[1], "base64"); } catch { return null; }
  if (bytes.length <= 0 || bytes.length > SNAPSHOT_MAX_BYTES || !validSignature(bytes, ".png")) return null;
  const storedName = `${randomUUID()}.png`, relative = `issues/${storedName}`, directory = join(root, "issues");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, storedName), bytes, { flag: "wx" });
  return { storedPath: relative, fileSize: bytes.length };
}
function safePath(relative:string){const target=resolve(root,relative);if(!target.startsWith(`${root}\\`)&&!target.startsWith(`${root}/`))throw new Error("Invalid stored file path.");return target;}
export async function readStoredFile(relative:string){return readFile(safePath(relative));}
export async function removeStoredFile(relative:string){if(!relative)return;try{await unlink(safePath(relative));}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}}
export function contentDisposition(name:string){const clean=name.replace(/[\r\n\\/]/g,"_").slice(0,180)||"download";const ascii=clean.replace(/[^\x20-\x7e]/g,"_").replace(/"/g,"_");return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`;}
