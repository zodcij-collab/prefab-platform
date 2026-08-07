import { listActivity } from "../../lib/repositories";

export function ActivityFeed({ limit = 8 }: { limit?: number }) {
  const items = listActivity(limit);
  return <div className="os-activity-feed">{items.map((item) => <div key={item.id} className="os-activity-item"><i/><div><strong>{item.action}</strong><span>{item.actor} · {item.entityType}{item.entityId ? ` · ${item.entityId}` : ""}</span>{item.details ? <small>{item.details}</small> : null}</div><time>{new Date(item.createdAt).toLocaleString("en-GB", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" })}</time></div>)}</div>;
}
