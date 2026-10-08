import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CAP_FILTERS, loadCaps, type FreeCap } from "@/lib/caps-data";
import { affText, capMoney } from "@/lib/cap-match";
import { deleteCap } from "@/lib/caps-actions";
import { CapForm, type CapRow } from "@/components/cap-form";
import { CapStatusSelect } from "@/components/cap-controls";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { CopyBox } from "@/components/copy-box";
import { Card, Empty, Flash, PageHeader, btnCls, inputCls } from "@/components/ui";

const STALE_WARN = 7; // дней свободна — пора предлагать аффам
const STALE_BAD = 14;

export default async function CapsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const sb = await createClient();
  const [list, { data: offers }, { data: managers }, { data: geos }, { data: sources }, { data: approaches }, { data: counts }] = await Promise.all([
    loadCaps(sb, sp),
    sb.from("offers").select("id, name, advertisers(name)").order("name"),
    sb.from("managers").select("id, name").order("name"),
    sb.from("geos").select("code").order("code"),
    sb.from("sources").select("code").order("code"),
    sb.from("approaches").select("code").order("code"),
    sb.from("free_caps").select("status, geo_code"),
  ]);
  const offerOpts = (offers ?? []).map((o) => ({ value: o.id as string, label: `${o.name} — ${(o.advertisers as unknown as { name: string } | null)?.name ?? ""}` }));
  const managerOpts = (managers ?? []).map((m) => ({ value: m.id as string, label: m.name as string }));
  const n = (s: string) => (counts ?? []).filter((c) => c.status === s).length;
  const capGeos = [...new Set((counts ?? []).map((c) => c.geo_code as string))].sort();

  let editing: CapRow | undefined;
  if (sp.edit) {
    const { data } = await sb.from("free_caps").select("*").eq("id", sp.edit).maybeSingle();
    editing = (data as CapRow) ?? undefined;
  }
  const freeOnly = list.filter((c) => c.status === "free");
  const filterQs = new URLSearchParams(Object.entries(sp).filter(([k]) => ["q", "geo", "offer", "status"].includes(k))).toString();
  const td = "px-2 py-1.5 whitespace-nowrap";

  const rowBg = (c: FreeCap) =>
    c.status !== "free" ? "" : c.days_free >= STALE_BAD ? "bg-rose-50" : c.days_free >= STALE_WARN ? "bg-amber-50/70" : "";

  return (
    <>
      <PageHeader
        title="Свободные капы"
        subtitle={`Свободно: ${n("free")} · предложено: ${n("offered")} · выдано: ${n("issued")}. В подборе по запросу они идут первыми — рекл про подмену не знает.`}
        actions={
          <>
            <Link href="/caps/import" className={btnCls.secondary}>
              Загрузить списком
            </Link>
            <Link href="/caps?new=1" className={btnCls.primary}>
              + Капа
            </Link>
          </>
        }
      />
      <Flash sp={sp} />

      {(sp.new === "1" || editing) && (
        <Card title={editing ? "Редактирование капы" : "Новая свободная капа"} className="mb-6">
          <CapForm
            key={editing?.id ?? "new"}
            row={editing}
            offers={offerOpts}
            geos={(geos ?? []).map((g) => g.code as string)}
            sources={(sources ?? []).map((g) => g.code as string)}
            approaches={(approaches ?? []).map((g) => g.code as string)}
            managers={managerOpts}
          />
        </Card>
      )}

      <form className="mb-4 flex flex-wrap items-end gap-2" action="/caps">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Продукт, ID, веб, заметка…" className={`${inputCls} !w-60`} />
        <select name="geo" defaultValue={sp.geo ?? ""} className={`${inputCls} !w-28`}>
          <option value="">Все гео</option>
          {capGeos.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <select name="offer" defaultValue={sp.offer ?? ""} className={`${inputCls} !w-52`}>
          <option value="">Все продукты</option>
          {offerOpts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={sp.status ?? "active"} className={`${inputCls} !w-56`}>
          {Object.entries(CAP_FILTERS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <button className={btnCls.secondary}>Показать</button>
        {filterQs && (
          <Link href="/caps" className={btnCls.ghost}>
            Сбросить
          </Link>
        )}
      </form>

      <details className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-indigo-900">
          Выгрузка для аффов · свободных в списке: {freeOnly.length}
        </summary>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
          <CopyBox text={affText(freeOnly)} rows={Math.min(14, freeOnly.length + 5)} />
          <div>
            <a href={`/caps/export${filterQs ? `?${filterQs}` : ""}`} className={btnCls.secondary}>
              Скачать CSV
            </a>
            <p className="mt-2 max-w-48 text-xs text-slate-500">Только свободные капы с текущими фильтрами.</p>
          </div>
        </div>
      </details>

      <Card className="!p-4">
        {list.length === 0 ? (
          <Empty>Пока пусто — добавь капу или загрузи списком</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-1.5">Ориг. ID</th>
                  <th className="px-2 py-1.5">Продукт</th>
                  <th className="px-2 py-1.5">Гео</th>
                  <th className="px-2 py-1.5">Сорс · подход</th>
                  <th className="px-2 py-1.5">Кап</th>
                  <th className="px-2 py-1.5">Ставка</th>
                  <th className="px-2 py-1.5">Кто отказался</th>
                  <th className="px-2 py-1.5">Свободна</th>
                  <th className="px-2 py-1.5">Статус</th>
                  <th className="px-2 py-1.5">Кому</th>
                  <th className="px-2 py-1.5">Заметка</th>
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id} className={`border-b border-slate-100 align-middle hover:bg-slate-50 ${rowBg(c)}`}>
                    <td className={`${td} font-mono`}>{c.adv_stream_id ?? "—"}</td>
                    <td className={td}>
                      <span className="font-semibold text-slate-900">{c.offer_name}</span>
                      <span className="ml-1 text-[10px] text-slate-400">{c.advertiser_name}</span>
                    </td>
                    <td className={`${td} font-mono font-semibold`}>{c.geo_code}</td>
                    <td className={td}>{[c.source_code, c.approach_code].filter(Boolean).join(" · ")}</td>
                    <td className={`${td} font-semibold`}>{c.cap ?? ""}</td>
                    <td className={td}>{capMoney(c)}</td>
                    <td className={`${td} max-w-44 truncate`} title={c.released_by ?? ""}>
                      {c.released_by ?? ""}
                      {c.released_manager_name && <span className="ml-1 text-slate-400">· {c.released_manager_name}</span>}
                    </td>
                    <td className={td}>
                      <span className={c.status === "free" && c.days_free >= STALE_WARN ? "font-semibold text-amber-700" : "text-slate-500"}>
                        {c.days_free} дн
                      </span>
                    </td>
                    <td className={td}>
                      <CapStatusSelect key={c.status} id={c.id} status={c.status} />
                    </td>
                    <td className={td}>
                      {c.issued_webmaster && <span>{c.issued_webmaster}</span>}
                      {c.issued_manager_name && <span className="ml-1 text-slate-400">· {c.issued_manager_name}</span>}
                      {c.request_id && (
                        <Link href={`/requests/${c.request_id}`} className="ml-1 text-indigo-600 hover:underline">
                          #{c.request_number}
                        </Link>
                      )}
                    </td>
                    <td className={`${td} max-w-52 truncate text-slate-500`} title={c.notes ?? ""}>
                      {c.notes}
                    </td>
                    <td className="whitespace-nowrap px-1 py-1 text-right">
                      <Link href={`/caps?edit=${c.id}`} className={btnCls.ghost}>
                        Изм.
                      </Link>
                      <form action={deleteCap} className="inline">
                        <input type="hidden" name="id" value={c.id} />
                        <ConfirmSubmit message="Удалить капу?" className={btnCls.danger}>
                          ×
                        </ConfirmSubmit>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[11px] text-slate-400">
          Жёлтым — свободна {STALE_WARN}+ дней, красным — {STALE_BAD}+: пора скинуть аффам.
        </p>
      </Card>
    </>
  );
}
