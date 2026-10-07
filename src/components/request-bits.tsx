import { Badge } from "@/components/ui";
import { BALL, ITEM_STATUS, IO_STATUS, OUTCOME } from "@/lib/request-meta";

export function ItemStatusBadge({ s }: { s: string }) {
  const m = ITEM_STATUS[s] ?? { label: s, tone: "slate" as const };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function IoStatusBadge({ s }: { s: string }) {
  const m = IO_STATUS[s] ?? { label: s, tone: "slate" as const };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function BallBadge({ b }: { b: string }) {
  const m = BALL[b] ?? { label: b, tone: "slate" as const };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function OutcomeBadge({ o }: { o: string | null }) {
  if (!o) return null;
  const m = OUTCOME[o];
  return (
    <Badge tone={m.tone}>
      {m.icon} {m.label}
    </Badge>
  );
}

/** Гео-чипы позиций: DE ✅ AT ❌ ES ⏳ */
export function GeoChips({ items }: { items: { geo: string; status: string; outcome: string | null }[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {items.map((i) => {
        const icon =
          i.status === "closed" ? (i.outcome ? OUTCOME[i.outcome].icon : "✓") : i.status === "archived" ? "∅" : i.status === "passed" ? "→" : i.status === "paused" ? "⏸" : "⏳";
        const tone =
          i.status === "closed"
            ? i.outcome === "declined"
              ? "bg-rose-50 text-rose-700"
              : "bg-emerald-50 text-emerald-700"
            : i.status === "archived" || i.status === "paused"
              ? "bg-slate-100 text-slate-500"
              : "bg-indigo-50 text-indigo-700";
        return (
          <span key={i.geo} title={ITEM_STATUS[i.status]?.label} className={`rounded px-1.5 py-0.5 font-mono text-xs ${tone}`}>
            {i.geo} {icon}
          </span>
        );
      })}
    </span>
  );
}
