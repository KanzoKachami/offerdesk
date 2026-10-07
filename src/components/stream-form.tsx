import Link from "next/link";
import { saveStream } from "@/lib/launch-actions";
import { LAUNCH_STAGE, STREAM_STAGES } from "@/lib/request-meta";
import { ActionForm } from "@/components/action-form";
import { PendingButton } from "@/components/pending-button";
import { btnCls, inputCls } from "@/components/ui";

type Opt = { value: string; label: string };
export type StreamFormRow = Partial<{
  id: string;
  offer_id: string | null;
  geo_code: string | null;
  source_code: string | null;
  approach_code: string | null;
  rate: number | null;
  currency: string | null;
  cap: number | null;
  kpi: boolean | null;
  manager_id: string | null;
  webmaster: string | null;
  webmaster_name: string | null;
  adv_stream_id: string | null;
  sub_id: string | null;
  stage: string;
  notes: string | null;
  stop_reason: string | null;
}>;

function F({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

/** Форма потока: ручное добавление и редактирование. */
export function StreamForm({
  row,
  offers,
  geos,
  sources,
  approaches,
  managers,
}: {
  row?: StreamFormRow;
  offers: Opt[];
  geos: string[];
  sources: string[];
  approaches: string[];
  managers: Opt[];
}) {
  const r = row ?? {};
  const kpi = r.kpi == null ? "" : r.kpi ? "yes" : "no";
  return (
    <ActionForm action={saveStream} className="space-y-4">
      {r.id && <input type="hidden" name="id" value={r.id} />}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <F label="Оригинальный ID" hint="ID потока у рекла">
          <input name="adv_stream_id" defaultValue={r.adv_stream_id ?? ""} placeholder="118181" className={`${inputCls} font-mono`} />
        </F>
        <F label="Подмена" hint="пусто — льёт оригинал">
          <input name="sub_id" defaultValue={r.sub_id ?? ""} placeholder="119331" className={`${inputCls} font-mono`} />
        </F>
        <div className="col-span-2">
          <F label="Продукт *">
            <select name="offer_id" required defaultValue={r.offer_id ?? ""} className={inputCls}>
              <option value="">Выбери…</option>
              {offers.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </F>
        </div>
        <F label="Гео *">
          <select name="geo_code" required defaultValue={r.geo_code ?? ""} className={inputCls}>
            <option value="">—</option>
            {geos.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </F>
        <F label="Статус">
          <select name="stage" defaultValue={r.stage === "link_received" ? "at_integrator" : r.stage === "ftd" ? "live" : (r.stage ?? "waiting_link")} className={inputCls}>
            {STREAM_STAGES.map((s) => (
              <option key={s} value={s}>
                {LAUNCH_STAGE[s].label}
              </option>
            ))}
          </select>
        </F>
        <F label="Сорс">
          <input name="source_code" list="dl-sources" defaultValue={r.source_code ?? ""} placeholder="FB" className={`${inputCls} uppercase`} />
        </F>
        <F label="Подход">
          <input name="approach_code" list="dl-approaches" defaultValue={r.approach_code ?? ""} placeholder="SLOTS" className={`${inputCls} uppercase`} />
        </F>
        <F label="Ставка">
          <div className="flex gap-1">
            <input name="rate" defaultValue={r.rate ?? ""} placeholder="240" className={inputCls} />
            <select name="currency" defaultValue={r.currency ?? "USD"} className={`${inputCls} !w-20`}>
              <option value="USD">$</option>
              <option value="EUR">€</option>
            </select>
          </div>
        </F>
        <F label="Кап">
          <input name="cap" defaultValue={r.cap ?? ""} placeholder="20" className={inputCls} />
        </F>
        <F label="КПИ">
          <select name="kpi" defaultValue={kpi} className={inputCls}>
            <option value="">—</option>
            <option value="yes">есть</option>
            <option value="no">нет</option>
          </select>
        </F>
        <F label="Менеджер">
          <select name="manager_id" defaultValue={r.manager_id ?? ""} className={inputCls}>
            <option value="">—</option>
            {managers.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </F>
        <div className="col-span-2">
          <F label="Веб">
            <input name="webmaster" defaultValue={r.webmaster ?? r.webmaster_name ?? ""} placeholder="cpabro@familyteam.top" className={inputCls} />
          </F>
        </div>
        <div className="col-span-2 md:col-span-4">
          <F label="Заметки">
            <textarea name="notes" rows={2} defaultValue={r.notes ?? ""} placeholder="тут строго с 1-го октября · доливаем 15 тотал" className={inputCls} />
          </F>
        </div>
        <div className="col-span-2">
          <F label="Причина стопа">
            <input name="stop_reason" defaultValue={r.stop_reason ?? ""} placeholder="бюджет" className={inputCls} />
          </F>
        </div>
      </div>
      <datalist id="dl-sources">
        {sources.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <datalist id="dl-approaches">
        {approaches.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <div className="flex gap-2">
        <PendingButton className={btnCls.primary}>{r.id ? "Сохранить" : "Добавить поток"}</PendingButton>
        <Link href={r.id ? `/streams?open=${r.id}#s-${r.id}` : "/streams"} className={btnCls.secondary}>
          Отмена
        </Link>
      </div>
    </ActionForm>
  );
}
