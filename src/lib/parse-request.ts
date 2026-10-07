// Разбор сообщения менеджера в черновик запроса. Без AI.
// Понимает шаблон #запрос («Продукт: … / Гео: … / Сорс: …») и свободный текст.
// Этот же разбор потом будет использовать Telegram-бот.

export type ParseDicts = {
  geos: string[];
  sources: string[];
  approaches: string[];
  brands: { id: string; name: string; aliases: string[] }[];
  assignees: { id: string; tg_username: string | null }[];
};

export type RequestDraft = {
  isTemplate: boolean;
  product: string | null;
  brandId: string | null;
  geos: string[];
  source: string | null;
  approach: string | null;
  inhouse: boolean;
  rateMin: number | null;
  rateMax: number | null;
  currency: string;
  model: string | null;
  webmasterName: string | null;
  webmasterContact: string | null;
  assigneeIds: string[];
  notes: string[]; // что не удалось сопоставить — показать пользователю
};

const GEO_ALIASES: Record<string, string> = { GB: "UK" };
const SOURCE_ALIASES: Record<string, string> = {
  FACEBOOK: "FB",
  META: "FB",
  "IN-APP": "INAPP",
  INAPP: "INAPP",
  GOOGLE: "UAC",
  TIKTOK: "TIKTOK",
  TELEGRAM: "TG",
  POPUNDER: "POP",
};

const KEYS: [RegExp, keyof typeof FIELD][] = [
  [/^(продукт|бренд|оффер)$/, "product"],
  [/^(гео|geo|страны?)$/, "geo"],
  [/^(сорс|источник|трафик|source)$/, "source"],
  [/^(подход|вертикаль|approach)$/, "approach"],
  [/^(информация по ставке|ставка|рейт|rate|условия)$/, "rate"],
  [/^(вебмастер|веб|партн[её]р|webmaster)$/, "webmaster"],
];
const FIELD = { product: 1, geo: 1, source: 1, approach: 1, rate: 1, webmaster: 1 };

function num(s: string) {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function parseRate(text: string) {
  const t = text.replace(/\s+/g, " ");
  const currency = /€|eur/i.test(t) ? "EUR" : "USD";
  const model = /hybrid|гибрид/i.test(t) ? "Hybrid" : /\brs\b|revshare|ревшар/i.test(t) ? "RS" : /cpa|цпа/i.test(t) ? "CPA" : null;
  const range = t.match(/(\d+(?:[.,]\d+)?)\s*\$?\s*(?:-|–|—|до)\s*\$?\s*(\d+(?:[.,]\d+)?)/);
  if (range) {
    const a = num(range[1]);
    const b = num(range[2]);
    return { min: a, max: b, currency, model };
  }
  const upTo = t.match(/(?:до|up to|max)\s*\$?\s*(\d+(?:[.,]\d+)?)/i);
  if (upTo) return { min: null, max: num(upTo[1]), currency, model };
  const one = t.match(/\$?\s*(\d+(?:[.,]\d+)?)/);
  const v = one ? num(one[1]) : null;
  return { min: v, max: v, currency, model };
}

export function parseRequestText(text: string, d: ParseDicts): RequestDraft {
  const draft: RequestDraft = {
    isTemplate: /#запрос/i.test(text),
    product: null,
    brandId: null,
    geos: [],
    source: null,
    approach: null,
    inhouse: /\b(inhouse|in-house|инхаус|inh)\b/i.test(text),
    rateMin: null,
    rateMax: null,
    currency: "USD",
    model: null,
    webmasterName: null,
    webmasterContact: null,
    assigneeIds: [],
    notes: [],
  };

  const geoSet = new Set(d.geos);
  const srcSet = new Set(d.sources);
  const apprSet = new Set(d.approaches);
  const lines = text.split(/\r?\n/).map((l) => l.trim());

  // Адресаты по @тегам
  for (const m of text.matchAll(/(?<![\w.])@([A-Za-z0-9_]{3,})/g)) {
    const a = d.assignees.find((x) => x.tg_username?.toLowerCase() === m[1].toLowerCase());
    if (a && !draft.assigneeIds.includes(a.id)) draft.assigneeIds.push(a.id);
    else if (!a) draft.notes.push(`@${m[1]} нет в адресатах`);
  }

  // Поля шаблона «Ключ: значение»
  const fields: Partial<Record<keyof typeof FIELD, string>> = {};
  for (const l of lines) {
    const m = l.match(/^([^:]{2,30}):\s*(.+)$/);
    if (!m) continue;
    const key = m[1].trim().toLowerCase();
    const hit = KEYS.find(([re]) => re.test(key));
    if (hit) fields[hit[1]] = m[2].trim();
  }
  const isStructured = Object.keys(fields).length >= 2;
  if (isStructured) draft.isTemplate = true;

  const tokens = (s: string) => s.split(/[\s,;\/|()\[\]]+/).filter(Boolean);
  const findSource = (s: string) => {
    for (const t of tokens(s)) {
      const u = t.toUpperCase();
      const c = SOURCE_ALIASES[u] ?? u;
      if (srcSet.has(c)) return c;
    }
    return null;
  };
  const findApproach = (s: string) => {
    for (const t of tokens(s)) {
      const u = t.toUpperCase().replace(/S$/, "") === "SLOT" ? "SLOT" : t.toUpperCase();
      if (apprSet.has(u)) return u;
    }
    return null;
  };
  const addGeo = (raw: string) => {
    const g = GEO_ALIASES[raw] ?? raw;
    if (geoSet.has(g) && !draft.geos.includes(g)) draft.geos.push(g);
  };

  // Гео
  if (fields.geo) {
    for (const t of tokens(fields.geo)) {
      const u = t.toUpperCase();
      if (/^[A-Z]{2}$/.test(u)) {
        const g = GEO_ALIASES[u] ?? u;
        if (geoSet.has(g)) addGeo(u);
        else draft.notes.push(`Гео ${u} нет в справочнике`);
      }
    }
  } else {
    // свободный текст: только КАПС-коды из двух букв, которые есть в справочнике и не являются сорсом
    for (const m of text.matchAll(/(?<![A-Za-z])([A-Z]{2})(?![A-Za-z])/g)) {
      if (!srcSet.has(m[1])) addGeo(m[1]);
    }
  }

  // Сорс и подход
  draft.source = findSource(fields.source ?? text);
  if (fields.source && !draft.source) draft.notes.push(`Сорс «${fields.source}» не распознан`);
  draft.approach = findApproach(fields.approach ?? text);
  if (!draft.approach && !fields.approach) draft.approach = null;

  // Ставка: поле шаблона или фрагмент после слова «ставка» / сумма с валютой
  const rateText =
    fields.rate ??
    text.match(/(?:ставк\w*|рейт|rate|cpa)\s*:?\s*([^\n]{1,40})/i)?.[1] ??
    text.match(/(\$\s?\d[\d.,]*(?:\s*[-–—]\s*\$?\d[\d.,]*)?|\d[\d.,]*(?:\s*[-–—]\s*\d[\d.,]*)?\s?(?:\$|€|eur|usd))/i)?.[1];
  if (rateText) {
    const r = parseRate(rateText);
    draft.rateMin = r.min;
    draft.rateMax = r.max;
    draft.currency = r.currency;
    draft.model = r.model;
  }

  // Продукт → бренд
  const matchBrand = (s: string) => {
    const u = s.toUpperCase().replace(/\s+/g, " ").trim();
    return d.brands.find((b) => b.name === u || b.aliases.some((a) => a.toUpperCase() === u)) ?? null;
  };
  if (fields.product) {
    draft.product = fields.product.toUpperCase();
    const b = matchBrand(fields.product);
    if (b) draft.brandId = b.id;
    else draft.notes.push(`Бренда ${draft.product} нет в базе — сохраню как текст`);
  } else {
    const upper = text.toUpperCase();
    const b = d.brands.find((x) => new RegExp(`(^|[^A-Z0-9])${x.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Z0-9]|$)`).test(upper));
    if (b) {
      draft.brandId = b.id;
      draft.product = b.name;
    }
  }

  // Вебмастер
  if (fields.webmaster) {
    const [name, ...rest] = fields.webmaster.split(/[,;]/);
    draft.webmasterName = name.trim() || null;
    draft.webmasterContact = rest.join(",").trim() || null;
  } else if (!isStructured) {
    // первая строка свободного текста, если похожа на имя веба/команды
    const first = lines.find((l) => l && !l.startsWith("#") && !l.startsWith("@"));
    if (first && first.length <= 40 && !findSource(first) && !/[A-Z]{2}\s*$/.test(first) && !/[:?]/.test(first)) {
      const words = tokens(first);
      const hasGeo = words.some((w) => geoSet.has(w));
      if (!hasGeo) draft.webmasterName = first;
    }
  }

  return draft;
}
