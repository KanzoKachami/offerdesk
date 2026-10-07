// Описание редактируемых таблиц: какие поля можно писать и как их парсить.
// Используется и формами (рендер), и серверными действиями (белый список).

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "multiselect"
  | "checkbox"
  | "tags" // текст через запятую → text[]
  | "upper"; // текст → КАПС (коды справочников)

export type Option = { value: string; label: string };

export type Field = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: Option[]; // для select/multiselect; можно подставить при рендере
  wide?: boolean; // на всю ширину формы
  stripAt?: boolean; // убрать @ в начале (tg_username)
};

export type TableConfig = {
  pk: string;
  fields: Field[];
};

export const TIER_OPTIONS: Option[] = [
  { value: "key", label: "Ключевой" },
  { value: "occasional", label: "Разовый" },
];

export const WEBMASTER_KIND_OPTIONS: Option[] = [
  { value: "solo", label: "Соло" },
  { value: "inhouse", label: "Инхаус" },
  { value: "team", label: "Команда" },
];

export const MODEL_OPTIONS: Option[] = ["CPA", "RS", "Hybrid", "CPL", "other"].map((v) => ({
  value: v,
  label: v === "other" ? "Другое" : v,
}));

export const OFFER_STATUS_OPTIONS: Option[] = [
  { value: "active", label: "Активен" },
  { value: "paused", label: "На паузе" },
  { value: "closed", label: "Закрыт" },
];

export const TABLES: Record<string, TableConfig> = {
  managers: {
    pk: "id",
    fields: [
      { name: "name", label: "Имя", type: "text", required: true },
      { name: "department", label: "Отдел", type: "text" },
      { name: "tg_username", label: "Telegram username", type: "text", placeholder: "без @", stripAt: true },
      { name: "tg_user_id", label: "Telegram ID", type: "number", placeholder: "заполнит бот" },
      { name: "chat_link", label: "Ссылка на чат", type: "text", wide: true },
      { name: "is_active", label: "Активен", type: "checkbox" },
    ],
  },
  assignees: {
    pk: "id",
    fields: [
      { name: "name", label: "Имя", type: "text", required: true },
      { name: "tg_username", label: "Telegram username", type: "text", placeholder: "без @", stripAt: true },
      { name: "is_me", label: "Это я", type: "checkbox" },
    ],
  },
  webmasters: {
    pk: "id",
    fields: [
      { name: "name", label: "Имя / команда", type: "text", required: true },
      { name: "contact", label: "Контакт", type: "text" },
      { name: "kind", label: "Тип", type: "select", options: WEBMASTER_KIND_OPTIONS },
      { name: "notes", label: "Заметки", type: "textarea", wide: true },
    ],
  },
  advertisers: {
    pk: "id",
    fields: [
      { name: "name", label: "Название", type: "text", required: true },
      { name: "tier", label: "Уровень", type: "select", options: TIER_OPTIONS, required: true },
      { name: "lang", label: "Язык общения", type: "select", options: [{ value: "RU", label: "Русский" }, { value: "EN", label: "English" }], required: true },
      { name: "contact", label: "Контакт", type: "text" },
      { name: "tg_username", label: "Telegram username", type: "text", placeholder: "без @", stripAt: true },
      { name: "chat_link", label: "Ссылка на чат", type: "text", wide: true },
      { name: "notes", label: "Заметки", type: "textarea", wide: true },
    ],
  },
  offers: {
    pk: "id",
    fields: [
      { name: "advertiser_id", label: "Рекламодатель", type: "select", required: true },
      { name: "name", label: "Оффер (продукт)", type: "upper", required: true, placeholder: "SANKRA" },
      { name: "geos", label: "Гео, где работает", type: "multiselect", wide: true },
      { name: "sources", label: "Принимает сорсы (пусто — любой)", type: "multiselect", wide: true },
      { name: "approaches", label: "Подходы (пусто — любой)", type: "multiselect", wide: true },
      { name: "model", label: "Модель", type: "select", options: MODEL_OPTIONS },
      { name: "rate", label: "Ставка", type: "number" },
      { name: "currency", label: "Валюта", type: "upper", placeholder: "USD" },
      { name: "cap", label: "Капа", type: "number" },
      { name: "status", label: "Статус", type: "select", options: OFFER_STATUS_OPTIONS, required: true },
      { name: "notes", label: "Заметки", type: "textarea", wide: true },
    ],
  },
  geos: {
    pk: "code",
    fields: [
      { name: "code", label: "Код", type: "upper", required: true, placeholder: "DE" },
      { name: "name_ru", label: "Название", type: "text", required: true },
    ],
  },
  sources: {
    pk: "code",
    fields: [
      { name: "code", label: "Код", type: "upper", required: true, placeholder: "FB" },
      { name: "name", label: "Название", type: "text", required: true },
    ],
  },
  approaches: {
    pk: "code",
    fields: [
      { name: "code", label: "Код", type: "upper", required: true, placeholder: "SLOT" },
      { name: "name", label: "Название", type: "text", required: true },
    ],
  },
};

/** Превращает FormData в объект для insert/update по описанию полей. */
export function parseForm(cfg: TableConfig, fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of cfg.fields) {
    if (f.type === "checkbox") {
      out[f.name] = fd.get(f.name) === "on";
      continue;
    }
    if (f.type === "multiselect") {
      out[f.name] = fd.getAll(f.name).map(String).filter(Boolean);
      continue;
    }
    const raw = fd.get(f.name);
    if (raw === null) continue; // поле не пришло в форме — не трогаем
    let v = String(raw).trim();
    if (f.stripAt) v = v.replace(/^@+/, "");
    if (v === "") {
      out[f.name] = f.type === "tags" ? [] : null;
      continue;
    }
    switch (f.type) {
      case "number": {
        const n = Number(v.replace(",", "."));
        out[f.name] = Number.isFinite(n) ? n : null;
        break;
      }
      case "tags":
        out[f.name] = v.split(",").map((s) => s.trim()).filter(Boolean);
        break;
      case "upper":
        out[f.name] = v.toUpperCase();
        break;
      default:
        out[f.name] = v;
    }
  }
  return out;
}
