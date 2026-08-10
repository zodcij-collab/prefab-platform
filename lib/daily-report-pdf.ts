import PDFDocument from "pdfkit";
import {createCanvas,loadImage} from "@napi-rs/canvas";
import {join} from "node:path";
import type {PortalLanguage} from "../data/portal-i18n.ts";
import {portalText} from "../data/portal-i18n.ts";
import type {AttendanceEntry,DailyReport,ProjectElement,ProjectPhoto} from "./repositories.ts";
import {formatAppDateTime} from "./datetime.ts";
import {readStoredFile} from "./storage.ts";

const ORANGE="#f26522",INK="#171717",MUTED="#686868",LINE="#d8d8d8",PAPER="#ffffff";
const regularFont=join(process.cwd(),"node_modules","dejavu-fonts-ttf","ttf","DejaVuSans.ttf");
const boldFont=join(process.cwd(),"node_modules","dejavu-fonts-ttf","ttf","DejaVuSans-Bold.ttf");

export type DailyReportPdfRecord={report:DailyReport;attendance:AttendanceEntry[];photos:ProjectPhoto[];elements?:ProjectElement[];approvedBy:string};
type SingleReportPdfInput=Omit<DailyReportPdfRecord,"approvedBy">&{approvedBy?:string;language:PortalLanguage};
type ArchivePdfInput={project:string;period:string;records:DailyReportPdfRecord[];language:PortalLanguage};

export async function generateDailyReportPdf(input:SingleReportPdfInput):Promise<Buffer>{
  return generateDocument({records:[{report:input.report,attendance:input.attendance,photos:input.photos,elements:input.elements??[],approvedBy:input.approvedBy??""}],language:input.language});
}

export async function generateDailyReportArchivePdf(input:ArchivePdfInput):Promise<Buffer>{
  return generateDocument({...input,cover:true});
}

async function generateDocument(input:{records:DailyReportPdfRecord[];language:PortalLanguage;cover?:boolean;project?:string;period?:string}):Promise<Buffer>{
  const t=(value:string)=>portalText(input.language,value),generatedAt=new Date().toISOString();
  const doc=new PDFDocument({size:"A4",margins:{top:56,bottom:42,left:38,right:38},bufferPages:true,info:{Title:input.cover?`${t("Daily Reports archive")} - ${input.project} - ${input.period}`:`${t("Daily report")} #${input.records[0]?.report.id??""}`,Author:"PREFAB.LV",Subject:input.project??input.records[0]?.report.project??""}});
  const chunks:Buffer[]=[];doc.on("data",(chunk:Buffer)=>chunks.push(chunk));
  const done=new Promise<Buffer>((resolve,reject)=>{doc.on("end",()=>resolve(Buffer.concat(chunks)));doc.on("error",reject);});
  doc.registerFont("Regular",regularFont).registerFont("Bold",boldFont);
  const font=(_value:string,bold=false)=>doc.font(bold?"Bold":"Regular");
  const addHeader=()=>{font("PREFAB.",true).fontSize(9).fillColor(INK).text("PREFAB.",38,20,{continued:true,lineBreak:false});font("LV",true).fillColor(ORANGE).text("LV",{lineBreak:false});doc.fillColor(ORANGE).rect(38,39,519,1.5).fill();};
  doc.on("pageAdded",()=>{addHeader();doc.y=52;});
  addHeader();doc.y=56;
  if(input.cover)renderCover(doc,input.records,input.project??"",input.period??"",generatedAt,t,font);
  for(let index=0;index<input.records.length;index++){
    if(input.cover||index>0)doc.addPage();
    await renderReport(doc,input.records[index],generatedAt,t,font);
  }
  addFooters(doc,generatedAt,t,font);
  doc.end();return done;
}

function renderCover(doc:PDFKit.PDFDocument,records:DailyReportPdfRecord[],project:string,period:string,generatedAt:string,t:(value:string)=>string,font:(value:string,bold?:boolean)=>PDFKit.PDFDocument){
  font(t("Daily Reports archive"),true).fontSize(25).fillColor(INK).text(t("Daily Reports archive"),44,90,{width:507});
  font(project,true).fontSize(17).fillColor(ORANGE).text(project,44,132,{width:507});
  doc.y=178;coverField(doc,t("Archive period"),period,44,doc.y,220,font);coverField(doc,t("Generated"),formatAppDateTime(generatedAt),298,doc.y,253,font);doc.y+=58;
  font(t("Archive index"),true).fontSize(11).fillColor(INK).text(t("Archive index"),44,doc.y);doc.moveDown(.6);
  if(records.length===0){font(t("No reports match this period."),false).fontSize(10).fillColor(MUTED).text(t("No reports match this period."));return;}
  for(const record of records){
    if(doc.y>735)doc.addPage();
    const y=doc.y;doc.fillColor("#f5f5f3").roundedRect(44,y,507,36,3).fill();
    font(record.report.date,true).fontSize(9).fillColor(INK).text(record.report.date,54,y+8,{width:100});
    font(`#${record.report.id}`,true).fontSize(9).fillColor(ORANGE).text(`#${record.report.id}`,160,y+8,{width:65});
    font(t(record.report.status),false).fontSize(8).fillColor(INK).text(t(record.report.status),232,y+8,{width:100});
    const revision=dailyReportRevision(record.report);font(revision,false).fontSize(7.5).fillColor(MUTED).text(revision,340,y+8,{width:200,align:"right"});
    doc.y=y+43;
  }
}

async function renderReport(doc:PDFKit.PDFDocument,record:DailyReportPdfRecord,generatedAt:string,t:(value:string)=>string,font:(value:string,bold?:boolean)=>PDFKit.PDFDocument){
  const {report,attendance,photos,elements=[]}=record;
  const left=38,width=519,bottom=doc.page.height-48;
  const ensure=(height:number)=>{if(doc.y+height>bottom)doc.addPage();};
  const write=(value:string,options:PDFKit.Mixins.TextOptions={},bold=false)=>font(value,bold).fillColor(INK).text(value,options);
  const heading=(value:string)=>{ensure(20);font(value,true).fontSize(8).fillColor(ORANGE).text(value.toUpperCase(),left,doc.y,{width,characterSpacing:.45});doc.y+=12;};
  const paragraph=(value:string)=>{const text=value||"—";font(text,false).fontSize(8.2);const height=Math.max(11,doc.heightOfString(text,{width,lineGap:1}));ensure(height+5);write(text,{width,lineGap:1});doc.y+=5;};
  const field=(label:string,value:string,x:number,y:number,fieldWidth:number)=>{font(label,true).fontSize(6.2).fillColor(MUTED).text(label.toUpperCase(),x,y,{width:fieldWidth,height:8,ellipsis:true});font(value||"—",false).fontSize(8.2).fillColor(INK).text(value||"—",x,y+10,{width:fieldWidth,height:11,ellipsis:true});};
  doc.y=54;font(t("Daily report"),true).fontSize(17).fillColor(INK).text(t("Daily report"),left,54,{width:350});font(`#${report.id}`,true).fontSize(17).fillColor(ORANGE).text(`#${report.id}`,430,54,{width:127,align:"right"});
  const metaY=84;field(t("Project"),report.project,left,metaY,250);field(t("Report date"),report.date,300,metaY,90);field(t("Report status"),t(report.status),405,metaY,152);
  field(t("Prepared by"),report.author,left,metaY+29,175);field(t("Approved by"),report.status==="Approved"?(record.approvedBy||t("Unknown approver")):"—",228,metaY+29,175);field(t("Weather"),report.weather||"—",418,metaY+29,139);
  field(t("Generated"),formatAppDateTime(generatedAt),left,metaY+58,190);field(t("Revision"),dailyReportRevision(report),244,metaY+58,170);doc.y=metaY+84;
  heading(t("General work performed"));paragraph(report.work);heading(t("Workforce attendance"));
  if(attendance.length===0)paragraph(t("No attendance data"));
  else for(const entry of attendance){
    const rowHeight=entry.comment?34:27;ensure(rowHeight+4);const y=doc.y;doc.fillColor("#f5f5f3").roundedRect(left,y,width,rowHeight,2).fill();font(entry.employeeName,true).fontSize(7.6).fillColor(INK).text(entry.employeeName,left+8,y+6,{width:150,height:10,ellipsis:true});font(t(entry.status),false).fontSize(6.7).fillColor(MUTED).text(t(entry.status),left+8,y+17,{width:150,height:9,ellipsis:true});
    const hours=`${t("Regular hours")}: ${entry.regularHours}   ${t("Overtime hours")}: ${entry.overtimeHours}   ${t("Total")}: ${entry.regularHours+entry.overtimeHours}`;font(hours,false).fontSize(7.1).fillColor(INK).text(hours,left+170,y+7,{width:341,height:10,ellipsis:true});if(entry.comment)font(entry.comment,false).fontSize(6.5).fillColor(MUTED).text(entry.comment,left+170,y+19,{width:341,height:9,ellipsis:true});doc.y=y+rowHeight+4;
  }
  if(elements.length){heading(t("Installed elements"));paragraph(elements.map((element)=>`${element.code} · ${t(element.elementType)} · ${element.floor||"—"} / ${element.zone||"—"}`).join("   "));}
  const notes=[[t("Materials / deliveries"),report.materials],[t("Equipment used"),report.equipment],[t("Problems / delays"),report.problems],[t("Safety observations"),report.safety],[t("Additional notes"),report.additionalNotes]] as const;
  for(let index=0;index<notes.length;index+=2){
    const pair=notes.slice(index,index+2),columnWidth=252,gap=15;
    font("",false).fontSize(7.5);const heights=pair.map(([,value])=>Math.max(10,doc.heightOfString(value||"—",{width:columnWidth,lineGap:.5})));const rowHeight=Math.max(...heights)+20;ensure(rowHeight+3);const y=doc.y;
    pair.forEach(([label,value],column)=>{const x=left+column*(columnWidth+gap);font(label,true).fontSize(7).fillColor(ORANGE).text(label.toUpperCase(),x,y,{width:columnWidth,height:9,ellipsis:true});font(value||"—",false).fontSize(7.5).fillColor(INK).text(value||"—",x,y+11,{width:columnWidth,lineGap:.5});});doc.y=y+rowHeight+3;
  }
  heading(t("Photos / Attachments"));
  if(photos.length===0)paragraph(t("No photos are attached to this Daily Report."));
  else for(let index=0;index<photos.length;index+=2){
    const imageHeight=145,rowHeight=174;ensure(rowHeight);const pair=photos.slice(index,index+2),y=doc.y;
    for(let col=0;col<pair.length;col++){
      const photo=pair[col],x=left+col*267,photoWidth=252;
      try{const raw=await readStoredFile(photo.storedPath),image=await pdfImage(raw,photo.mimeType);doc.image(image,x,y,{fit:[photoWidth,imageHeight],align:"center",valign:"center"});}
      catch{doc.fillColor("#eeeeeb").rect(x,y,photoWidth,imageHeight).fill();font(t("Photo unavailable"),false).fontSize(7).fillColor(MUTED).text(t("Photo unavailable"),x,y+66,{width:photoWidth,align:"center"});}
      font(photo.caption||photo.originalFilename,true).fontSize(7).fillColor(INK).text(photo.caption||photo.originalFilename,x,y+149,{width:photoWidth,height:9,ellipsis:true});font(`${photo.author} · ${photo.photoDate}`,false).fontSize(6.3).fillColor(MUTED).text(`${photo.author} · ${photo.photoDate}`,x,y+161,{width:photoWidth,height:8,ellipsis:true});
    }
    doc.y=y+rowHeight;
  }
}

function addFooters(doc:PDFKit.PDFDocument,generatedAt:string,t:(value:string)=>string,font:(value:string,bold?:boolean)=>PDFKit.PDFDocument){
  const generated=`${t("Generated")}: ${formatAppDateTime(generatedAt)}`,range=doc.bufferedPageRange();
  for(let page=range.start;page<range.start+range.count;page++){
    doc.switchToPage(page);doc.page.margins.bottom=16;doc.fillColor(PAPER).rect(0,doc.page.height-35,doc.page.width,35).fill();doc.strokeColor(LINE).moveTo(38,doc.page.height-32).lineTo(557,doc.page.height-32).stroke();font(generated,false).fontSize(6).fillColor(MUTED).text(generated,38,doc.page.height-24,{width:365,height:8,lineBreak:false});const pageLabel=`${t("Page")} ${page+1} / ${range.count}`;font(pageLabel,false).fontSize(6).fillColor(MUTED).text(pageLabel,438,doc.page.height-24,{width:119,height:8,align:"right",lineBreak:false});
  }
}

function coverField(doc:PDFKit.PDFDocument,label:string,value:string,x:number,y:number,width:number,font:(value:string,bold?:boolean)=>PDFKit.PDFDocument){font(label,true).fontSize(8).fillColor(MUTED).text(label.toUpperCase(),x,y,{width});font(value||"—",false).fontSize(11).fillColor(INK).text(value||"—",x,y+16,{width});}
async function pdfImage(bytes:Buffer,mimeType:string){if(mimeType!=="image/webp")return bytes;const image=await loadImage(bytes),max=1600,scale=Math.min(1,max/Math.max(image.width,image.height)),canvas=createCanvas(Math.max(1,Math.round(image.width*scale)),Math.max(1,Math.round(image.height*scale)));canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);return canvas.toBuffer("image/png");}

export function dailyReportRevision(report:Pick<DailyReport,"updatedAt"|"createdAt">){const stamp=(report.updatedAt||report.createdAt||"").replace(/\D/g,"").slice(0,14);return `R-${stamp||"LEGACY"}Z`;}
export function dailyReportPdfFilename(report:Pick<DailyReport,"id"|"project"|"date">){return `PREFAB-Daily-Report-${report.id}-${report.date}-${report.project}`.replace(/[^\p{L}\p{N}._-]+/gu,"-").slice(0,150)+".pdf";}
export function dailyReportArchiveFilename(project:string,period:string){return `PREFAB-Daily-Reports-${period}-${project}`.replace(/[^\p{L}\p{N}._-]+/gu,"-").slice(0,150)+".pdf";}
