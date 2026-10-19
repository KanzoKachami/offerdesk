import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { deleteStream, moveStreamToCaps } from "@/lib/launch-actions";
import { StreamForm, type StreamFormRow } from "@/components/stream-form";
import { StageSelect } from "@/components/stream-controls";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { CopyBox } from "@/components/copy-box";
import { Card, Empty, Flash, PageHeader, btnCls, inputCls } from "@/components/ui";

// Потоки — список из гугл-таблицы, который загружается каждый день. Ни к чему не привязан.
const NO_FTD_DAYS = 7; // дней без новых депов — поток «не льёт», подсвечиваем красным

type S = StreamFormRow & {
  id: string;
  stage: string;
  offer_name: string | null;
  advertiser_name: string | null;
  manager_name: string | null;
  webmaster_name: string | null;
  days_unchanged: number;
  days_no_ftd: number;
  days_issued: number;
  ftd: number | null;
  issued_on: string | null;
  free_cap_id: string | null;
  is_new: boolean;
  changed_at: string;
  actualized_on: string | null;
  ftd_after_stop: number | null;
  poured_after_stop: boolean | null;
  stop_without_date: boolean | null;
};

const isStopped = (s: { stage: string }) => ["stopped", "no_traffic"].includes(s.stage);
const notPouring = (s: S) => !isStopped(s) && !s.free_cap_id && s.days_no_ftd >= NO_FTD_DAYS;

/** Пуш менеджерам: по каждому — его потоки, которые не льют. */
function pushTexts(list: S[]) {
  const byManager = new Map<string, S[]>();
  for (const s of list) byManager.set(s.manager_name ?? "Без менеджера", [...(byManager.get(s.manager_name ?? "Без менеджера") ?? []), s]);
  return [...byManager.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([manager, rows]) => ({
      manager,
      count: rows.length,
      text: [
        `${manager === "Без менеджера" ? "Ребят" : manager}, по ${rows.length === 1 ? "этому потоку" : "этим потокам"} тишина ${NO_FTD_DAYS}+ дней:`,
        ...rows.map(
          (s) =>
            `• ${s.offer_name ?? ""} ${s.geo_code}${s.source_code ? ` [${s.source_code}]` : ""} — ID ${s.sub_id ?? s.adv_stream_id ?? "—"}${s.webmaster_name ? `, ${s.webmaster_name}` : ""} — ${
              (s.ftd ?? 0) > 0 ? `последний деп ${s.days_no_ftd} дн назад` : `0 депов${s.issued_on ? ` с ${new Date(s.issued_on).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}` : ""}`
            }`
        ),
        "Что по ним? Если лить не будут — заберём капу и отдадим другим.",
      ].join("\n"),
    }));
}

const STATUS_FILTERS: Record<string, { label: string; stages: string[] | null }> = {
  active: { label: "Кроме стопа", stages: ["waiting_link", "link_received", "at_integrator", "integrated", "live", "ftd"] },
  live: { label: "Льёт", stages: ["live", "ftd"] },
  stopped: { label: "Стоп / не запустился", stages: ["stopped", "no_traffic"] },
  all: { label: "Все", stages: null },
};

const money = (s: S) => (s.rate != null ? `${s.currency === "EUR" ? "€" : "$"}${Number(s.rate)}` : "");

export default async function StreamsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const sb = await createClient();
  const [{ data }, { data: offers }, { data: managers }, { data: geos }, { data: sources }, { data: approaches }] = await Promise.all([
    sb.from("v_launches").select("*"),
    sb.from("offers").select("id, name, advertisers(name)").order("name"),
    sb.from("managers").select("id, name").order("name"),
    sb.from("geos").select("code").order("code"),
    sb.from("sources").select("code").order("code"),
    sb.from("approaches").select("code").order("code"),
  ]);
  const all = (data ?? []) as S[];
  const managerOpts = (managers ?? []).map((m) => ({ value: m.id as string, label: m.name as string }));

  // фильтры
  const q = (sp.q ?? "").trim().toLowerCase();
  const status = STATUS_FILTERS[sp.status ?? "active"] ?? STATUS_FILTERS.active;
  const staleOnly = sp.stale === "1";
  const newOnly = sp.new_only === "1";
  const list = all
    .filter(
      (s) =>
        (!status.stages || status.stages.includes(s.stage)) &&
        (!sp.geo || s.geo_code === sp.geo) &&
        (!sp.manager || s.manager_id === sp.manager) &&
        (!staleOnly || notPouring(s)) &&
        (!newOnly || s.is_new) &&
        (!q ||
          [s.offer_name, s.advertiser_name, s.adv_stream_id, s.sub_id, s.geo_code, s.webmaster_name, s.manager_name, s.source_code, s.approach_code, s.notes]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)))
    )
    // сначала новые, потом самые «застоявшиеся»
    .sort(
      (a, b) =>
        Number(b.is_new) - Number(a.is_new) ||
        Number(notPouring(b)) - Number(notPouring(a)) ||
        b.days_no_ftd - a.days_no_ftd ||
        String(a.offer_name).localeCompare(String(b.offer_name))
    );

  const silent = all.filter(notPouring);
  const afterStop = all.filter((s) => s.poured_after_stop);
  const stopNoDate = all.filter((s) => s.stop_without_date && (s.ftd ?? 0) > 0).length;
  const staleCount = silent.length;
  const movedCount = all.filter((s) => s.free_cap_id).length;
  const newCount = all.filter((s) => s.is_new).length;
  const editing = sp.edit ? all.find((s) => s.id === sp.edit) : undefined;
  const hasFilters = Boolean(q || sp.geo || sp.manager || staleOnly || newOnly || (sp.status && sp.status !== "active"));
  const td = "px-2 py-1.5 whitespace-nowrap";

  const rowBg = (s: S) => {
    if (s.is_new) return "bg-emerald-50/70";
    if (isStopped(s) || s.free_cap_id) return "bg-slate-50 text-slate-400";
    if (notPouring(s)) return "bg-rose-50";
    return "";
  };

  return (
    <>
      <PageHeader
        title="Потоки"
        subtitle={`Всего: ${all.length} · новых за сутки: ${newCount} · не льют ${NO_FTD_DAYS}+ дней: ${staleCount}${movedCount ? ` · ушли в свободные капы: ${movedCount}` : ""}`}
        actions={
          <>
            <Link href="/streams/insights" className={btnCls.secondary}>
              Разрезы
            </Link>
            <Link href="/streams/import" className={btnCls.secondary}>
              Загрузить из таблицы
            </Link>
            <Link href="/streams?new=1" className={btnCls.primary}>
              + Поток
            </Link>
          </>
        }
      />
      <Flash sp={sp} />

      {(sp.new === "1" || editing) && (
        <Card title={editing ? `Поток ${editing.offer_name ?? ""} (${editing.geo_code})` : "Новый поток"} className="mb-6">
          <StreamForm
            key={editing?.id ?? "new"}
            row={editing}
            offers={(offers ?? []).map((o) => ({ value: o.id as string, label: `${o.name} — ${(o.advertisers as unknown as { name: string } | null)?.name ?? ""}` }))}
            geos={(geos ?? []).map((g) => g.code as string)}
            sources={(sources ?? []).map((g) => g.code as string)}
            approaches={(approaches ?? []).map((g) => g.code as string)}
            managers={managerOpts}
          />
        </Card>
      )}

      <form className="mb-4 flex flex-wrap items-center gap-2" action="/streams">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Поиск: продукт, ID, веб, менеджер, заметка…" className={`${inputCls} !w-80`} autoFocus={!sp.new && !sp.edit} />
        <select name="geo" defaultValue={sp.geo ?? ""} className={`${inputCls} !w-28`}>
          <option value="">Все гео</option>
          {[...new Set(all.map((s) => s.geo_code).filter(Boolean))].sort().map((g) => (
            <option key={g} value={g!}>
              {g}
            </option>
          ))}
        </select>
        <select name="manager" defaultValue={sp.manager ?? ""} className={`${inputCls} !w-40`}>
          <option value="">Все менеджеры</option>
          {managerOpts.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={sp.status ?? "active"} className={`${inputCls} !w-44`}>
          {Object.entries(STATUS_FILTERS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" name="stale" value="1" defaultChecked={staleOnly} className="h-4 w-4 accent-amber-500" />
          не льют {NO_FTD_DAYS}+ дн
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" name="new_only" value="1" defaultChecked={newOnly} className="h-4 w-4 accent-emerald-600" />
          только новые
        </label>
        <button className={btnCls.secondary}>Найти</button>
        {hasFilters && (
          <Link href="/streams" className={btnCls.ghost}>
            Сбросить
          </Link>
        )}
      </form>

      {afterStop.length > 0 && (
        <div className="mb-4 rounded-xl border border-rose-300 bg-rose-100/60 p-4 text-sm text-rose-900">
          <div className="mb-2 font-semibold">Льётся после стопа: {afterStop.length} — риск неоплаты, уточни у менеджеров</div>
          <ul className="space-y-0.5">
            {afterStop.map((s) => (
              <li key={s.id}>
                {s.advertiser_name} · <b>{s.offer_name}</b> {s.geo_code}
                {s.source_code ? ` [${s.source_code}]` : ""} · ID {s.adv_stream_id}
                {s.sub_id ? ` → ${s.sub_id}` : ""} · стоп с {s.actualized_on ? new Date(s.actualized_on).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) : "?"}
                {s.ftd_after_stop ? ` · +${s.ftd_after_stop} FTD после стопа` : ` · отлито ${s.ftd ?? 0}, росло после даты стопа`} · {s.manager_name ?? "без менеджера"}
              </li>
            ))}
          </ul>
        </div>
      )}
      {stopNoDate > 0 && (
        <p className="mb-4 text-xs text-amber-700">
          У {stopNoDate} потоков на стопе нет «Даты актуализации» в таблице — без неё не видно, льются ли они после стопа.
        </p>
      )}

      {silent.length > 0 && (
        <details className="mb-4 rounded-xl border border-rose-200 bg-rose-50/50 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-rose-900">
            Пуш менеджерам · не льют {NO_FTD_DAYS}+ дней: {silent.length}
          </summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {pushTexts(silent).map((p) => (
              <div key={p.manager}>
                <div className="mb-1 text-xs font-semibold text-slate-700">
                  {p.manager} · {p.count}
                </div>
                <CopyBox text={p.text} rows={Math.min(10, p.count + 3)} />
              </div>
            ))}
          </div>
        </details>
      )}

      <Card className="!p-4">
        {list.length === 0 ? (
          <Empty>{all.length ? "Ничего не нашлось — попробуй другой запрос или сбрось фильтры" : "Пока пусто — загрузи потоки из таблицы"}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <div className="mb-2 text-xs text-slate-500">Показано: {list.length}</div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-1.5">Ориг. ID</th>
                  <th className="px-2 py-1.5">Подмена</th>
                  <th className="px-2 py-1.5">Продукт</th>
                  <th className="px-2 py-1.5">Гео</th>
                  <th className="px-2 py-1.5">Сорс · подход</th>
                  <th className="px-2 py-1.5">Ставка</th>
                  <th className="px-2 py-1.5">Кап</th>
                  <th className="px-2 py-1.5">КПИ</th>
                  <th className="px-2 py-1.5">Менеджер</th>
                  <th className="px-2 py-1.5">Веб</th>
                  <th className="px-2 py-1.5">Статус</th>
                  <th className="px-2 py-1.5">Депы (мес)</th>
                  <th className="px-2 py-1.5">Не льёт</th>
                  <th className="px-2 py-1.5">Заметки</th>
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => {
                  const stopped = isStopped(s);
                  const silentRow = notPouring(s);
                  return (
                    <tr key={s.id} id={`s-${s.id}`} className={`border-b border-slate-100 align-middle hover:bg-slate-50 ${rowBg(s)}`}>
                      <td className={`${td} font-mono`}>{s.adv_stream_id ?? "—"}</td>
                      <td className={`${td} font-mono text-amber-700`}>{s.sub_id ?? ""}</td>
                      <td className={td}>
                        <span className="font-semibold text-slate-900">{s.offer_name ?? "без продукта"}</span>
                        <span className="ml-1 text-[10px] text-slate-400">{s.advertiser_name}</span>
                        {s.is_new && <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">новый</span>}
                      </td>
                      <td className={`${td} font-mono font-semibold`}>{s.geo_code}</td>
                      <td className={td}>{[s.source_code, s.approach_code].filter(Boolean).join(" · ")}</td>
                      <td className={td}>{money(s)}</td>
                      <td className={td}>{s.cap ?? ""}</td>
                      <td className={td}>{s.kpi == null ? "" : s.kpi ? "есть" : "нет"}</td>
                      <td className={td}>{s.manager_name ?? ""}</td>
                      <td className={`${td} max-w-44 truncate`} title={s.webmaster_name ?? ""}>
                        {s.webmaster_name ?? ""}
                      </td>
                      <td className={td}>
                        <StageSelect key={s.stage} id={s.id} stage={s.stage} />
                      </td>
                      <td className={`${td} font-semibold`}>{s.ftd ?? ""}</td>
                      <td
                        className={td}
                        title={`выдан: ${s.issued_on ? new Date(s.issued_on).toLocaleDateString("ru-RU") : "дата неизвестна"} · последнее изменение строки: ${new Date(s.changed_at).toLocaleDateString("ru-RU")}`}
                      >
                        {s.free_cap_id ? (
                          <Link href="/caps" className="text-[11px] font-semibold text-emerald-700 hover:underline">
                            → в свободных капах
                          </Link>
                        ) : stopped ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <span className={silentRow ? "font-semibold text-rose-600" : "text-slate-500"}>{s.days_no_ftd} дн</span>
                        )}
                      </td>
                      <td className={`${td} max-w-56 truncate text-slate-500`} title={s.notes ?? ""}>
                        {s.notes}
                      </td>
                      <td className="whitespace-nowrap px-1 py-1 text-right">
                        {!s.free_cap_id && !s.sub_id && s.adv_stream_id && (
                          <form action={moveStreamToCaps} className="inline">
                            <input type="hidden" name="id" value={s.id} />
                            <ConfirmSubmit message="Веб не будет лить — отдать капу в «Свободные капы»?" className={btnCls.ghost}>
                              → Капы
                            </ConfirmSubmit>
                          </form>
                        )}
                        <Link href={`/streams?edit=${s.id}`} className={btnCls.ghost}>
                          Изм.
                        </Link>
                        <form action={deleteStream} className="inline">
                          <input type="hidden" name="id" value={s.id} />
                          <ConfirmSubmit message="Удалить поток?" className={btnCls.danger}>
                            ×
                          </ConfirmSubmit>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[11px] text-slate-400">
          Зелёным — новые за сутки. Красным — не льёт {NO_FTD_DAYS}+ дней: «Отлито» не растёт, а если депов не было — прошло {NO_FTD_DAYS}+ дней с выдачи. Серым — стоп
          или капа ушла в свободные. При загрузке потоки с «неактуально» в комментариях сами уходят в свободные капы: оригинал выдан 7+ дней назад, подмен нет или на
          них нет депов и они выданы 5+ дней назад. «→ Капы» — отдать капу вручную.
        </p>
      </Card>
    </>
  );
}
