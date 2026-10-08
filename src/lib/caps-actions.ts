"use server";

// Свободные капы: веб отказался — капу можно отдать другому вебу как подмену.
// Рекл про подмену не знает: для него это тот же оригинальный ID.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ImportRow } from "@/lib/launch-actions";

const STATUSES = ["free", "offered", "issued", "gone"];
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim() || null;
const num = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").replace(/[^\d.,]/g, "").replace(",", ".");
  const n = Number(v);
  return v && Number.isFinite(n) ? n : null;
};
const back = (path: string, params: Record<string, string>): never => {
  const [base, query] = path.split("?");
  const qs = new URLSearchParams(query ?? "");
  for (const [k, v] of Object.entries(params)) qs.set(k, v);
  qs.set("t", String(Date.now()));
  redirect(`${base}?${qs.toString()}`);
};
const refresh = (path?: string) => {
  revalidatePath("/caps");
  revalidatePath("/");
  if (path) revalidatePath(path.split("?")[0]);
};

/** Добавить капу вручную или сохранить изменения. */
export async function saveCap(fd: FormData) {
  const id = str(fd, "id");
  const offer_id = str(fd, "offer_id");
  const geo = (str(fd, "geo_code") ?? "").toUpperCase();
  const again: Record<string, string> = id ? { edit: id } : { new: "1" };
  if (!offer_id) back("/caps", { error: "Выбери продукт", ...again });
  if (!geo) back("/caps", { error: "Выбери гео", ...again });
  const row: Record<string, unknown> = {
    offer_id,
    geo_code: geo === "GB" ? "UK" : geo,
    source_code: str(fd, "source_code"),
    approach_code: str(fd, "approach_code"),
    adv_stream_id: str(fd, "adv_stream_id"),
    cap: num(fd, "cap"),
    rate: num(fd, "rate"),
    currency: str(fd, "currency") === "EUR" ? "EUR" : "USD",
    released_by: str(fd, "released_by"),
    released_manager_id: str(fd, "released_manager_id"),
    notes: str(fd, "notes"),
  };
  const releasedAt = str(fd, "released_at");
  if (releasedAt) row.released_at = releasedAt;
  const status = str(fd, "status");
  if (status && STATUSES.includes(status)) {
    row.status = status;
    if (status === "free") Object.assign(row, { item_id: null, issued_webmaster: null, issued_manager_id: null });
  }
  const sb = await createClient();
  const { error } = id ? await sb.from("free_caps").update(row).eq("id", id) : await sb.from("free_caps").insert(row);
  if (error) back("/caps", { error: error.message, ...again });
  refresh();
  back("/caps", { ok: id ? "Капа сохранена" : "Капа добавлена" });
}

export async function deleteCap(fd: FormData) {
  const sb = await createClient();
  await sb.from("free_caps").delete().eq("id", String(fd.get("id")));
  refresh();
  back("/caps", { ok: "Капа удалена" });
}

/** Сменить статус капы со страницы «Свободные капы». */
export async function setCapStatus(fd: FormData) {
  const id = String(fd.get("id"));
  const status = String(fd.get("status"));
  if (!STATUSES.includes(status)) return;
  const patch: Record<string, unknown> = { status };
  if (status === "free") Object.assign(patch, { item_id: null, issued_webmaster: null, issued_manager_id: null });
  const sb = await createClient();
  await sb.from("free_caps").update(patch).eq("id", id);
  refresh();
}

async function capLabel(sb: Awaited<ReturnType<typeof createClient>>, capId: string) {
  const { data } = await sb.from("v_free_caps").select("offer_name, geo_code, source_code, adv_stream_id, cap").eq("id", capId).single();
  if (!data) return "капа";
  return `${data.offer_name} (${data.geo_code})${data.source_code ? ` [${data.source_code}]` : ""}${data.adv_stream_id ? ` ID ${data.adv_stream_id}` : ""}${data.cap ? `, кап ${data.cap}` : ""}`;
}

/** Из карточки запроса: предложить свободную капу менеджеру. */
export async function offerCap(fd: FormData) {
  const capId = String(fd.get("cap_id"));
  const itemId = String(fd.get("item_id"));
  const path = String(fd.get("_path"));
  const sb = await createClient();
  const { data: it } = await sb.from("request_items").select("request_id").eq("id", itemId).single();
  const { error } = await sb.from("free_caps").update({ status: "offered", item_id: itemId }).eq("id", capId);
  if (error) back(path, { error: error.message });
  if (it) await sb.from("activities").insert({ request_id: it.request_id, item_id: itemId, kind: "cap_offered", text: `Предложил подмену: ${await capLabel(sb, capId)}` });
  refresh(path);
}

/** Из карточки запроса: выдать капу — позиция закрывается «одобрено (подмена)». */
export async function issueCap(fd: FormData) {
  const capId = String(fd.get("cap_id"));
  const itemId = String(fd.get("item_id"));
  const path = String(fd.get("_path"));
  const sb = await createClient();
  const { data: it } = await sb
    .from("request_items")
    .select("request_id, requests(manager_id, webmasters(name))")
    .eq("id", itemId)
    .single();
  const req = it?.requests as unknown as { manager_id: string | null; webmasters: { name: string } | null } | null;
  const label = await capLabel(sb, capId);
  const { error } = await sb
    .from("free_caps")
    .update({ status: "issued", item_id: itemId, issued_webmaster: req?.webmasters?.name ?? null, issued_manager_id: req?.manager_id ?? null })
    .eq("id", capId);
  if (error) back(path, { error: error.message });
  await sb.from("request_items").update({ status: "closed", outcome: "approved", outcome_note: `подмена: ${label}` }).eq("id", itemId);
  if (it) await sb.from("activities").insert({ request_id: it.request_id, item_id: itemId, kind: "cap_issued", text: `Выдал подмену: ${label}` });
  refresh(path);
}

/** Вернуть капу в свободные (менеджер не взял, веб передумал). */
export async function releaseCap(fd: FormData) {
  const capId = String(fd.get("cap_id"));
  const path = str(fd, "_path") ?? "/caps";
  const sb = await createClient();
  await sb.from("free_caps").update({ status: "free", item_id: null, issued_webmaster: null, issued_manager_id: null }).eq("id", capId);
  refresh(path);
}

// ---------------------------------------------------------------------
// Загрузка списком
// ---------------------------------------------------------------------

export type CapImportState = { error?: string; problems?: string[] };

export async function importCaps(_prev: CapImportState, fd: FormData): Promise<CapImportState> {
  let rows: ImportRow[];
  try {
    rows = JSON.parse(String(fd.get("rows") ?? "[]"));
  } catch {
    return { error: "Не удалось прочитать строки" };
  }
  if (!rows.length) return { error: "Нет строк для загрузки" };
  let productAdv: Record<string, string> = {};
  try {
    productAdv = JSON.parse(String(fd.get("product_adv") ?? "{}"));
  } catch {}

  const sb = await createClient();
  const [{ data: geos }, { data: offers }, { data: managers }, { data: existing }, { data: advs }] = await Promise.all([
    sb.from("geos").select("code"),
    sb.from("offers").select("id, name, geos"),
    sb.from("managers").select("id, name"),
    sb.from("free_caps").select("adv_stream_id, geo_code").in("status", ["free", "offered"]),
    sb.from("advertisers").select("id, name"),
  ]);
  const geoSet = new Set((geos ?? []).map((g) => g.code as string));
  const offerByName = new Map((offers ?? []).map((o) => [String(o.name).toUpperCase(), { id: o.id as string, geos: (o.geos as string[]) ?? [] }]));
  const managerByName = new Map((managers ?? []).map((m) => [String(m.name).toLowerCase(), m.id as string]));
  const advByName = new Map((advs ?? []).map((a) => [String(a.name).toLowerCase(), a.id as string]));
  const seen = new Set((existing ?? []).filter((e) => e.adv_stream_id).map((e) => `${e.adv_stream_id}|${e.geo_code}`));

  async function advertiserFor(name: string) {
    const k = name.trim().toLowerCase();
    if (!k) return null;
    if (advByName.has(k)) return advByName.get(k)!;
    const { data } = await sb.from("advertisers").insert({ name: name.trim() }).select("id").single();
    if (data) advByName.set(k, data.id as string);
    return (data?.id as string) ?? null;
  }

  const problems: string[] = [];
  const toInsert: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const r of rows) {
    const geo = r.geo.toUpperCase() === "GB" ? "UK" : r.geo.toUpperCase();
    const product = r.product.trim().toUpperCase();
    if (!product) {
      problems.push(`Строка ${r.line}: нет продукта`);
      continue;
    }
    if (!geoSet.has(geo)) {
      problems.push(`Строка ${r.line}: гео «${r.geo}» нет в справочнике`);
      continue;
    }
    // ID, который отдаём на подмену, — оригинальный ID у рекла
    const advId = r.adv_stream_id ?? r.sub_id;
    if (advId && seen.has(`${advId}|${geo}`)) {
      skipped++;
      continue;
    }
    let offer = offerByName.get(product);
    if (!offer) {
      const pick = productAdv[product] ?? "";
      const advertiserId = r.advertiser ? await advertiserFor(r.advertiser) : pick.startsWith("new:") ? await advertiserFor(pick.slice(4)) : pick || null;
      if (!advertiserId) {
        problems.push(`Строка ${r.line}: продукта ${product} нет — выбери для него рекла`);
        continue;
      }
      const { data, error } = await sb.from("offers").insert({ advertiser_id: advertiserId, name: product, geos: [geo] }).select("id, geos").single();
      if (error || !data) {
        problems.push(`Строка ${r.line}: не удалось создать продукт ${product}`);
        continue;
      }
      offer = { id: data.id as string, geos: data.geos as string[] };
      offerByName.set(product, offer);
    } else if (!offer.geos.includes(geo)) {
      const geosNew = [...offer.geos, geo];
      const { error } = await sb.from("offers").update({ geos: geosNew }).eq("id", offer.id);
      if (!error) offer.geos = geosNew;
    }
    let managerId: string | null = null;
    if (r.manager) {
      managerId = managerByName.get(r.manager.toLowerCase()) ?? null;
      if (!managerId) {
        const { data } = await sb.from("managers").insert({ name: r.manager }).select("id").single();
        if (data) {
          managerId = data.id as string;
          managerByName.set(r.manager.toLowerCase(), managerId);
        }
      }
    }
    toInsert.push({
      offer_id: offer.id,
      geo_code: geo,
      source_code: r.source,
      approach_code: r.approach,
      adv_stream_id: advId,
      cap: r.cap,
      rate: r.rate,
      currency: r.currency,
      released_by: r.webmaster,
      released_manager_id: managerId,
      notes: r.notes,
    });
    if (advId) seen.add(`${advId}|${geo}`);
  }
  if (toInsert.length) {
    const { error } = await sb.from("free_caps").insert(toInsert);
    if (error) return { error: `Ошибка загрузки: ${error.message}`, problems };
  }
  revalidatePath("/caps");
  revalidatePath("/offers");
  const summary = [`Загружено кап: ${toInsert.length}`, skipped ? `уже были: ${skipped}` : ""].filter(Boolean).join(", ");
  if (problems.length) return { error: `${summary}. Не загружено строк: ${problems.length}`, problems };
  redirect(`/caps?ok=${encodeURIComponent(summary)}&t=${Date.now()}`);
}
