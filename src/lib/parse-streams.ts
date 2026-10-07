// Разбор строк, скопированных из гугл-таблицы потоков (или CSV-файла).
// Колонки ищутся по названиям в шапке, поэтому их порядок не важен.

import type { ImportRow } from "@/lib/launch-actions";

/** Делит текст на ячейки. Понимает табы (копирование из Google Sheets), «;» и «,», кавычки и переносы внутри ячеек. */
export function splitTable(text: string): string[][] {
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  const delim = firstLine.includes("\t") ? "\t" : firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.replace(/\s+/g, " ").trim())).filter((r) => r.some(Boolean));
}

const low = (s: string) => s.toLowerCase().replace(/ё/g, "е");
const MONTH = /(январ|феврал|март|апрел|май|мая|июн|июл|август|сентябр|октябр|ноябр|декабр)/;

function findCol(head: string[], test: (h: string) => boolean, used: Set<number>): number {
  const i = head.findIndex((h, idx) => !used.has(idx) && test(h));
  if (i >= 0) used.add(i);
  return i;
}

export type ParsedImport = { rows: ImportRow[]; columns: Record<string, string>; error?: string; fixes: string[] };

// Африканские гео, которые в таблице прячутся за «AFRICA» и пишутся в названии потока
const AFRICA = ["ZA", "UG", "KE", "TZ", "ET", "TG", "GH", "NG", "CM", "SN", "BF", "CD", "GN", "CI"];
const GEO_ALIAS: Record<string, string> = { GB: "UK", CIV: "CI" };

const isMoney = (v: string) => /^[€$]?\s*\d+(?:[.,]\d+)?\s*[€$]?$/.test(v.trim());
const isDate = (v: string) => /^\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?$/.test(v.trim());
/** «CRUSADO (DE) [PPC» → «CRUSADO» */
const cleanProduct = (v: string) => v.split(/[([]/)[0].replace(/\s+/g, " ").trim().toUpperCase();
const firstNum = (v: string) => {
  const m = v.match(/^\s*(\d+)\s*$/);
  return m ? Number(m[1]) : null;
};

export function parseStreams(text: string, defaultStage: string): ParsedImport {
  const table = splitTable(text);
  const fixes: string[] = [];
  const headIdx = table.findIndex((r) => r.some((c) => low(c) === "гео" || low(c) === "geo"));
  if (headIdx < 0) return { rows: [], columns: {}, fixes, error: "Не нашёл шапку таблицы: нужна строка заголовков с колонкой «Гео»" };
  const head = table[headIdx].map(low);
  const used = new Set<number>();

  const c = {
    adv: findCol(head, (h) => h.includes("id") && (h.includes("рекл") || h.includes("ориг")), used),
    sub: findCol(head, (h) => h.includes("id") && (h.includes("льет") || h.includes("подмен")), used),
    advertiser: findCol(head, (h) => h.includes("рекламодат") || h === "рекл", used),
    product: findCol(head, (h) => h.includes("продукт") || h === "оффер", used),
    name: findCol(head, (h) => h.includes("название"), used),
    geo: findCol(head, (h) => h === "гео" || h === "geo", used),
    cap: findCol(head, (h) => h.includes("кап") && !MONTH.test(h), used),
    approach: findCol(head, (h) => h.includes("подход"), used),
    source: findCol(head, (h) => h.includes("источник") || h.includes("сорс"), used),
    rate: findCol(head, (h) => h.includes("ставка"), used),
    manager: findCol(head, (h) => h.includes("менеджер"), used),
    kpi: findCol(head, (h) => h.includes("кпи") || h.includes("kpi"), used),
    date: findCol(head, (h) => h.includes("дата"), used),
    web: findCol(head, (h) => h.includes("веб"), used),
    status: findCol(head, (h) => h.includes("статус"), used),
  };
  // месячные капы: берём последний (текущий месяц)
  const monthCaps = head.map((h, i) => ({ h, i })).filter(({ h, i }) => !used.has(i) && h.includes("кап") && MONTH.test(h));
  const monthCap = monthCaps[monthCaps.length - 1]?.i ?? -1;
  const noteCols = head
    .map((h, i) => ({ h, i }))
    .filter(({ h, i }) => !used.has(i) && (h.includes("коммент") || h.includes("инфо") || h.includes("заметк")))
    .map(({ i }) => i);

  const columns: Record<string, string> = {};
  const label: Record<string, string> = {
    adv: "Оригинальный ID",
    sub: "Подмена",
    advertiser: "Рекл",
    product: "Продукт",
    name: "Веб (из названия потока)",
    geo: "Гео",
    cap: "Кап",
    approach: "Подход",
    source: "Сорс",
    rate: "Ставка",
    manager: "Менеджер",
    kpi: "КПИ",
    date: "Дата (текст → заметки)",
    web: "Веб",
    status: "Статус",
  };
  for (const [k, i] of Object.entries(c)) if (i >= 0) columns[label[k]] = table[headIdx][i];
  if (monthCap >= 0) columns["Кап на месяц"] = table[headIdx][monthCap];
  if (noteCols.length) columns["Заметки"] = noteCols.map((i) => table[headIdx][i]).join(", ");
  if (c.product < 0 && c.name < 0) return { rows: [], columns, fixes, error: "Нет колонки «Продукт»" };

  const rows: ImportRow[] = [];
  let shifted = 0;
  table.slice(headIdx + 1).forEach((r, n) => {
    const line = headIdx + n + 2;
    const get0 = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");

    // В части строк колонки съехали на одну вправо (лишняя колонка комментария):
    // в «Ставке» стоит сорс, а ставка — в «Менеджере». Тогда хвост читаем со сдвигом.
    const shift = c.rate >= 0 && c.manager === c.rate + 1 && !isMoney(get0(c.rate)) && isMoney(get0(c.rate + 1)) ? 1 : 0;
    if (shift) shifted++;
    const tail = new Set([c.approach, c.source, c.rate, c.manager, c.kpi, c.date].filter((i) => i >= 0));
    const get = (i: number) => get0(i >= 0 && shift && tail.has(i) ? i + 1 : i);

    const nameCell = get(c.name);
    const nameParts = nameCell.includes("/") ? nameCell.split("/").map((x) => x.trim()) : [];
    let product = cleanProduct(get(c.product));
    if (!product && nameParts[1]) product = cleanProduct(nameParts[1]);
    let geo = get(c.geo).toUpperCase();
    if (!product && !geo && !nameCell) return;
    if (low(get(c.product)) === "продукт") return; // повтор шапки

    // гео: пусто → из названия; AFRICA → страна из названия потока
    if (!geo) {
      const m = (get(c.product) + " " + nameCell).match(/\(([A-Z]{2,3})\)/);
      if (m) {
        geo = m[1];
        fixes.push(`Строка ${line}: гео взял из названия — ${geo}`);
      }
    }
    if (geo === "AFRICA") {
      const tok = (nameCell.match(/\b[A-Z]{2}\b/g) ?? []).find((t) => AFRICA.includes(t));
      if (tok) {
        fixes.push(`Строка ${line}: AFRICA → ${tok} (из названия потока)`);
        geo = tok;
      }
    }
    geo = GEO_ALIAS[geo] ?? geo;

    // ставка
    const rateRaw = get(c.rate);
    const rateNum = Number(rateRaw.replace(/[^\d.,]/g, "").replace(/,(\d{2})$/, ".$1").replace(",", "."));

    // кап: на поток, иначе месячный, если это просто число
    const capStream = firstNum(get(c.cap));
    const capMonthRaw = get0(monthCap);
    const capMonth = firstNum(capMonthRaw);
    const notes: string[] = [];
    if (capMonthRaw && (capMonth == null || (capStream != null && capMonth !== capStream))) {
      notes.push(`${table[headIdx][monthCap].replace(/\s+/g, " ")}: ${capMonthRaw}`);
    }
    for (const i of noteCols) if (get0(i)) notes.push(get0(i));
    if (shift && c.approach > 0 && get0(c.approach)) notes.push(get0(c.approach)); // содержимое лишней колонки

    // КПИ: есть/нет; даты пропускаем; другой текст — в заметки
    const kpiRaw = get(c.kpi);
    const kpiLow = low(kpiRaw);
    const kpi = /^(есть|да|yes|\+|kpi)$/.test(kpiLow) ? true : /^(нет|no|-)$/.test(kpiLow) ? false : null;
    if (kpiRaw && kpi == null && !isDate(kpiRaw)) notes.push(kpiRaw);
    const dateRaw = get(c.date);
    if (dateRaw && !isDate(dateRaw)) notes.push(dateRaw);

    const st = low(get(c.status));
    const cells = r.map((x) => x.trim());
    const stage = st
      ? st.includes("стоп")
        ? "stopped"
        : st.includes("не запуст")
          ? "no_traffic"
          : st.includes("ссылк") && st.includes("жд")
            ? "waiting_link"
            : st.includes("интегр")
              ? "at_integrator"
              : st.includes("выдан")
                ? "integrated"
                : "live"
      : cells.some((x) => /^стоп/i.test(x) || /^неактуальн/i.test(x))
        ? "stopped"
        : defaultStage;

    const adv = get(c.adv) || null;
    const sub = get(c.sub) || null;
    const manager = get(c.manager);
    rows.push({
      line,
      adv_stream_id: adv,
      sub_id: sub && sub !== adv ? sub : null,
      advertiser: get(c.advertiser) || null,
      product,
      geo,
      source: get(c.source).toUpperCase() || null,
      approach: get(c.approach).toUpperCase() || null,
      rate: rateRaw && Number.isFinite(rateNum) && rateNum > 0 ? rateNum : null,
      currency: rateRaw.includes("€") || /eur/i.test(rateRaw) ? "EUR" : "USD",
      cap: capStream ?? capMonth,
      kpi,
      manager: manager && manager !== "-" ? manager : null,
      webmaster: get(c.web) || nameParts[0]?.replace(/\s+/g, " ").split(" ")[0] || null,
      stage,
      notes: [...new Set(notes)].join(" · ") || null,
    });
  });
  if (shifted) fixes.unshift(`В ${shifted} строках колонки съехали на одну вправо — прочитал со сдвигом`);
  return { rows, columns, fixes };
}
