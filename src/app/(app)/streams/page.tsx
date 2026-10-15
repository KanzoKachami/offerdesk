import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LAUNCH_STAGE } from "@/lib/request-meta";
import { deleteStream } from "@/lib/launch-actions";
import { StreamForm, type StreamFormRow } from "@/components/stream-form";
import { StageSelect } from "@/components/stream-controls";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { Card, Empty, Flash, PageHeader, btnCls, inputCls } from "@/components/ui";

// Потоки — список из гугл-таблицы, который загружается каждый день. Ни к чему не привязан.
const STALE_WARN = 7; // дней без изменений — подсвечиваем
const STALE_BAD = 14;

type S = StreamFormRow & {
  id: string;
  stage: string;
  offer_name: string | null;
  advertiser_name: string | null;
  manager_name: string | null;
  webmaster_name: string | null;
  days_unchanged: number;
  is_new: boolean;
  changed_at: string;
};

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
        (!staleOnly || (s.days_unchanged >= STALE_WARN && !["stopped", "no_traffic"].includes(s.stage))) &&
        (!newOnly || s.is_new) &&
        (!q ||
          [s.offer_name, s.advertiser_name, s.adv_stream_id, s.sub_id, s.geo_code, s.webmaster_name, s.manager_name, s.source_code, s.approach_code, s.notes]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)))
    )
    // сначала новые, потом самые «застоявшиеся»
    .sort((a, b) => Number(b.is_new) - Number(a.is_new) || b.days_unchanged - a.days_unchanged || String(a.offer_name).localeCompare(String(b.offer_name)));

  const activeAll = all.filter((s) => !["stopped", "no_traffic"].includes(s.stage));
  const staleCount = activeAll.filter((s) => s.days_unchanged >= STALE_WARN).length;
  const newCount = all.filter((s) => s.is_new).length;
  const editing = sp.edit ? all.find((s) => s.id === sp.edit) : undefined;
  const hasFilters = Boolean(q || sp.geo || sp.manager || staleOnly || newOnly || (sp.status && sp.status !== "active"));
  const td = "px-2 py-1.5 whitespace-nowrap";

  const rowBg = (s: S) => {
    if (s.is_new) return "bg-emerald-50/70";
    if (["stopped", "no_traffic"].includes(s.stage)) return "bg-slate-50 text-slate-400";
    if (s.days_unchanged >= STALE_BAD) return "bg-rose-50";
    if (s.days_unchanged >= STALE_WARN) return "bg-amber-50/70";
    return "";
  };

  return (
    <>
      <PageHeader
        title="Потоки"
        subtitle={`Всего: ${all.length} · новых за сутки: ${newCount} · без изменений ${STALE_WARN}+ дней: ${staleCount}`}
        actions={
          <>
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
          без изменений {STALE_WARN}+ дн
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
                  <th className="px-2 py-1.5">Без изменений</th>
                  <th className="px-2 py-1.5">Заметки</th>
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => {
                  const stopped = ["stopped", "no_traffic"].includes(s.stage);
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
                      <td className={td} title={`последнее изменение: ${new Date(s.changed_at).toLocaleDateString("ru-RU")}`}>
                        <span
                          className={
                            stopped
                              ? "text-slate-400"
                              : s.days_unchanged >= STALE_BAD
                                ? "font-semibold text-rose-600"
                                : s.days_unchanged >= STALE_WARN
                                  ? "font-semibold text-amber-700"
                                  : "text-slate-500"
                          }
                        >
                          {s.days_unchanged} дн
                        </span>
                      </td>
                      <td className={`${td} max-w-56 truncate text-slate-500`} title={s.notes ?? ""}>
                        {s.notes}
                      </td>
                      <td className="whitespace-nowrap px-1 py-1 text-right">
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
          Зелёным — новые за сутки. Жёлтым — без изменений {STALE_WARN}+ дней, красным — {STALE_BAD}+. Изменение = что-то поменялось при загрузке (кап, ставка, веб,
          менеджер, заметка, «СТОП») или ты поправил вручную. Статусы: {LAUNCH_STAGE.live.label}, {LAUNCH_STAGE.stopped.label} и т.д. меняются прямо в строке.
        </p>
      </Card>
    </>
  );
}
