import { listActivity } from "../../lib/repositories";
import { formatAppDateTime } from "../../lib/datetime";

export function ActivityFeed({ limit = 8 }: { limit?: number }) {
  const items = listActivity(limit);
  return <div className="os-activity-feed">{items.map((item) => <div key={item.id} className="os-activity-item"><i/><div><strong>{item.action}</strong><span>{item.actor} · {item.entityType}{item.entityId ? ` · ${item.entityId}` : ""}</span>{item.details ? <small>{item.details}</small> : null}</div><time>{formatAppDateTime(item.createdAt)}</time></div>)}</div>;
}
