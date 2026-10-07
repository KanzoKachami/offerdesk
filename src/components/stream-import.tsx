"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import { importStreams, type ImportState } from "@/lib/launch-actions";
import { parseStreams } from "@/lib/parse-streams";
import { LAUNCH_STAGE } from "@/lib/request-meta";
import { btnCls, inputCls } from "@/components/ui";

type Opt = { value: string; label: string };

export function StreamImport({ advertisers, geoCodes, offerNames }: { advertisers: Opt[]; geoCodes: string[]; offerNames: string[] }) {
  const [text, setText] = useState("");
  const [stage, setStage] = useState("live");
  // рекл для каждого нового продукта: id или "new:Название"
  const [productAdv, setProductAdv] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState<Record<string, string>>({});
  const [state, dispatch, pending] = useActionState<ImportState, FormData>(importStreams, {});
  const parsed = useMemo(() => (text.trim() ? parseStreams(text, stage) : null), [text, stage]);
  const geos = useMemo(() => new Set(geoCodes.map((g) => (g === "GB" ? "UK" : g))), [geoCodes]);
  const offers = useMemo(() => new Set(offerNames.map((n) => n.toUpperCase())), [offerNames]);
  const rows = parsed?.rows ?? [];
  const newProducts = [...new Set(rows.filter((r) => r.product && !offers.has(r.product) && !r.advertiser).map((r) => r.product))];
  const advByName = useMemo(() => new Map(advertisers.map((a) => [a.label.toLowerCase(), a.value])), [advertisers]);
  // рекл, выбранный для продукта (по умолчанию — рекл с таким же названием, если есть)
  const advFor = (p: string) => productAdv[p] ?? advByName.get(p.toLowerCase()) ?? "";
  const unresolved = newProducts.filter((p) => {
    const v = advFor(p);
    return !v || (v === "new" && !(newName[p] ?? "").trim());
  });
  const badGeo = rows.filter((r) => !geos.has(r.geo === "GB" ? "UK" : r.geo));

  async function onFile(f: File | undefined) {
    if (f) setText(await f.text());
  }

  function submit() {
    const fd = new FormData();
    fd.set("rows", JSON.stringify(rows));
    const map: Record<string, string> = {};
    for (const p of newProducts) {
      const v = advFor(p);
      if (v === "new") map[p] = `new:${(newName[p] ?? "").trim()}`;
      else if (v) map[p] = v;
    }
    fd.set("product_adv", JSON.stringify(map));
    startTransition(() => dispatch(fd));
  }

  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
        <li>В гугл-таблице выдели строки потоков <b>вместе со строкой заголовков</b> и скопируй (Ctrl+C).</li>
        <li>Вставь сюда (Ctrl+V) — или загрузи CSV-файл (Файл → Скачать → CSV).</li>
        <li>Проверь предпросмотр и нажми «Загрузить».</li>
      </ol>

      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder="Вставь строки из таблицы…" className={`${inputCls} font-mono text-xs`} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">или CSV-файл</span>
          <input type="file" accept=".csv,.tsv,.txt" onChange={(e) => onFile(e.target.files?.[0])} className="text-sm" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Статус, если в строке не указан</span>
          <select value={stage} onChange={(e) => setStage(e.target.value)} className={inputCls}>
            {["live", "integrated", "waiting_link", "at_integrator"].map((s) => (
              <option key={s} value={s}>
                {LAUNCH_STAGE[s].label}
              </option>
            ))}
          </select>
        </label>

      </div>
      <p className="text-xs text-slate-500">Строки со «СТОП» в любой ячейке загрузятся со статусом «Стоп». Уже загруженные потоки (тот же ID и гео) пропускаются — можно грузить повторно.</p>

      {parsed?.error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{parsed.error}</p>}

      {parsed && !parsed.error && (
        <>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <b>Нашёл колонки:</b>{" "}
            {Object.entries(parsed.columns)
              .map(([k, v]) => `${k} ← «${v}»`)
              .join(" · ")}
          </div>
          {parsed.fixes.length > 0 && (
            <details className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
              <summary className="cursor-pointer font-semibold">Поправил при чтении: {parsed.fixes.length}</summary>
              <ul className="mt-1 list-disc pl-5">
                {parsed.fixes.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </details>
          )}
          {newProducts.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="mb-2 text-sm font-semibold text-amber-900">
                Новые продукты — выбери, чей это продукт ({newProducts.length})
              </div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {newProducts.map((p) => {
                  const v = advFor(p);
                  return (
                    <div key={p} className="flex items-center gap-2">
                      <span className="w-32 shrink-0 truncate text-sm font-semibold text-slate-900" title={p}>
                        {p}
                      </span>
                      <select
                        value={v}
                        onChange={(e) => setProductAdv({ ...productAdv, [p]: e.target.value })}
                        className={`${inputCls} !py-1 ${v ? "" : "!border-amber-400"}`}
                      >
                        <option value="">— рекл —</option>
                        {advertisers.map((a) => (
                          <option key={a.value} value={a.value}>
                            {a.label}
                          </option>
                        ))}
                        <option value="new">+ новый рекл…</option>
                      </select>
                      {v === "new" && (
                        <input
                          value={newName[p] ?? ""}
                          onChange={(e) => setNewName({ ...newName, [p]: e.target.value })}
                          placeholder="название"
                          className={`${inputCls} !w-32 !py-1`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {badGeo.length > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Гео нет в справочнике: <b>{[...new Set(badGeo.map((r) => r.geo || "пусто"))].join(", ")}</b> — такие строки пропущу. Добавь гео в Настройках.
            </p>
          )}
          <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-100 text-left text-slate-500">
                <tr>
                  {["Стр.", "Ориг. ID", "Подмена", "Продукт", "Гео", "Сорс", "Подход", "Ставка", "Кап", "КПИ", "Менеджер", "Веб", "Статус", "Заметки"].map((h) => (
                    <th key={h} className="px-2 py-1.5 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line} className={`border-t border-slate-100 ${r.stage === "stopped" ? "bg-rose-50" : ""}`}>
                    <td className="px-2 py-1 text-slate-400">{r.line}</td>
                    <td className="px-2 py-1 font-mono">{r.adv_stream_id}</td>
                    <td className="px-2 py-1 font-mono text-amber-700">{r.sub_id}</td>
                    <td className={`px-2 py-1 font-semibold ${offers.has(r.product) ? "" : "text-indigo-700"}`}>{r.product}</td>
                    <td className={`px-2 py-1 font-mono ${geos.has(r.geo === "GB" ? "UK" : r.geo) ? "" : "text-rose-600"}`}>{r.geo}</td>
                    <td className="px-2 py-1">{r.source}</td>
                    <td className="px-2 py-1">{r.approach}</td>
                    <td className="px-2 py-1">{r.rate != null ? `${r.currency === "EUR" ? "€" : "$"}${r.rate}` : ""}</td>
                    <td className="px-2 py-1">{r.cap}</td>
                    <td className="px-2 py-1">{r.kpi == null ? "" : r.kpi ? "есть" : "нет"}</td>
                    <td className="px-2 py-1">{r.manager}</td>
                    <td className="max-w-40 truncate px-2 py-1">{r.webmaster}</td>
                    <td className="px-2 py-1">{LAUNCH_STAGE[r.stage]?.label}</td>
                    <td className="max-w-60 truncate px-2 py-1 text-slate-500">{r.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {state.error && (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
          {state.problems && state.problems.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {state.problems.slice(0, 30).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="button" onClick={submit} disabled={pending || rows.length === 0} className={`${btnCls.primary} disabled:opacity-50`}>
          {pending ? "Загружаю…" : `Загрузить ${rows.length} строк`}
        </button>
        {unresolved.length > 0 && <span className="text-xs text-amber-700">Не выбран рекл для: {unresolved.join(", ")} — эти строки не загрузятся</span>}
      </div>
    </div>
  );
}
