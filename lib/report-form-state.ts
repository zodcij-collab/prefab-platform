export type ReportFormValues=Record<string,string|string[]>;

export function captureReportFormValues(data:FormData):ReportFormValues{
  const values:ReportFormValues={};
  for(const [key,value] of data.entries()){
    if(typeof value!=="string")continue;
    const existing=values[key];
    if(existing===undefined)values[key]=value;
    else if(Array.isArray(existing))existing.push(value);
    else values[key]=[existing,value];
  }
  return values;
}
