import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParseDicts } from "@/lib/parse-request";

export async function loadParseDicts(sb: SupabaseClient): Promise<ParseDicts> {
  const [geos, sources, approaches, brands, assignees] = await Promise.all([
    sb.from("geos").select("code").order("code"),
    sb.from("sources").select("code").order("code"),
    sb.from("approaches").select("code").order("code"),
    sb.from("offers").select("id, name").order("name"),
    sb.from("assignees").select("id, tg_username"),
  ]);
  return {
    geos: (geos.data ?? []).map((g) => g.code as string),
    sources: (sources.data ?? []).map((s) => s.code as string),
    approaches: (approaches.data ?? []).map((a) => a.code as string),
    brands: (brands.data ?? []).map((o) => ({ id: o.id as string, name: o.name as string, aliases: [] })),
    assignees: (assignees.data ?? []) as ParseDicts["assignees"],
  };
}

export type Settings = {
  sla_new_h: number;
  sla_adv_ping_h: number;
  sla_adv_escal_h: number;
  sla_pass_h: number;
  sla_manager_h: number;
  archive_days: number;
  sla_link_h: number;
  sla_integrator_h: number;
  sla_traffic_h: number;
  push_days: number[];
  integrator_name: string | null;
  integrator_tg: string | null;
};

export async function loadSettings(sb: SupabaseClient): Promise<Settings> {
  const { data } = await sb.from("settings").select("*").maybeSingle();
  return {
    sla_new_h: data?.sla_new_h ?? 2,
    sla_adv_ping_h: data?.sla_adv_ping_h ?? 24,
    sla_adv_escal_h: data?.sla_adv_escal_h ?? 48,
    sla_pass_h: data?.sla_pass_h ?? 1,
    sla_manager_h: data?.sla_manager_h ?? 24,
    archive_days: data?.archive_days ?? 7,
    sla_link_h: data?.sla_link_h ?? 24,
    sla_integrator_h: data?.sla_integrator_h ?? 24,
    sla_traffic_h: data?.sla_traffic_h ?? 48,
    push_days: normPushDays(data?.push_days),
    integrator_name: data?.integrator_name ?? null,
    integrator_tg: data?.integrator_tg ?? null,
  };
}

/** Просрочка позиции по SLA: null — в норме, иначе текст подсказки. */
export function slaAlert(status: string, hours: number, s: Settings): { level: "warn" | "bad"; text: string } | null {
  switch (status) {
    case "new":
      return hours > s.sla_new_h ? { level: "bad", text: "без реакции" } : null;
    case "answered":
      return hours > s.sla_pass_h ? { level: "bad", text: "передай менеджеру" } : null;
    case "sent":
      return hours > s.sla_adv_ping_h ? { level: "warn", text: "пингани рекла" } : null;
    case "waiting":
      return hours > s.sla_adv_escal_h ? { level: "bad", text: "спроси другого рекла" } : null;
    case "clarifying":
      return hours > s.sla_manager_h ? { level: "warn", text: "переспроси менеджера" } : null;
    default:
      return hours > s.archive_days * 24 ? { level: "warn", text: "давно без движения" } : null;
  }
}

export function normPushDays(v: unknown): number[] {
  const arr = Array.isArray(v) ? v.map(Number).filter((n) => Number.isFinite(n) && n > 0) : [];
  const list = [...new Set(arr)].sort((a, b) => a - b).slice(0, 4);
  return list.length ? list : [1, 3, 5, 7];
}

export type PushLevel = 0 | 1 | 2 | 3 | 4;

/** «Ссылка выдана, запуска нет»: какой порог из push_days уже пройден (0 — ещё рано). */
export function pushLevel(days: number, pushDays: number[]): PushLevel {
  let lvl = 0;
  pushDays.forEach((d, i) => {
    if (days >= d) lvl = i + 1;
  });
  // если порогов меньше 4, последний считаем самым жёстким
  if (lvl > 0 && lvl === pushDays.length) return 4;
  return lvl as PushLevel;
}

export const PUSH_TEXT: Record<PushLevel, string> = {
  0: "",
  1: "можно пнуть",
  2: "пни менеджера",
  3: "пни ещё раз",
  4: "забрать капу / отдать другому вебу",
};

/** Просрочка потока: для «ждём ссылку» и «у интегратора» — по часам из настроек. */
export function launchAlert(stage: string, hours: number, s: Settings, advWaiting: boolean): { level: "warn" | "bad"; text: string } | null {
  if (advWaiting) return { level: "bad", text: "рекл ждёт ответа" };
  switch (stage) {
    case "waiting_link":
      return hours > s.sla_link_h ? { level: "warn", text: "пингани рекла за ссылкой" } : null;
    case "link_received":
    case "at_integrator":
      return hours > s.sla_integrator_h ? { level: "warn", text: "пингани интегратора" } : null;
    default:
      return null;
  }
}
