"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { addProducts, createAdvertiserWithProducts, type AdvFormState } from "@/lib/advertiser-actions";
import { btnCls, inputCls } from "@/components/ui";

type Row = { key: number; name: string; geos: string; sources: string };
const emptyRow = (key: number): Row => ({ key, name: "", geos: "", sources: "" });

const codes = (s: string) => [...new Set(s.toUpperCase().split(/[\s,;\/]+/).filter(Boolean).map((g) => (g === "GB" ? "UK" : g)))];

function CodeHints({ text, known }: { text: string; known: Set<string> }) {
  const list = codes(text);
  if (!list.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {list.map((c) => (
        <span key={c} className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${known.has(c) ? "bg-indigo-50 text-indigo-700" : "bg-rose-50 text-rose-700"}`}>
          {c}
          {!known.has(c) && " — нет в справочнике"}
        </span>
      ))}
    </div>
  );
}

/** Строки продуктов: название + гео + сорсы. */
function ProductRows({ rows, setRows, geos, sources }: { rows: Row[]; setRows: (r: Row[]) => void; geos: Set<string>; sources: Set<string> }) {
  const update = (key: number, patch: Partial<Row>) => setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={r.key} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_2fr_1.5fr_auto]">
          <div>
            {i === 0 && <span className="mb-1 block text-xs font-medium text-slate-500">Продукт</span>}
            <input name="p_name" value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} placeholder="SANKRA" className={`${inputCls} uppercase`} />
          </div>
          <div>
            {i === 0 && <span className="mb-1 block text-xs font-medium text-slate-500">Гео (через запятую)</span>}
            <input name="p_geos" value={r.geos} onChange={(e) => update(r.key, { geos: e.target.value })} placeholder="DE, ES, IT, UK" className={inputCls} />
            <CodeHints text={r.geos} known={geos} />
          </div>
          <div>
            {i === 0 && <span className="mb-1 block text-xs font-medium text-slate-500">Сорсы (пусто — любой)</span>}
            <input name="p_sources" value={r.sources} onChange={(e) => update(r.key, { sources: e.target.value })} placeholder="FB, APPS, SEO" className={inputCls} />
            <CodeHints text={r.sources} known={sources} />
          </div>
          <div className={i === 0 ? "md:pt-5" : ""}>
            <button
              type="button"
              onClick={() => setRows(rows.length > 1 ? rows.filter((x) => x.key !== r.key) : [emptyRow(Date.now())])}
              className={btnCls.danger}
              title="Убрать строку"
            >
              ×
            </button>
          </div>
        </div>
      ))}
      <button type="button" onClick={() => setRows([...rows, emptyRow(Date.now())])} className={btnCls.secondary}>
        + ещё продукт
      </button>
    </div>
  );
}

const initial: AdvFormState = {};

/** Новый рекламодатель + его продукты одной формой. */
export function NewAdvertiserForm({ geoCodes, sourceCodes }: { geoCodes: string[]; sourceCodes: string[] }) {
  const [state, dispatch, pending] = useActionState(createAdvertiserWithProducts, initial);
  const [rows, setRows] = useState<Row[]>([emptyRow(1)]);
  const [adv, setAdv] = useState({ name: "", tier: "key", lang: "RU", contact: "", tg_username: "", chat_link: "", notes: "" });
  const geos = new Set(geoCodes);
  const sources = new Set(sourceCodes);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  }
  const field = (k: keyof typeof adv, label: string, extra?: { placeholder?: string; required?: boolean }) => (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">
        {label}
        {extra?.required && <span className="text-rose-500"> *</span>}
      </span>
      <input name={k} value={adv[k]} onChange={(e) => setAdv({ ...adv, [k]: e.target.value })} placeholder={extra?.placeholder} required={extra?.required} className={inputCls} />
    </label>
  );

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {field("name", "Название", { required: true, placeholder: "Gambleon" })}
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Уровень</span>
          <select name="tier" value={adv.tier} onChange={(e) => setAdv({ ...adv, tier: e.target.value })} className={inputCls}>
            <option value="key">Ключевой</option>
            <option value="occasional">Разовый</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Язык общения</span>
          <select name="lang" value={adv.lang} onChange={(e) => setAdv({ ...adv, lang: e.target.value })} className={inputCls}>
            <option value="RU">Русский</option>
            <option value="EN">English</option>
          </select>
        </label>
        {field("contact", "Контакт")}
        {field("tg_username", "Telegram username", { placeholder: "без @" })}
        {field("chat_link", "Ссылка на чат")}
        {field("notes", "Заметки")}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">Продукты рекла</h3>
        <ProductRows rows={rows} setRows={setRows} geos={geos} sources={sources} />
      </div>

      {state.error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}
      <button type="submit" disabled={pending} className={`${btnCls.primary} disabled:opacity-60`}>
        {pending ? "Сохраняю…" : "Добавить рекламодателя"}
      </button>
    </form>
  );
}

/** Несколько продуктов разом в карточке рекла. */
export function AddProductsForm({ advertiserId, geoCodes, sourceCodes }: { advertiserId: string; geoCodes: string[]; sourceCodes: string[] }) {
  const [state, dispatch, pending] = useActionState(addProducts, initial);
  const [rows, setRows] = useState<Row[]>([emptyRow(1)]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="advertiser_id" value={advertiserId} />
      <ProductRows rows={rows} setRows={setRows} geos={new Set(geoCodes)} sources={new Set(sourceCodes)} />
      {state.error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}
      <button type="submit" disabled={pending} className={`${btnCls.primary} disabled:opacity-60`}>
        {pending ? "Сохраняю…" : "Добавить продукты"}
      </button>
    </form>
  );
}
