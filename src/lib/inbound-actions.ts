"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type PingTarget = {
  type: "launch" | "item";
  id: string;
  request_id: string | null;
  label: string; // SANKRA (UK) · Ждём ссылку
  geo: string;
};

const ITEM_RU: Record<string, string> = { sent: "отправлен реклу", pinged: "пинганул", answered: "рекл ответил", draft: "не отправлен" };

/** К чему может относиться пинг рекла: его открытые запуски и открытые обращения по этим гео. */
export async function findPingTargets(advertiserId: string, geos: string[]): Promise<PingTarget[]> {
  const sb = await createClient();
  // Потоки пока отключены («скоро») — пинг привязываем только к запросам
  const { data: ios } = await sb
    .from("item_offers")
    .select("id, status, offers!inner(name, advertiser_id), request_items!inner(id, request_id, geo_code, status)")
    .eq("offers.advertiser_id", advertiserId)
    .neq("status", "cancelled");
  const want = (g: string | null) => !geos.length || (g != null && geos.includes(g));
  const out: PingTarget[] = [];
  for (const io of ios ?? []) {
    const it = io.request_items as unknown as { id: string; request_id: string; geo_code: string; status: string };
    const of = io.offers as unknown as { name: string };
    if (["closed", "archived"].includes(it.status) || !want(it.geo_code)) continue;
    out.push({ type: "item", id: it.id, request_id: it.request_id, geo: it.geo_code, label: `Запрос: ${of.name} (${it.geo_code}) · ${ITEM_RU[io.status as string] ?? io.status}` });
  }
  return out;
}

/** Привязать пинг рекла: «рекл ждёт» + запись в ленту. */
export async function registerPing(fd: FormData) {
  const type = String(fd.get("target_type"));
  const id = String(fd.get("target_id"));
  const text = String(fd.get("raw_text") ?? "").trim();
  const sb = await createClient();
  const now = new Date().toISOString();
  if (type === "launch") {
    const { data: l } = await sb.from("launches").update({ adv_waiting_since: now }).eq("id", id).select("request_id").single();
    await sb.from("activities").insert({ launch_id: id, request_id: l?.request_id ?? null, kind: "adv_ping", text: `Рекл спрашивает: «${text}»` });
    revalidatePath("/streams");
    revalidatePath("/");
    redirect(`/streams?open=${id}&ok=${encodeURIComponent("Пинг привязан — поток помечен «рекл ждёт»")}&t=${Date.now()}#s-${id}`);
  }
  const { data: it } = await sb.from("request_items").update({ adv_waiting_since: now }).eq("id", id).select("request_id").single();
  await sb.from("activities").insert({ item_id: id, request_id: it?.request_id ?? null, kind: "adv_ping", text: `Рекл спрашивает: «${text}»` });
  revalidatePath("/");
  redirect(`/requests/${it?.request_id}?ok=${encodeURIComponent("Пинг привязан — позиция помечена «рекл ждёт»")}&t=${Date.now()}`);
}

/** Новый спрос от рекла: запрос «от рекла», по позиции на каждое гео. */
export async function createAdvertiserRequest(fd: FormData) {
  const advertiserId = String(fd.get("advertiser_id") ?? "");
  const geos = [...new Set(String(fd.get("geos_text") ?? "").toUpperCase().split(/[\s,;\/]+/).filter((g) => /^[A-Z]{2}$/.test(g)).map((g) => (g === "GB" ? "UK" : g)))];
  const back = (msg: string): never => redirect(`/inbound?error=${encodeURIComponent(msg)}&t=${Date.now()}`);
  if (!advertiserId) back("Выбери рекламодателя");
  if (!geos.length) back("Укажи хотя бы одно гео");
  const sb = await createClient();
  const { data: req, error } = await sb
    .from("requests")
    .insert({
      direction: "from_advertiser",
      advertiser_id: advertiserId,
      type: "offer_search",
      mode: "search",
      source_code: String(fd.get("source_code") ?? "") || null,
      raw_text: String(fd.get("raw_text") ?? "").trim() || null,
      origin: "manual",
    })
    .select("id")
    .single();
  if (error || !req) back(error?.message ?? "Не удалось создать запрос");
  const { error: e2 } = await sb.from("request_items").insert(geos.map((g) => ({ request_id: req!.id, geo_code: g })));
  if (e2) back(e2.code === "23503" ? "Какого-то гео нет в справочнике" : e2.message);
  const { data: me } = await sb.from("assignees").select("id").eq("is_me", true).limit(1);
  if (me?.[0]) await sb.from("request_assignees").insert({ request_id: req!.id, assignee_id: me[0].id });
  await sb.from("activities").insert({ request_id: req!.id, kind: "created", text: `Запрос от рекла: ${geos.join(", ")}` });
  revalidatePath("/");
  revalidatePath("/requests");
  redirect(`/requests/${req!.id}`);
}
