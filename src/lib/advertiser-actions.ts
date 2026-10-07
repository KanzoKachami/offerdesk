"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ProductRow = { name: string; geos: string[]; sources: string[] };
export type AdvFormState = { error?: string };

const codes = (s: string) =>
  [...new Set(s.toUpperCase().split(/[\s,;\/]+/).filter(Boolean).map((g) => (g === "GB" ? "UK" : g)))];

function readProducts(fd: FormData): ProductRow[] {
  const names = fd.getAll("p_name").map(String);
  const geos = fd.getAll("p_geos").map(String);
  const sources = fd.getAll("p_sources").map(String);
  return names
    .map((n, i) => ({ name: n.trim().toUpperCase(), geos: codes(geos[i] ?? ""), sources: codes(sources[i] ?? "") }))
    .filter((p) => p.name);
}

function humanError(msg: string) {
  if (msg.includes("offers_owner_id_name_key")) return "Продукт с таким названием уже есть";
  if (msg.includes("advertisers_owner_id_name_key")) return "Рекламодатель с таким названием уже есть";
  return msg;
}

/** Новый рекламодатель сразу с продуктами. */
export async function createAdvertiserWithProducts(_prev: AdvFormState, fd: FormData): Promise<AdvFormState> {
  const name = String(fd.get("name") ?? "").trim();
  if (!name) return { error: "Укажи название рекламодателя" };
  const products = readProducts(fd);
  const noGeo = products.find((p) => p.geos.length === 0);
  if (noGeo) return { error: `У продукта ${noGeo.name} не указаны гео` };

  const sb = await createClient();
  const str = (k: string) => String(fd.get(k) ?? "").trim() || null;
  const { data: adv, error } = await sb
    .from("advertisers")
    .insert({
      name,
      tier: str("tier") ?? "key",
      lang: str("lang") === "EN" ? "EN" : "RU",
      contact: str("contact"),
      tg_username: str("tg_username")?.replace(/^@+/, "") ?? null,
      chat_link: str("chat_link"),
      notes: str("notes"),
    })
    .select("id")
    .single();
  if (error || !adv) return { error: humanError(error?.message ?? "Не удалось создать рекламодателя") };

  if (products.length) {
    const { error: e2 } = await sb.from("offers").insert(products.map((p) => ({ advertiser_id: adv.id, name: p.name, geos: p.geos, sources: p.sources })));
    if (e2) {
      // откатываем рекла, чтобы не остался «пустой» и форму можно было отправить ещё раз
      await sb.from("advertisers").delete().eq("id", adv.id);
      return { error: humanError(e2.message) };
    }
  }

  revalidatePath("/advertisers");
  revalidatePath("/offers");
  redirect(`/advertisers/${adv.id}?ok=${encodeURIComponent(`Рекламодатель добавлен${products.length ? `, продуктов: ${products.length}` : ""}`)}&t=${Date.now()}`);
}

/** Несколько продуктов разом к существующему рекламодателю. */
export async function addProducts(_prev: AdvFormState, fd: FormData): Promise<AdvFormState> {
  const advertiserId = String(fd.get("advertiser_id") ?? "");
  const products = readProducts(fd);
  if (!products.length) return { error: "Добавь хотя бы один продукт" };
  const noGeo = products.find((p) => p.geos.length === 0);
  if (noGeo) return { error: `У продукта ${noGeo.name} не указаны гео` };

  const sb = await createClient();
  const { error } = await sb.from("offers").insert(products.map((p) => ({ advertiser_id: advertiserId, name: p.name, geos: p.geos, sources: p.sources })));
  if (error) return { error: humanError(error.message) };

  revalidatePath(`/advertisers/${advertiserId}`);
  revalidatePath("/offers");
  redirect(`/advertisers/${advertiserId}?ok=${encodeURIComponent(`Добавлено продуктов: ${products.length}`)}&t=${Date.now()}`);
}
