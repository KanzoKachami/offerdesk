"use server";

// Действия с потоками (в базе таблица называется launches).

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const STAGES = ["waiting_link", "at_integrator", "integrated", "live", "no_traffic", "stopped"];
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim() || null;
const num = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").replace(/[^\d.,]/g, "").replace(",", ".");
  const n = Number(v);
  return v && Number.isFinite(n) ? n : null;
};
const upper = (v: string | null) => (v ? v.toUpperCase() : null);
const fail = (msg: string, extra = ""): never => redirect(`/streams?error=${encodeURIComponent(msg)}${extra}&t=${Date.now()}`);
const done = () => {
  revalidatePath("/streams");
  revalidatePath("/");
};

/** Сменить статус потока. Для «стопа» можно указать причину. */
export async function setLaunchStage(fd: FormData) {
  const id = String(fd.get("launch_id"));
  const stage = String(fd.get("stage"));
  if (!STAGES.includes(stage)) fail("Неизвестный статус");
  const patch: Record<string, unknown> = { stage };
  if (stage === "stopped" || stage === "no_traffic") patch.stop_reason = str(fd, "stop_reason");
  if (stage === "live" || stage === "integrated") patch.stop_reason = null;
  const sb = await createClient();
  const { error } = await sb.from("launches").update(patch).eq("id", id);
  if (error) fail(error.message);
  done();
}

/** «→ В потоки» у позиции запроса: создаёт поток (или открывает уже созданный). */
export async function createStreamFromItem(fd: FormData) {
  const itemId = String(fd.get("item_id"));
  const sb = await createClient();
  const { data, error } = await sb.rpc("create_launch_for_item", { p_item: itemId });
  if (error || !data) fail(error?.message ?? "Не удалось создать поток");
  done();
  redirect(`/streams?open=${data}&ok=${encodeURIComponent("Поток создан — статус «Ждём ссылку»")}&t=${Date.now()}#s-${data}`);
}

/** Один статус сразу нескольким потокам. */
export async function bulkSetStage(fd: FormData) {
  const ids = fd.getAll("ids").map(String).filter(Boolean);
  const stage = String(fd.get("stage"));
  if (!ids.length || !STAGES.includes(stage)) return;
  const sb = await createClient();
  const patch: Record<string, unknown> = { stage };
  if (stage === "live" || stage === "integrated") patch.stop_reason = null;
  const { error } = await sb.from("launches").update(patch).in("id", ids).neq("stage", stage);
  if (error) fail(error.message);
  done();
}

/** Заметка в историю потока (пинганул менеджера, веб просит время и т. п.). */
export async function launchNote(fd: FormData) {
  const id = String(fd.get("launch_id"));
  const text = str(fd, "text");
  if (!text) return;
  const sb = await createClient();
  const { data: l } = await sb.from("launches").select("request_id").eq("id", id).single();
  await sb.from("activities").insert({ launch_id: id, request_id: l?.request_id ?? null, kind: "launch_note", text });
  done();
}

/** Ответил реклу на его пинг — снимаем пометку «рекл ждёт». */
export async function launchReplied(fd: FormData) {
  const id = String(fd.get("launch_id"));
  const sb = await createClient();
  await sb.from("launches").update({ adv_waiting_since: null }).eq("id", id);
  await sb.from("activities").insert({ launch_id: id, kind: "launch_note", text: "Ответил реклу на пинг" });
  done();
}

/** Создать поток вручную или сохранить изменения. */
export async function saveStream(fd: FormData) {
  const id = str(fd, "id");
  const offer_id = str(fd, "offer_id");
  const geo_code = upper(str(fd, "geo_code"));
  const back = id ? `&edit=${id}` : "&new=1";
  if (!offer_id) fail("Выбери продукт", back);
  if (!geo_code) fail("Выбери гео", back);

  const adv = str(fd, "adv_stream_id");
  let sub = str(fd, "sub_id");
  if (sub && sub === adv) sub = null; // подмена = оригиналу → это не подмена
  const kpi = String(fd.get("kpi") ?? "");
  const stage = String(fd.get("stage") ?? "waiting_link");

  const row: Record<string, unknown> = {
    offer_id,
    geo_code: geo_code === "GB" ? "UK" : geo_code,
    source_code: upper(str(fd, "source_code")),
    approach_code: upper(str(fd, "approach_code")),
    rate: num(fd, "rate"),
    currency: str(fd, "currency") === "EUR" ? "EUR" : "USD",
    cap: num(fd, "cap"),
    kpi: kpi === "yes" ? true : kpi === "no" ? false : null,
    manager_id: str(fd, "manager_id"),
    webmaster: str(fd, "webmaster"),
    adv_stream_id: adv,
    sub_id: sub,
    notes: str(fd, "notes"),
    stop_reason: str(fd, "stop_reason"),
  };
  if (STAGES.includes(stage)) row.stage = stage;

  const sb = await createClient();
  let savedId = id;
  if (id) {
    const { error } = await sb.from("launches").update(row).eq("id", id);
    if (error) fail(error.message, back);
  } else {
    if (["integrated", "live", "no_traffic"].includes(stage)) row.issued_at = new Date().toISOString();
    const { data, error } = await sb.from("launches").insert(row).select("id").single();
    if (error || !data) fail(error?.message ?? "Не удалось сохранить", back);
    savedId = data!.id as string;
  }
  done();
  redirect(`/streams?open=${savedId}&ok=${encodeURIComponent(id ? "Поток сохранён" : "Поток добавлен")}&t=${Date.now()}#s-${savedId}`);
}

export async function deleteStream(fd: FormData) {
  const id = String(fd.get("id"));
  const sb = await createClient();
  const { error } = await sb.from("launches").delete().eq("id", id);
  if (error) fail(error.message);
  done();
  redirect(`/streams?ok=${encodeURIComponent("Поток удалён")}&t=${Date.now()}`);
}

// ---------------------------------------------------------------------
// Импорт из таблицы
// ---------------------------------------------------------------------

export type ImportRow = {
  line: number;
  adv_stream_id: string | null;
  sub_id: string | null;
  advertiser: string | null;
  product: string;
  geo: string;
  source: string | null;
  approach: string | null;
  rate: number | null;
  currency: "USD" | "EUR";
  cap: number | null;
  kpi: boolean | null;
  manager: string | null;
  webmaster: string | null;
  stage: string;
  notes: string | null;
};

export type ImportState = { error?: string; problems?: string[] };

/** Загрузить строки из гугл-таблицы. Неизвестные продукты создаются у выбранного рекла,
 *  неизвестные менеджеры — в справочнике менеджеров. Уже загруженные строки пропускаются. */
export async function importStreams(_prev: ImportState, fd: FormData): Promise<ImportState> {
  let rows: ImportRow[];
  try {
    rows = JSON.parse(String(fd.get("rows") ?? "[]"));
  } catch {
    return { error: "Не удалось прочитать строки" };
  }
  if (!rows.length) return { error: "Нет строк для загрузки" };
  // рекл для новых продуктов: { ПРОДУКТ: id рекла | "new:Название" }
  let productAdv: Record<string, string> = {};
  try {
    productAdv = JSON.parse(String(fd.get("product_adv") ?? "{}"));
  } catch {}

  const sb = await createClient();
  const [{ data: geos }, { data: offers }, { data: managers }, { data: existing }, { data: advs }] = await Promise.all([
    sb.from("geos").select("code"),
    sb.from("offers").select("id, name, geos"),
    sb.from("managers").select("id, name"),
    sb.from("launches").select("adv_stream_id, sub_id, geo_code"),
    sb.from("advertisers").select("id, name"),
  ]);
  const advByName = new Map((advs ?? []).map((a) => [String(a.name).toLowerCase(), a.id as string]));
  let newAdvertisers = 0;
  /** id рекла по названию; если такого нет — создаём */
  async function advertiserFor(name: string): Promise<string | null> {
    const k = name.trim().toLowerCase();
    if (!k) return null;
    const found = advByName.get(k);
    if (found) return found;
    const { data } = await sb.from("advertisers").insert({ name: name.trim() }).select("id").single();
    if (!data) return null;
    advByName.set(k, data.id as string);
    newAdvertisers++;
    return data.id as string;
  }
  const geoSet = new Set((geos ?? []).map((g) => g.code as string));
  const offerByName = new Map((offers ?? []).map((o) => [String(o.name).toUpperCase(), { id: o.id as string, geos: (o.geos as string[]) ?? [] }]));
  const managerByName = new Map((managers ?? []).map((m) => [String(m.name).toLowerCase(), m.id as string]));
  const key = (a: string | null, s: string | null, g: string) => `${a ?? ""}|${s ?? ""}|${g}`;
  const seen = new Set((existing ?? []).filter((e) => e.adv_stream_id).map((e) => key(e.adv_stream_id as string, e.sub_id as string | null, e.geo_code as string)));

  const problems: string[] = [];
  const toInsert: Record<string, unknown>[] = [];
  let skipped = 0;
  let newProducts = 0;
  let newManagers = 0;

  for (const r of rows) {
    const geo = r.geo.toUpperCase() === "GB" ? "UK" : r.geo.toUpperCase();
    const product = r.product.trim().toUpperCase();
    if (!product) {
      problems.push(`Строка ${r.line}: нет продукта`);
      continue;
    }
    if (!geoSet.has(geo)) {
      problems.push(`Строка ${r.line}: гео «${r.geo}» нет в справочнике (Настройки → Гео)`);
      continue;
    }
    if (r.adv_stream_id && seen.has(key(r.adv_stream_id, r.sub_id, geo))) {
      skipped++;
      continue;
    }

    // продукт
    let offer = offerByName.get(product);
    if (!offer) {
      const pick = productAdv[product] ?? "";
      const advertiserId = r.advertiser
        ? await advertiserFor(r.advertiser)
        : pick.startsWith("new:")
          ? await advertiserFor(pick.slice(4))
          : pick || null;
      if (!advertiserId) {
        problems.push(`Строка ${r.line}: продукта ${product} нет — выбери для него рекла`);
        continue;
      }
      const { data, error } = await sb.from("offers").insert({ advertiser_id: advertiserId, name: product, geos: [geo] }).select("id, geos").single();
      if (error || !data) {
        problems.push(`Строка ${r.line}: не удалось создать продукт ${product}: ${error?.message}`);
        continue;
      }
      offer = { id: data.id as string, geos: data.geos as string[] };
      offerByName.set(product, offer);
      newProducts++;
    } else if (!offer.geos.includes(geo)) {
      // у продукта не было этого гео — добавляем, чтобы подбор офферов его видел
      const geosNew = [...offer.geos, geo];
      const { error } = await sb.from("offers").update({ geos: geosNew }).eq("id", offer.id);
      if (!error) offer.geos = geosNew;
    }

    // менеджер
    let managerId: string | null = null;
    if (r.manager) {
      managerId = managerByName.get(r.manager.toLowerCase()) ?? null;
      if (!managerId) {
        const { data } = await sb.from("managers").insert({ name: r.manager }).select("id").single();
        if (data) {
          managerId = data.id as string;
          managerByName.set(r.manager.toLowerCase(), managerId);
          newManagers++;
        }
      }
    }

    const stage = STAGES.includes(r.stage) ? r.stage : "live";
    toInsert.push({
      offer_id: offer.id,
      geo_code: geo,
      adv_stream_id: r.adv_stream_id,
      sub_id: r.sub_id && r.sub_id !== r.adv_stream_id ? r.sub_id : null,
      source_code: r.source ? r.source.toUpperCase() : null,
      approach_code: r.approach ? r.approach.toUpperCase() : null,
      rate: r.rate,
      currency: r.currency,
      cap: r.cap,
      kpi: r.kpi,
      manager_id: managerId,
      webmaster: r.webmaster,
      stage,
      notes: r.notes,
      issued_at: ["integrated", "live", "no_traffic", "stopped"].includes(stage) ? new Date().toISOString() : null,
    });
    if (r.adv_stream_id) seen.add(key(r.adv_stream_id, r.sub_id, geo));
  }

  if (toInsert.length) {
    const { error } = await sb.from("launches").insert(toInsert);
    if (error) return { error: `Ошибка загрузки: ${error.message}`, problems };
  }

  revalidatePath("/streams");
  revalidatePath("/offers");
  revalidatePath("/managers");
  const summary = [
    `Загружено потоков: ${toInsert.length}`,
    skipped ? `уже были: ${skipped}` : "",
    newProducts ? `новых продуктов: ${newProducts}` : "",
    newAdvertisers ? `новых реклов: ${newAdvertisers}` : "",
    newManagers ? `новых менеджеров: ${newManagers}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  if (problems.length) return { error: `${summary}. Не загружено строк: ${problems.length}`, problems };
  redirect(`/streams?ok=${encodeURIComponent(summary)}&t=${Date.now()}`);
}
