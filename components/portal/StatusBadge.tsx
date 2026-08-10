export function StatusBadge({status,label}:{status:string;label?:string}){
  const normalized=status.toLowerCase().replaceAll(" ","-");
  return <span className={`os-badge os-badge-${normalized}`}>{label??status}</span>;
}
