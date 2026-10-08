// Готовые тексты: запрос реклу и ответ менеджеру.
import { rateLabel } from "@/lib/request-meta";

export type TextRequest = {
  number: number;
  webmaster_name: string | null;
  source_code: string | null;
  approach_code: string | null;
  is_inhouse: boolean;
};

export type TextItem = {
  geo_code: string;
  rate_min: number | null;
  rate_max: number | null;
  currency: string;
  model: string | null;
  status: string;
  outcome: string | null;
  outcome_note: string | null;
  offers: {
    display_name: string;
    advertiser_name: string;
    status: string;
    outcome: string | null;
    offered_rate: number | null;
    offered_cap: number | null;
    conditions: string | null;
    currency: string;
  }[];
  /** Свободные капы, предложенные/выданные на подмену: готовые строки «CRUSADO [FB] — кап 20, $240 (ID 118185)» */
  caps?: string[];
};

/** Сообщение реклу по его офферам из запроса. */
export function advertiserText(r: TextRequest, lines: { offer: string; item: TextItem }[], lang: string = "RU") {
  const en = lang === "EN";
  const traffic = [r.is_inhouse ? (en ? "in-house" : "инхаус") : null, r.source_code, r.approach_code].filter(Boolean).join(", ");
  const body = lines
    .map(({ offer, item }) => {
      const rate = rateLabel(item.rate_min, item.rate_max, item.currency);
      const rateWord = en ? "rate" : "ставка";
      return `• ${offer}${rate ? ` — ${rateWord} ${item.model ? `${item.model} ` : ""}${rate}` : ""}`;
    })
    .join("\n");
  return (en
    ? ["Hi! We have a traffic request:", traffic ? `Traffic: ${traffic}` : null, "", body, "", "Can we launch? Please share the terms and cap."]
    : ["Привет! Есть запрос под трафик:", traffic ? `Трафик: ${traffic}` : null, "", body, "", "Сможем запустить? Подскажи условия и капу."]
  )
    .filter((x) => x !== null)
    .join("\n");
}

const ICON: Record<string, string> = { approved: "✅", partial: "⚠️", declined: "❌" };

/** Сводка ответа менеджеру по всему запросу. */
export function managerText(r: TextRequest, items: TextItem[]) {
  const head = `Ответ по запросу #${r.number}${r.webmaster_name ? ` (${r.webmaster_name})` : ""}:`;
  const rows = items.map((it) => {
    const answered = it.offers.filter((o) => o.status === "answered");
    const capLines = (it.caps ?? []).map((c) => `🔁 ${c} — можно запускать сразу`);
    if (answered.length === 0 && capLines.length) return `${it.geo_code}:\n  ${capLines.join("\n  ")}`;
    if (answered.length === 0) {
      if (it.status === "closed" && it.outcome) return `${it.geo_code} — ${ICON[it.outcome]} ${it.outcome_note ?? ""}`.trim();
      if (it.status === "archived") return `${it.geo_code} — ❌ рекл не ответил`;
      return `${it.geo_code} — ⏳ в работе`;
    }
    const parts = answered.map((o) => {
      const cond = [
        o.offered_rate != null ? `${o.currency === "EUR" ? "€" : "$"}${o.offered_rate}` : null,
        o.offered_cap != null ? `капа ${o.offered_cap}` : null,
        o.conditions,
      ]
        .filter(Boolean)
        .join(", ");
      return `${ICON[o.outcome ?? "partial"]} ${o.display_name}${o.outcome === "declined" ? " — отказ" : cond ? ` — ${cond}` : ""}`;
    });
    return `${it.geo_code}:\n  ${[...capLines, ...parts].join("\n  ")}`;
  });
  return [head, "", ...rows].join("\n");
}

// ---------------------------------------------------------------------
// Запросы «от рекла»: текст менеджерам (RU) и ответ реклу (RU/EN)
// ---------------------------------------------------------------------
export function managersAskText(advertiserName: string, geos: string[], source: string | null, raw: string | null) {
  return [
    `Рекл ${advertiserName} ищет трафик: ${geos.join(", ")}${source ? ` (${source})` : ""}.`,
    "Есть кто-то из вебов под это? Если да — объёмы и сорс.",
    raw ? `\nИсходное сообщение рекла:\n«${raw.trim()}»` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function advertiserReplyText(
  lang: string,
  rows: { geo: string; answers: { outcome: string | null; text: string | null }[] }[]
) {
  const en = lang === "EN";
  const lines = rows.map(({ geo, answers }) => {
    const ok = answers.filter((a) => a.outcome !== "declined");
    if (!answers.length) return en ? `${geo} — checking, will update you soon` : `${geo} — уточняю, вернусь с ответом`;
    if (!ok.length) return en ? `${geo} — nothing available right now` : `${geo} — пока нет трафика`;
    return `${geo} — ${ok.map((a) => a.text || (en ? "we have traffic" : "есть трафик")).join("; ")}`;
  });
  return en ? ["Hi! Here is what we have:", "", ...lines].join("\n") : ["Привет! Что есть по вашему запросу:", "", ...lines].join("\n");
}

// ---------------------------------------------------------------------
// Запуски
// ---------------------------------------------------------------------
export type LaunchText = {
  offer_name: string | null;
  geo_code: string | null;
  advertiser_name: string | null;
  advertiser_lang: string | null;
  webmaster_name: string | null;
  manager_name: string | null;
  adv_stream_id: string | null;
  sub_id: string | null;
  source_code: string | null;
  rate: number | null;
  currency: string | null;
  cap: number | null;
};

const streamTitle = (l: LaunchText) => `${l.offer_name ?? ""} (${l.geo_code ?? ""})${l.source_code ? ` [${l.source_code}]` : ""}`;
const streamId = (l: LaunchText) => l.sub_id ?? l.adv_stream_id;
const terms = (l: LaunchText) =>
  [l.rate != null ? `ставка ${l.currency === "EUR" ? "€" : "$"}${l.rate}` : null, l.cap != null ? `кап ${l.cap}` : null].filter(Boolean).join(", ");

export function integratorText(l: LaunchText) {
  return [
    `Интеграция: ${streamTitle(l)} — рекл ${l.advertiser_name ?? ""}`,
    streamId(l) ? `ID потока: ${streamId(l)}` : null,
    l.webmaster_name ? `Веб: ${l.webmaster_name}` : null,
    terms(l) ? `Условия: ${terms(l)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function managerLaunchText(l: LaunchText) {
  return [
    `${streamTitle(l)} — ссылка готова, можно запускать${l.webmaster_name ? ` веба ${l.webmaster_name}` : ""}.`,
    streamId(l) ? `ID потока: ${streamId(l)}` : null,
    terms(l) ? `Условия: ${terms(l)}` : null,
    "Отпиши, когда стартанёте.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Пинг менеджеру: ссылку выдали, а запуска нет. */
export function managerPushText(l: LaunchText, days: number) {
  const d = Math.floor(days);
  return [
    `Привет! По ${streamTitle(l)}${streamId(l) ? ` (ID ${streamId(l)})` : ""} ссылку выдали ${d} ${d === 1 ? "день" : d < 5 ? "дня" : "дней"} назад — когда запуск?`,
    l.webmaster_name ? `Веб: ${l.webmaster_name}.` : null,
    d >= 5 ? "Если веб не готов — скажи, отдадим капу другому." : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function advertiserLinkRequestText(l: LaunchText) {
  return l.advertiser_lang === "EN"
    ? `Hi! Could you please share the tracking link for ${streamTitle(l)}? We're ready to start.`
    : `Привет! Пришли, пожалуйста, ссылку на ${streamTitle(l)} — готовы запускать.`;
}

export function advertiserStatusText(l: LaunchText, stage: string) {
  const en = l.advertiser_lang === "EN";
  const what = `${streamTitle(l)}${l.adv_stream_id ? ` (ID ${l.adv_stream_id})` : ""}`;
  const map: Record<string, [string, string]> = {
    waiting_link: [`ждём от вас ссылку на ${what}`, `we're waiting for the tracking link for ${what}`],
    link_received: [`${what}: интегрируем, скоро запуск`, `${what}: integration in progress, launching soon`],
    at_integrator: [`${what}: интегрируем, скоро запуск`, `${what}: integration in progress, launching soon`],
    integrated: [`${what}: всё готово, ждём старт трафика`, `${what}: everything is set, traffic starting soon`],
    live: [`${what}: трафик идёт`, `${what}: traffic is live`],
    ftd: [`${what}: трафик идёт`, `${what}: traffic is live`],
    no_traffic: [`${what}: веб не запустился, ищем замену`, `${what}: the partner didn't start, looking for a replacement`],
    stopped: [`${what}: поток остановлен`, `${what}: the stream is stopped`],
  };
  const [ru, enT] = map[stage] ?? [what, what];
  return en ? `Hi! Update: ${enT}.` : `Привет! По статусу: ${ru}.`;
}
