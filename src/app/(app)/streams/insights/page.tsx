import Link from "next/link";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, btnCls, inputCls } from "@/components/ui";

// Разрезы по потокам из таблицы: куда перевести трафик, кто сколько льёт, где упираемся в капу.
// Только чтение — сами потоки правятся на странице «Потоки».

type S = {
  id: string;
  stage: string;
  offer_name: string | null;
  advertiser_id: string | null;
  advertiser_name: string | null;
  manager_name: string | null;
  webmaster_name: string | null;
  geo_code: string;
  source_code: string | null;
  approach_code: string | null;
  adv_stream_id: string | null;
  sub_id: string | null;
  rate: number | null;
  currency: string;
  cap: number | null;
  cap_month: number | null;
  ftd: number | null;
  free_cap_id: string | null;
  days_no_ftd: number;
};

const VIEWS = {
  move: { label: "Куда перевести", hint: "Активные продукты на гео + сорс у всех реклов — куда отдать стопнутый трафик" },
  share: { label: "Распределение", hint: "Какие потоки льют и какую долю FTD дают" },
  caps: { label: "Капы", hint: "Отлито / капа на ID за месяц, прогноз к концу месяца и что не так" },
} as const;
type View = keyof typeof VIEWS;

const isStopped = (s: S) => ["stopped", "no_traffic"].includes(s.stage);
const isActive = (s: S) => !isStopped(s) && !s.free_cap_id;
const ftd = (s: S) => s.ftd ?? 0;
const money = (s: S) => (s.rate != null ? `${s.currency === "EUR" ? "€" : "$"}${Number(s.rate)}` : "—");
/** «ASO» находит ASO, ASO IOS, ASO ANDROID */
const sourceOk = (src: string | null, f: string) => !f || (src ?? "").toUpperCase() === f || (src ?? "").toUpperCase().startsWith(f + " ");
const baseSource = (s: string | null) => (s ?? "").toUpperCase().split(/[\s/]+/)[0];

function monthProgress() {
  const msk = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
  return { day: msk.getDate(), days: new Date(msk.getFullYear(), msk.getMonth() + 1, 0).getDate() };
}

const FLAGS = {
  stop_pouring: { label: "Льётся на стоп", cls: "bg-rose-100 text-rose-800", hint: "Есть FTD на потоке со стопом — риск неоплаты" },
  full: { label: "Капа выбрана", cls: "bg-rose-50 text-rose-700", hint: "Отлито не меньше капы — просить ап или останавливать" },
  near: { label: "Упрёмся в капу", cls: "bg-amber-50 text-amber-800", hint: "Выбрано 70%+ или по темпу капа кончится до конца месяца — просить ап" },
  idle: { label: "Капа простаивает", cls: "bg-slate-100 text-slate-700", hint: "Капа есть, FTD нет — пушить, отдать в подмену или снять" },
  no_cap: { label: "Льётся без капы", cls: "bg-indigo-50 text-indigo-700", hint: "FTD есть, капа на ID не указана" },
} as const;
type Flag = keyof typeof FLAGS;

export default async function StreamInsightsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const view: View = (sp.view as View) in VIEWS ? (sp.view as View) : "move";
  const geo = (sp.geo ?? "").toUpperCase();
  const source = (sp.source ?? "").toUpperCase();
  const adv = sp.adv ?? "";

  const sb = await createClient();
  const { data } = await sb.from("v_launches").select("*");
  const all = (data ?? []) as S[];
  const geos = [...new Set(all.map((s) => s.geo_code).filter(Boolean))].sort();
  const sources = [...new Set(all.map((s) => baseSource(s.source_code)).filter(Boolean))].sort();
  const advs = [...new Map(all.filter((s) => s.advertiser_id).map((s) => [s.advertiser_id!, s.advertiser_name ?? ""])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const list = all.filter((s) => (!geo || s.geo_code === geo) && sourceOk(s.source_code, source) && (!adv || s.advertiser_id === adv));
  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams(Object.entries({ view, geo, source, adv, ...patch }).filter(([, v]) => v));
    return `/streams/insights?${p}`;
  };

  let body: React.ReactNode;
  if (view === "move") {
    const groups = new Map<string, { offer: string; adv: string; advId: string | null; geo: string; sources: Set<string>; rates: Set<string>; ftd: number; streams: number }>();
    for (const s of list.filter(isActive)) {
      const k = `${s.advertiser_id}|${s.offer_name}|${s.geo_code}`;
      const g = groups.get(k) ?? { offer: s.offer_name ?? "—", adv: s.advertiser_name ?? "—", advId: s.advertiser_id, geo: s.geo_code, sources: new Set<string>(), rates: new Set<string>(), ftd: 0, streams: 0 };
      if (s.source_code) g.sources.add(s.source_code);
      g.rates.add(money(s));
      g.ftd += ftd(s);
      g.streams++;
      groups.set(k, g);
    }
    const rows = [...groups.values()].sort((a, b) => b.ftd - a.ftd);
    body = !geo ? (
      <Empty>Выбери гео (и сорс) — покажу активные продукты, куда можно перевести трафик</Empty>
    ) : !rows.length ? (
      <Empty>
        Нет активных продуктов на {geo}
        {source ? ` / ${source}` : ""}
      </Empty>
    ) : (
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-2 py-1.5">Продукт</th>
            <th className="px-2 py-1.5">Рекл</th>
            <th className="px-2 py-1.5">Сорсы</th>
            <th className="px-2 py-1.5">Ставки</th>
            <th className="px-2 py-1.5 text-right">Потоков</th>
            <th className="px-2 py-1.5 text-right">Отлито за месяц</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.adv + g.offer + g.geo} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-2 py-1.5 font-semibold text-slate-900">
                {g.offer} <span className="font-mono text-xs text-slate-400">{g.geo}</span>
              </td>
              <td className="px-2 py-1.5">{g.advId ? <Link href={`/advertisers/${g.advId}`} className="hover:text-indigo-600">{g.adv}</Link> : g.adv}</td>
              <td className="px-2 py-1.5 text-xs">{[...g.sources].join(", ")}</td>
              <td className="px-2 py-1.5 text-xs">{[...g.rates].join(" / ")}</td>
              <td className="px-2 py-1.5 text-right">{g.streams}</td>
              <td className="px-2 py-1.5 text-right font-semibold">{g.ftd}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  } else if (view === "share") {
    const rows = list.filter((s) => ftd(s) > 0).sort((a, b) => ftd(b) - ftd(a));
    const total = rows.reduce((n, s) => n + ftd(s), 0);
    body = !rows.length ? (
      <Empty>По выбранным фильтрам депов в этом месяце нет</Empty>
    ) : (
      <>
        <p className="mb-3 text-sm text-slate-500">
          Всего отлито: <b className="text-slate-900">{total}</b> FTD по {rows.length} потокам. Доля — от суммы по выбранным фильтрам.
        </p>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-2 py-1.5">Продукт</th>
              <th className="px-2 py-1.5">Рекл</th>
              <th className="px-2 py-1.5">Гео · сорс</th>
              <th className="px-2 py-1.5">ID · подмена</th>
              <th className="px-2 py-1.5">Веб · менеджер</th>
              <th className="px-2 py-1.5 text-right">Отлито</th>
              <th className="px-2 py-1.5">Доля</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const pct = Math.round((ftd(s) / total) * 100);
              return (
                <tr key={s.id} className={clsx("border-t border-slate-100 hover:bg-slate-50", !isActive(s) && "text-slate-400")}>
                  <td className="px-2 py-1.5 font-semibold">{s.offer_name}</td>
                  <td className="px-2 py-1.5">{s.advertiser_name}</td>
                  <td className="px-2 py-1.5 text-xs">
                    {s.geo_code} · {s.source_code ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-xs">
                    {s.adv_stream_id ?? "—"}
                    {s.sub_id ? ` → ${s.sub_id}` : ""}
                  </td>
                  <td className="px-2 py-1.5 text-xs">
                    {s.webmaster_name ?? "—"} · {s.manager_name ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold">{ftd(s)}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 rounded bg-slate-100">
                        <div className="h-1.5 rounded bg-indigo-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs">{pct}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </>
    );
  } else {
    const { day, days } = monthProgress();
    // капа на ID: потоки с одним ID у рекла и гео (оригинал + подмены) делят одну капу
    const map = new Map<string, { adv: string; id: string; offer: string; geo: string; sources: Set<string>; ftd: number; cap: number | null; streams: S[] }>();
    for (const s of list) {
      if (!s.adv_stream_id) continue;
      const k = `${s.advertiser_id}|${s.adv_stream_id}|${s.geo_code}`;
      const r = map.get(k) ?? { adv: s.advertiser_name ?? "—", id: s.adv_stream_id, offer: s.offer_name ?? "—", geo: s.geo_code, sources: new Set<string>(), ftd: 0, cap: null, streams: [] };
      r.streams.push(s);
      r.ftd += ftd(s);
      const c = s.cap_month ?? (s.sub_id ? null : s.cap);
      if (c != null) r.cap = Math.max(r.cap ?? 0, c);
      if (s.source_code) r.sources.add(s.source_code);
      map.set(k, r);
    }
    const rows = [...map.values()].map((r) => {
      const forecast = Math.round((r.ftd / Math.max(day, 1)) * days);
      const pct = r.cap ? Math.round((r.ftd / r.cap) * 100) : null;
      let flag: Flag | null = null;
      if (r.streams.some((s) => isStopped(s) && ftd(s) > 0)) flag = "stop_pouring";
      else if (r.cap && r.ftd >= r.cap) flag = "full";
      else if (r.cap && (r.ftd / r.cap >= 0.7 || forecast >= r.cap)) flag = "near";
      else if (r.cap && r.ftd === 0 && r.streams.some(isActive)) flag = "idle";
      else if (!r.cap && r.ftd > 0) flag = "no_cap";
      return { ...r, forecast, pct, flag };
    });
    const order: (Flag | null)[] = ["stop_pouring", "full", "near", "idle", "no_cap", null];
    rows.sort((a, b) => order.indexOf(a.flag) - order.indexOf(b.flag) || (b.pct ?? -1) - (a.pct ?? -1) || b.ftd - a.ftd);
    const onlyProblems = sp.problems === "1";
    const shown = onlyProblems ? rows.filter((r) => r.flag) : rows;
    const counts = Object.fromEntries((Object.keys(FLAGS) as Flag[]).map((f) => [f, rows.filter((r) => r.flag === f).length]));
    body = (
      <>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500">
            День {day} из {days}, прогноз = отлито ÷ {day} × {days}.
          </span>
          {(Object.keys(FLAGS) as Flag[])
            .filter((f) => counts[f])
            .map((f) => (
              <span key={f} title={FLAGS[f].hint} className={clsx("rounded px-2 py-0.5 font-medium", FLAGS[f].cls)}>
                {FLAGS[f].label}: {counts[f]}
              </span>
            ))}
          <Link href={href({ problems: onlyProblems ? "" : "1" })} className={btnCls.ghost}>
            {onlyProblems ? "Показать все" : "Только проблемы"}
          </Link>
        </div>
        {!shown.length ? (
          <Empty>Ничего не найдено</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-2 py-1.5">Рекл</th>
                <th className="px-2 py-1.5">ID у рекла</th>
                <th className="px-2 py-1.5">Продукт · гео</th>
                <th className="px-2 py-1.5">Сорсы</th>
                <th className="px-2 py-1.5 text-right">Потоков</th>
                <th className="px-2 py-1.5 text-right">Отлито / капа</th>
                <th className="px-2 py-1.5 text-right">%</th>
                <th className="px-2 py-1.5 text-right">Прогноз</th>
                <th className="px-2 py-1.5">Что не так</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.adv + r.id + r.geo} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-2 py-1.5">{r.adv}</td>
                  <td className="px-2 py-1.5 font-mono text-xs">
                    <Link href={`/streams?q=${encodeURIComponent(r.id)}&status=all`} className="hover:text-indigo-600">
                      {r.id}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5 font-semibold">
                    {r.offer} <span className="font-mono text-xs font-normal text-slate-400">{r.geo}</span>
                  </td>
                  <td className="px-2 py-1.5 text-xs">{[...r.sources].join(", ")}</td>
                  <td className="px-2 py-1.5 text-right">{r.streams.length}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right font-semibold">
                    {r.ftd} / {r.cap ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right text-xs">{r.pct != null ? `${r.pct}%` : "—"}</td>
                  <td className="px-2 py-1.5 text-right text-xs">{r.forecast}</td>
                  <td className="px-2 py-1.5">
                    {r.flag && (
                      <span title={FLAGS[r.flag].hint} className={clsx("rounded px-2 py-0.5 text-xs font-medium", FLAGS[r.flag].cls)}>
                        {FLAGS[r.flag].label}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Потоки · разрезы"
        subtitle="По данным последней загрузки из таблицы"
        actions={
          <Link href="/streams" className={btnCls.secondary}>
            ← К потокам
          </Link>
        }
      />
      <div className="mb-4 flex flex-wrap gap-1">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <Link
            key={v}
            href={href({ view: v, problems: "" })}
            className={clsx("rounded-lg px-3 py-1.5 text-sm font-medium", v === view ? "bg-indigo-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50")}
          >
            {VIEWS[v].label}
          </Link>
        ))}
      </div>
      <form className="mb-4 flex flex-wrap items-center gap-2" action="/streams/insights">
        <input type="hidden" name="view" value={view} />
        <select name="geo" defaultValue={geo} className={`${inputCls} !w-28`}>
          <option value="">Все гео</option>
          {geos.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <select name="source" defaultValue={source} className={`${inputCls} !w-36`}>
          <option value="">Любой сорс</option>
          {sources.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select name="adv" defaultValue={adv} className={`${inputCls} !w-48`}>
          <option value="">Все реклы</option>
          {advs.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <button className={btnCls.secondary}>Показать</button>
        {(geo || source || adv) && (
          <Link href={`/streams/insights?view=${view}`} className={btnCls.ghost}>
            Сбросить
          </Link>
        )}
      </form>
      <Card title={VIEWS[view].label} actions={<span className="text-xs text-slate-400">{VIEWS[view].hint}</span>}>
        <div className="overflow-x-auto">{body}</div>
      </Card>
    </>
  );
}
