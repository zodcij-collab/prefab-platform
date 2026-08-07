export function MetricCard({ value, label, note }: { value: string | number; label: string; note?: string }) {
  return <article className="os-metric"><span>{label}</span><strong>{value}</strong>{note ? <small>{note}</small> : null}</article>;
}
