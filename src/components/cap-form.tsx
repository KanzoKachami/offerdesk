import Link from "next/link";
import { saveCap } from "@/lib/caps-actions";
import { CAP_STATUS } from "@/lib/request-meta";
import { ActionForm } from "@/components/action-form";
import { PendingButton } from "@/components/pending-button";
import { btnCls, inputCls } from "@/components/ui";

type Opt = { value: string; label: string };
export type CapRow = {
  id: string;
  offer_id: string;
  geo_code: string;
  source_code: string | null;
  approach_code: string | null;
  adv_stream_id: string | null;
  cap: number | null;
  rate: number | null;
  currency: string;
  released_by: string | null;
  released_manager_id: string | null;
  released_at: string;
  status: string;
  notes: string | null;
};

function F({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

/** Форма свободной капы. */
export function CapForm({ row, offers, geos, sources, approaches, managers }: { row?: CapRow; offers: Opt[]; geos: string[]; sources: string[]; approaches: string[]; managers: Opt[] }) {
  const r = row;
  return (
    <ActionForm action={saveCap} className="space-y-4">
      {r && <input type="hidden" name="id" value={r.id} />}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <F label="Продукт *" className="col-span-2">
          <select name="offer_id" required defaultValue={r?.offer_id ?? ""} className={inputCls}>
            <option value="">Выбери…</option>
            {offers.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </F>
        <F label="Гео *">
          <select name="geo_code" required defaultValue={r?.geo_code ?? ""} className={inputCls}>
            <option value="">—</option>
            {geos.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </F>
        <F label="Оригинальный ID у рекла">
          <input name="adv_stream_id" defaultValue={r?.adv_stream_id ?? ""} placeholder="118185" className={`${inputCls} font-mono`} />
        </F>
        <F label="Сорс">
          <input name="source_code" list="dl-cap-sources" defaultValue={r?.source_code ?? ""} placeholder="FB" className={`${inputCls} uppercase`} />
        </F>
        <F label="Подход">
          <input name="approach_code" list="dl-cap-approaches" defaultValue={r?.approach_code ?? ""} placeholder="SLOTS" className={`${inputCls} uppercase`} />
        </F>
        <F label="Кап">
          <input name="cap" defaultValue={r?.cap ?? ""} placeholder="20" className={inputCls} />
        </F>
        <F label="Ставка">
          <div className="flex gap-1">
            <input name="rate" defaultValue={r?.rate ?? ""} placeholder="240" className={inputCls} />
            <select name="currency" defaultValue={r?.currency ?? "USD"} className={`${inputCls} !w-16 !px-2`}>
              <option value="USD">$</option>
              <option value="EUR">€</option>
            </select>
          </div>
        </F>
        <F label="Кто отказался (веб)" className="col-span-2">
          <input name="released_by" defaultValue={r?.released_by ?? ""} placeholder="m31323340@gmail.com" className={inputCls} />
        </F>
        <F label="Менеджер того веба">
          <select name="released_manager_id" defaultValue={r?.released_manager_id ?? ""} className={inputCls}>
            <option value="">—</option>
            {managers.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </F>
        <F label="Свободна с">
          <input type="date" name="released_at" defaultValue={r?.released_at ?? new Date().toISOString().slice(0, 10)} className={inputCls} />
        </F>
        {r && (
          <F label="Статус">
            <select name="status" defaultValue={r.status} className={inputCls}>
              {Object.entries(CAP_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </F>
        )}
        <F label="Заметка" className="col-span-2 md:col-span-4 xl:col-span-6">
          <input name="notes" defaultValue={r?.notes ?? ""} placeholder="только SEO, до конца месяца…" className={inputCls} />
        </F>
      </div>
      <datalist id="dl-cap-sources">
        {sources.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <datalist id="dl-cap-approaches">
        {approaches.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <div className="flex gap-2">
        <PendingButton className={btnCls.primary}>{r ? "Сохранить" : "Добавить капу"}</PendingButton>
        <Link href="/caps" className={btnCls.secondary}>
          Отмена
        </Link>
      </div>
    </ActionForm>
  );
}
