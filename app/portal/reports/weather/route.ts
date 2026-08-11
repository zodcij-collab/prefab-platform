import {NextResponse} from "next/server";
import {getSessionUser} from "../../../../lib/auth";
import {canAccessProject,canCreateProjectReports} from "../../../../lib/permissions";
import {getProject} from "../../../../lib/repositories";
import {OpenMeteoProvider} from "../../../../lib/weather";

export async function GET(request:Request){const user=await getSessionUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});const url=new URL(request.url),projectId=url.searchParams.get("projectId")??"",date=url.searchParams.get("date")??"",project=getProject(projectId);if(!project||!canAccessProject(user,projectId)||!canCreateProjectReports(user,projectId))return NextResponse.json({error:"Forbidden"},{status:403});const latitude=project.latitude,longitude=project.longitude;if(latitude===null||longitude===null||!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude< -90||latitude>90||longitude< -180||longitude>180)return NextResponse.json({error:"Project coordinates are not configured."},{status:422});if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return NextResponse.json({error:"Invalid date."},{status:400});try{return NextResponse.json({rows:await new OpenMeteoProvider().load({latitude,longitude,date,timezone:"Europe/Riga"})});}catch{return NextResponse.json({error:"Automatic weather data unavailable. Enter weather manually."},{status:503});}}
