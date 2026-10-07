"use client";

import { useMemo, useState } from "react";
import { createRequest } from "@/lib/request-actions";
import { parseRequestText, type ParseDicts } from "@/lib/parse-request";
import { PRIORITY, REQUEST_TYPE } from "@/lib/request-meta";
import { btnCls, inputCls } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";

type Opt = { id: string; name: string };

export function RequestForm({
  managers,
  assignees,
  dicts,
  webmasters,
}: {
  managers: Opt[];
  assignees: { id: string; name: string; tg_username: string | null; is_me: boolean }[];
  dicts: ParseDicts;
  webmasters: string[];
}) {
  const me = assignees.filter((a) => a.is_me).map((a) => a.id);
  const [raw, setRaw] = useState("");
  const [managerId, setManagerId] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>(me);
  const [wmName, setWmName] = useState("");
  const [wmContact, setWmContact] = useState("");
  const [type, setType] = useState("offer_search");
  const [source, setSource] = useState("");
  const [approach, setApproach] = useState("");
  const [inhouse, setInhouse] = useState(false);
  const [priority, setPriority] = useState("normal");
  const [brandId, setBrandId] = useState("");
  const [product, setProduct] = useState("");
  const [geosText, setGeosText] = useState("");
  const [rateMin, setRateMin] = useState("");
  const [rateMax, setRateMax] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [model, setModel] = useState("CPA");
  const [hints, setHints] = useState<string[]>([]);

  const geoSet = useMemo(() => new Set(dicts.geos), [dicts.geos]);
  const geoTokens = geosText
    .toUpperCase()
    .split(/[\s,;\/]+/)
    .filter(Boolean)
    .map((g) => (g === "GB" ? "UK" : g));

  function parse() {
    const d = parseRequestText(raw, dicts);
    if (d.geos.length) setGeosText(d.geos.join(", "));
    if (d.source) setSource(d.source);
    if (d.approach) setApproach(d.approach);
    setInhouse(d.inhouse);
    if (d.brandId) {
      setBrandId(d.brandId);
      setProduct("");
    } else if (d.product) {
      setBrandId("");
      setProduct(d.product);
    }
    if (d.rateMin != null) setRateMin(String(d.rateMin));
    if (d.rateMax != null) setRateMax(String(d.rateMax));
    setCurrency(d.currency);
    if (d.model) setModel(d.model);
    if (d.webmasterName) setWmName(d.webmasterName);
    if (d.webmasterContact) setWmContact(d.webmasterContact);
    if (d.assigneeIds.length) setAssigneeIds(d.assigneeIds);
    const found = [
      d.geos.length ? `гео ${d.geos.join(", ")}` : null,
      d.source ? `сорс ${d.source}` : null,
      d.approach ? `подход ${d.approach}` : null,
      d.inhouse ? "инхаус" : null,
      d.product ? `продукт ${d.product}` : null,
      d.webmasterName ? `веб ${d.webmasterName}` : null,
    ].filter(Boolean);
    setHints([found.length ? `Распознано: ${found.join(" · ")}` : "Ничего не распознал — заполни вручную", ...d.notes]);
  }

  const label = (t: string, req?: boolean) => (
    <span className="mb-1 block text-xs font-medium text-slate-500">
      {t}
      {req && <span className="text-rose-500"> *</span>}
    </span>
  );

  return (
    <form action={createRequest} className="space-y-5">
      <div>
        {label("Сообщение менеджера")}
        <textarea
          name="raw_text"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={7}
          placeholder={"Вставь сообщение из чата — шаблон #запрос или свободный текст"}
          className={`${inputCls} font-mono text-xs`}
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button type="button" onClick={parse} disabled={!raw.trim()} className={btnCls.secondary}>
            Разобрать текст
          </button>
          {hints.map((h, i) => (
            <span key={i} className={`text-xs ${i === 0 ? "text-emerald-700" : "text-amber-700"}`}>
              {h}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <label className="block">
          {label("Менеджер", true)}
          <select name="manager_id" value={managerId} onChange={(e) => setManagerId(e.target.value)} required className={inputCls}>
            <option value="">Выбери…</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          {label("Вебмастер / команда")}
          <input name="webmaster_name" list="wm-list" value={wmName} onChange={(e) => setWmName(e.target.value)} className={inputCls} />
          <datalist id="wm-list">
            {webmasters.map((w) => (
              <option key={w} value={w} />
            ))}
          </datalist>
        </label>
        <label className="block">
          {label("Контакт веба")}
          <input name="webmaster_contact" value={wmContact} onChange={(e) => setWmContact(e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          {label("Тип")}
          <select name="type" value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
            {REQUEST_TYPE.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <label className="block md:col-span-2">
          {label("Гео (через запятую)", true)}
          <input name="geos_text" value={geosText} onChange={(e) => setGeosText(e.target.value)} placeholder="DE, AT, ES" className={inputCls} />
          <div className="mt-1 flex flex-wrap gap-1">
            {geoTokens.map((g) => (
              <span key={g} className={`rounded px-1.5 py-0.5 text-xs ${geoSet.has(g) ? "bg-indigo-50 text-indigo-700" : "bg-rose-50 text-rose-700"}`}>
                {g}
                {!geoSet.has(g) && " — нет в справочнике"}
              </span>
            ))}
          </div>
        </label>
        <label className="block">
          {label("Сорс")}
          <select name="source_code" value={source} onChange={(e) => setSource(e.target.value)} className={inputCls}>
            <option value="">—</option>
            {dicts.sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          {label("Подход")}
          <select name="approach_code" value={approach} onChange={(e) => setApproach(e.target.value)} className={inputCls}>
            <option value="">—</option>
            {dicts.approaches.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <label className="block">
          {label("Оффер (если просят конкретный)")}
          <select name="offer_id" value={brandId} onChange={(e) => setBrandId(e.target.value)} className={inputCls}>
            <option value="">— подбор, любой —</option>
            {dicts.brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          {label("…или продукт текстом")}
          <input name="product_text" value={product} onChange={(e) => setProduct(e.target.value)} disabled={Boolean(brandId)} placeholder="если оффера нет в базе" className={inputCls} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            {label("Ставка от")}
            <input name="rate_min" value={rateMin} onChange={(e) => setRateMin(e.target.value)} inputMode="decimal" className={inputCls} />
          </label>
          <label className="block">
            {label("до")}
            <input name="rate_max" value={rateMax} onChange={(e) => setRateMax(e.target.value)} inputMode="decimal" className={inputCls} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            {label("Модель")}
            <select name="model" value={model} onChange={(e) => setModel(e.target.value)} className={inputCls}>
              {["CPA", "RS", "Hybrid", "CPL", "other"].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            {label("Валюта")}
            <select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputCls}>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-6">
        <div>
          {label("Адресаты")}
          <div className="flex flex-wrap gap-1.5">
            {assignees.map((a) => (
              <label key={a.id} className="cursor-pointer">
                <input
                  type="checkbox"
                  name="assignee_ids"
                  value={a.id}
                  checked={assigneeIds.includes(a.id)}
                  onChange={(e) => setAssigneeIds((prev) => (e.target.checked ? [...prev, a.id] : prev.filter((x) => x !== a.id)))}
                  className="peer sr-only"
                />
                <span className="inline-block rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 peer-checked:border-indigo-500 peer-checked:bg-indigo-50 peer-checked:text-indigo-700">
                  {a.tg_username ? `@${a.tg_username}` : a.name}
                  {a.is_me ? " (я)" : ""}
                </span>
              </label>
            ))}
            {assignees.length === 0 && <span className="text-xs text-slate-400">Заведи адресатов в разделе «Адресаты»</span>}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="is_inhouse" checked={inhouse} onChange={(e) => setInhouse(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
          Инхаус-команда (подбирать [INH])
        </label>
        <label className="block">
          {label("Приоритет")}
          <select name="priority" value={priority} onChange={(e) => setPriority(e.target.value)} className={inputCls}>
            {PRIORITY.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        {label("Заметка")}
        <input name="notes" className={inputCls} />
      </label>

      <PendingButton className={btnCls.primary}>Создать запрос</PendingButton>
    </form>
  );
}
