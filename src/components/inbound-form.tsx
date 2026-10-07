"use client";

import { useState, useTransition } from "react";
import { createAdvertiserRequest, findPingTargets, registerPing, type PingTarget } from "@/lib/inbound-actions";
import { parseRequestText, type ParseDicts } from "@/lib/parse-request";
import { btnCls, inputCls } from "@/components/ui";

// Пинг по уже начатому: «any updates», «когда старт», «что по»…
const PING_RE = /(update|any news|news\??|status|start|launch|live|ready|hope we|когда|что по|статус|запуст|стартан|есть новости|апдейт)/i;

export function InboundForm({ advertisers, dicts }: { advertisers: { id: string; name: string }[]; dicts: ParseDicts }) {
  const [adv, setAdv] = useState("");
  const [raw, setRaw] = useState("");
  const [intent, setIntent] = useState<"ping" | "demand" | null>(null);
  const [geos, setGeos] = useState("");
  const [source, setSource] = useState("");
  const [targets, setTargets] = useState<PingTarget[] | null>(null);
  const [target, setTarget] = useState<string>("");
  const [loading, startLoading] = useTransition();

  function parse() {
    const d = parseRequestText(raw, dicts);
    setGeos(d.geos.join(", "));
    setSource(d.source ?? "");
    const isPing = PING_RE.test(raw) && !/what do you have|have for|check|нужен|ищем|есть ли/i.test(raw);
    setIntent(isPing ? "ping" : "demand");
    setTargets(null);
    setTarget("");
    if (isPing && adv) loadTargets(d.geos);
  }

  function loadTargets(g: string[]) {
    startLoading(async () => {
      const list = await findPingTargets(adv, g);
      setTargets(list);
      setTarget(list[0] ? `${list[0].type}:${list[0].id}` : "");
    });
  }

  const geoList = geos.toUpperCase().split(/[\s,;\/]+/).filter(Boolean);
  const label = (t: string) => <span className="mb-1 block text-xs font-medium text-slate-500">{t}</span>;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        <label className="block">
          {label("Рекламодатель *")}
          <select
            value={adv}
            onChange={(e) => {
              setAdv(e.target.value);
              setTargets(null);
            }}
            className={inputCls}
          >
            <option value="">Выбери…</option>
            {advertisers.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div>
        {label("Сообщение рекла")}
        <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={5} placeholder="Hey! Any updates regarding UK FB? / What do you have for BR atm?" className={`${inputCls} font-mono text-xs`} />
        <button type="button" onClick={parse} disabled={!raw.trim() || !adv} className={`${btnCls.secondary} mt-2`}>
          Разобрать
        </button>
        {!adv && raw && <span className="ml-3 text-xs text-amber-700">Сначала выбери рекламодателя</span>}
      </div>

      {intent && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-500">Что это:</span>
            {(["ping", "demand"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  setIntent(v);
                  if (v === "ping" && !targets) loadTargets(geoList);
                }}
                className={`rounded-md border px-3 py-1 text-xs ${intent === v ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-300 bg-white text-slate-600"}`}
              >
                {v === "ping" ? "Пинг по уже начатому" : "Новый спрос — ищет трафик"}
              </button>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="block">
              {label("Гео")}
              <input value={geos} onChange={(e) => setGeos(e.target.value)} placeholder="BR, AU" className={inputCls} />
            </label>
            <label className="block">
              {label("Сорс")}
              <select value={source} onChange={(e) => setSource(e.target.value)} className={inputCls}>
                <option value="">—</option>
                {dicts.sources.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {intent === "ping" && (
            <form action={registerPing} className="space-y-3">
              <input type="hidden" name="raw_text" value={raw} />
              <input type="hidden" name="target_type" value={target.split(":")[0] ?? ""} />
              <input type="hidden" name="target_id" value={target.split(":")[1] ?? ""} />
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-slate-700">К чему относится?</span>
                <button type="button" onClick={() => loadTargets(geoList)} className={btnCls.ghost}>
                  {loading ? "ищу…" : "обновить список"}
                </button>
              </div>
              {targets && targets.length === 0 && (
                <p className="text-sm text-amber-700">
                  У этого рекла нет открытых запусков и запросов{geoList.length ? ` по ${geoList.join(", ")}` : ""}. Возможно, это новый спрос — переключи выше.
                </p>
              )}
              <div className="space-y-1">
                {(targets ?? []).map((t) => (
                  <label key={`${t.type}:${t.id}`} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-white">
                    <input type="radio" checked={target === `${t.type}:${t.id}`} onChange={() => setTarget(`${t.type}:${t.id}`)} className="accent-indigo-600" />
                    {t.label}
                  </label>
                ))}
              </div>
              <button disabled={!target} className={`${btnCls.primary} disabled:opacity-50`}>
                Привязать пинг — «рекл ждёт»
              </button>
            </form>
          )}

          {intent === "demand" && (
            <form action={createAdvertiserRequest} className="space-y-2">
              <input type="hidden" name="advertiser_id" value={adv} />
              <input type="hidden" name="geos_text" value={geos} />
              <input type="hidden" name="source_code" value={source} />
              <input type="hidden" name="raw_text" value={raw} />
              <p className="text-sm text-slate-600">
                Создам запрос «от рекла»: по позиции на каждое гео ({geoList.join(", ") || "—"}). Дальше в карточке выберешь, каких менеджеров спросить.
              </p>
              <button disabled={!geoList.length} className={`${btnCls.primary} disabled:opacity-50`}>
                Создать запрос от рекла
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
