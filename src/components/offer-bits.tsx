import { Badge } from "@/components/ui";

export function OfferStatus({ s }: { s: unknown }) {
  if (s === "active") return <Badge tone="green">активен</Badge>;
  if (s === "paused") return <Badge tone="amber">на паузе</Badge>;
  return <Badge>закрыт</Badge>;
}

export function TierBadge({ t }: { t: unknown }) {
  return t === "key" ? <Badge tone="indigo">ключевой</Badge> : <Badge>разовый</Badge>;
}

export function money(rate: unknown, currency: unknown) {
  if (rate == null) return "—";
  const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : "";
  return sym ? `${sym}${rate}` : `${rate} ${currency ?? ""}`;
}

/** Чипы кодов: гео, сорсы, подходы. */
export function Codes({ list, empty = "—", tone = "slate" }: { list: unknown; empty?: string; tone?: "slate" | "indigo" }) {
  const arr = (list as string[] | null) ?? [];
  if (arr.length === 0) return <span className="text-xs text-slate-400">{empty}</span>;
  const cls = tone === "indigo" ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-600";
  return (
    <span className="inline-flex flex-wrap gap-1">
      {arr.map((c) => (
        <span key={c} className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${cls}`}>
          {c}
        </span>
      ))}
    </span>
  );
}
