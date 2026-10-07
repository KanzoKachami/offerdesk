// Подписи и цвета статусов. Общие для сервера и клиента.

export const ITEM_STATUS: Record<string, { label: string; tone: "slate" | "indigo" | "green" | "amber" | "rose" }> = {
  new: { label: "Новый", tone: "indigo" },
  clarifying: { label: "Уточняю у менеджера", tone: "amber" },
  sent: { label: "Отправлен реклу", tone: "slate" },
  waiting: { label: "Ждём ответ (пинганул)", tone: "amber" },
  answered: { label: "Ответ получен", tone: "indigo" },
  passed: { label: "Передан менеджеру", tone: "green" },
  closed: { label: "Закрыт", tone: "green" },
  archived: { label: "Архив без ответа", tone: "slate" },
  paused: { label: "На паузе", tone: "slate" },
};

export const IO_STATUS: Record<string, { label: string; tone: "slate" | "indigo" | "green" | "amber" | "rose" }> = {
  draft: { label: "не отправлен", tone: "slate" },
  sent: { label: "отправлен", tone: "indigo" },
  pinged: { label: "пинганул", tone: "amber" },
  answered: { label: "ответил", tone: "green" },
  cancelled: { label: "отменён", tone: "slate" },
};

export const OUTCOME: Record<string, { label: string; icon: string; tone: "green" | "amber" | "rose" }> = {
  approved: { label: "одобрено", icon: "✅", tone: "green" },
  partial: { label: "с условиями", icon: "⚠️", tone: "amber" },
  declined: { label: "отказ", icon: "❌", tone: "rose" },
};

export const BALL: Record<string, { label: string; tone: "slate" | "indigo" | "green" | "amber" | "rose" }> = {
  on_me: { label: "на мне", tone: "indigo" },
  on_advertiser: { label: "ждём рекла", tone: "amber" },
  on_manager: { label: "ждём менеджера", tone: "amber" },
  closed: { label: "закрыт", tone: "green" },
  done_or_paused: { label: "готово / пауза", tone: "green" },
  paused: { label: "пауза", tone: "slate" },
  empty: { label: "без позиций", tone: "slate" },
  mixed: { label: "в работе", tone: "slate" },
};

export const REQUEST_TYPE: { value: string; label: string }[] = [
  { value: "offer_search", label: "Подбор оффера" },
  { value: "rate", label: "Ставка" },
  { value: "cap", label: "Капа" },
  { value: "approval", label: "Апрув гео / сорса" },
  { value: "tech", label: "Техвопрос" },
  { value: "quality", label: "Качество / фрод" },
  { value: "payout", label: "Выплаты" },
  { value: "other", label: "Другое" },
];

export const PRIORITY: { value: string; label: string }[] = [
  { value: "normal", label: "Обычный" },
  { value: "high", label: "Высокий" },
  { value: "urgent", label: "Срочно" },
  { value: "low", label: "Низкий" },
];

export function hoursLabel(h: number) {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} мин`;
  if (h < 48) return `${Math.round(h)} ч`;
  return `${Math.round(h / 24)} дн`;
}

export function rateLabel(min: unknown, max: unknown, currency: unknown) {
  const sym = currency === "EUR" ? "€" : "$";
  if (min == null && max == null) return "";
  if (min == null) return `до ${sym}${max}`;
  if (max == null || min === max) return `${sym}${min}`;
  return `${sym}${min}–${max}`;
}

// Статусы потока. В базе этапы называются по-старому (launch_stage), здесь — новые подписи.
export const LAUNCH_STAGE: Record<string, { label: string; tone: "slate" | "indigo" | "green" | "amber" | "rose"; hint: string }> = {
  waiting_link: { label: "Ждём ссылку", tone: "amber", hint: "рекл апрувнул, ссылки пока нет" },
  link_received: { label: "У интегратора", tone: "amber", hint: "" },
  at_integrator: { label: "У интегратора", tone: "amber", hint: "ссылку получили, интегрируем" },
  integrated: { label: "Ссылка выдана", tone: "indigo", hint: "ссылка у менеджера, ждём запуск" },
  live: { label: "Льёт", tone: "green", hint: "" },
  ftd: { label: "Льёт", tone: "green", hint: "" },
  no_traffic: { label: "Не запустился", tone: "slate", hint: "" },
  stopped: { label: "Стоп", tone: "rose", hint: "" },
};

/** Статусы, которые можно выбрать вручную (порядок = путь потока). */
export const STREAM_STAGES = ["waiting_link", "at_integrator", "integrated", "live", "stopped", "no_traffic"] as const;
