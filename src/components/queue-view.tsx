import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadSettings, slaAlert } from "@/lib/request-data";
import { ITEM_STATUS, hoursLabel } from "@/lib/request-meta";
import { Badge, Card, Empty, PageHeader, btnCls } from "@/components/ui";

type Q = {
  item_id: string;
  request_id: string;
  number: number;
  geo_code: string;
  status: string;
  paused_reason: string | null;
  adv_waiting_since: string | null;
  direction: string;
  advertiser_name: string | null;
  priority: string;
  source_code: string | null;
  approach_code: string | null;
  is_inhouse: boolean;
  manager_name: string | null;
  webmaster_name: string | null;
  product: string | null;
  mine: boolean;
  offers_count: number;
  waiting_for: string | null;
  ball: string;
  hours_in_status: number;
};

type Tile = {
  key: string;
  column: string;
  href: string;
  title: string;
  who: string;
  what: string;
  badge: { label: string; tone: "slate" | "indigo" | "green" | "amber" | "rose" };
  kind: "запрос" | "от рекла";
  hours: number;
  alert: { level: "warn" | "bad"; text: string } | null;
  advWaiting: boolean;
  urgent: boolean;
  extra?: string;
};

// Очередь — только согласование. Всё, что рекл апрувнул, живёт в «Потоках».
const COLUMNS = [
  { key: "on_me", title: "Моё действие", hint: "новые, ответы для передачи, «рекл ждёт»" },
  { key: "on_advertiser", title: "Ждём рекла", hint: "отправили реклу, ждём ответ" },
  { key: "on_manager", title: "Ждём менеджера", hint: "уточнения и запросы от реклов" },
];

export default async function QueueView({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const all = sp.all === "1";
  const sb = await createClient();
  const settings = await loadSettings(sb);
  let q = sb.from("v_queue").select("*");
  if (!all) q = q.eq("mine", true);
  const [{ data }, { count: noMe }] = await Promise.all([
    q,
    sb.from("assignees").select("id", { count: "exact", head: true }).eq("is_me", true),
  ]);
  const rows = (data ?? []) as Q[];
  const paused = rows.filter((r) => r.ball === "paused");

  const tiles: Tile[] = [
    ...rows
      .filter((r) => r.ball !== "paused")
      .map((r): Tile => {
        const isAdv = r.direction === "from_advertiser";
        return {
          key: `i-${r.item_id}`,
          column: r.ball,
          href: `/requests/${r.request_id}`,
          title: `${r.geo_code} · #${r.number}`,
          who: isAdv ? `от рекла ${r.advertiser_name ?? ""}` : `${r.manager_name ?? "—"}${r.webmaster_name ? ` → ${r.webmaster_name}` : ""}`,
          what: [r.is_inhouse ? "INH" : null, r.source_code, r.approach_code, r.product].filter(Boolean).join(" · ") || "без уточнений",
          badge: ITEM_STATUS[r.status] ?? { label: r.status, tone: "slate" },
          kind: isAdv ? "от рекла" : "запрос",
          hours: Number(r.hours_in_status),
          alert: r.adv_waiting_since ? { level: "bad", text: "рекл ждёт ответа" } : slaAlert(r.status, Number(r.hours_in_status), settings),
          advWaiting: Boolean(r.adv_waiting_since),
          urgent: r.priority === "urgent",
          extra: r.waiting_for ? `ждём: ${r.waiting_for}` : r.status === "new" && r.offers_count === 0 ? (isAdv ? "менеджеры не выбраны" : "офферы не выбраны") : undefined,
        };
      }),
  ];

  const sortTiles = (list: Tile[]) =>
    [...list].sort(
      (a, b) =>
        Number(b.advWaiting) - Number(a.advWaiting) ||
        (b.alert?.level === "bad" ? 2 : b.alert ? 1 : 0) - (a.alert?.level === "bad" ? 2 : a.alert ? 1 : 0) ||
        Number(b.urgent) - Number(a.urgent) ||
        b.hours - a.hours
    );
  const overdue = tiles.filter((t) => t.alert).length;

  return (
    <>
      <PageHeader
        title="Очередь"
        subtitle={`В работе: ${tiles.length}${overdue ? ` · требуют внимания: ${overdue}` : ""}`}
        actions={
          <>
            <Link href={all ? "/" : "/?all=1"} className={btnCls.secondary}>
              {all ? "Только мои" : "Все, включая коллег"}
            </Link>
            <Link href="/inbound" className={btnCls.secondary}>
              Сообщение от рекла
            </Link>
            <Link href="/requests/new" className={btnCls.primary}>
              + Запрос менеджера
            </Link>
          </>
        }
      />
      {!all && noMe === 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Отметь себя в разделе{" "}
          <Link href="/assignees" className="font-semibold underline">
            Адресаты
          </Link>{" "}
          галочкой «Это я» — иначе в «моей» очереди не будет запросов.
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const list = sortTiles(tiles.filter((t) => t.column === col.key));
          return (
            <Card key={col.key} title={`${col.title} · ${list.length}`}>
              <p className="-mt-3 mb-3 text-xs text-slate-400">{col.hint}</p>
              {list.length === 0 ? (
                <Empty>Пусто</Empty>
              ) : (
                <div className="space-y-2">
                  {list.map((t) => (
                    <Link
                      key={t.key}
                      href={t.href}
                      className={`block rounded-lg border p-3 transition hover:shadow-sm ${
                        t.alert?.level === "bad" ? "border-rose-300 bg-rose-50/40" : t.alert ? "border-amber-300 bg-amber-50/40" : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          {t.title}
                          {t.urgent && <span className="ml-1 text-rose-600">● срочно</span>}
                        </span>
                        <span className="whitespace-nowrap text-xs text-slate-400">{hoursLabel(t.hours)}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-600">{t.who}</div>
                      {t.what && <div className="mt-0.5 text-xs text-slate-500">{t.what}</div>}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">{t.kind}</span>
                        <Badge tone={t.badge.tone}>{t.badge.label}</Badge>
                        {t.extra && <span className="text-xs text-slate-500">{t.extra}</span>}
                        {t.alert && <span className={`text-xs font-semibold ${t.alert.level === "bad" ? "text-rose-600" : "text-amber-600"}`}>⚠ {t.alert.text}</span>}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {paused.length > 0 && (
        <Card title={`На паузе · ${paused.length}`} className="mt-6">
          <div className="space-y-1">
            {paused.map((r) => (
              <Link key={r.item_id} href={`/requests/${r.request_id}`} className="flex gap-3 rounded px-2 py-1 text-sm hover:bg-slate-50">
                <span className="font-mono font-semibold">{r.geo_code}</span>
                <span>#{r.number}</span>
                <span className="text-slate-500">{r.manager_name ?? r.advertiser_name}</span>
                <span className="text-slate-400">{r.paused_reason}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
