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
  ftd?: number | null; // «Отлито» — депы за текущий месяц
  issued_on?: string | null; // дата выдачи потока, YYYY-MM-DD
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
    sb.from("launches").select("id, adv_stream_id, sub_id, geo_code, offer_id, webmaster, stage, cap, rate, currency, kpi, manager_id, notes, source_code, approach_code, ftd, issued_on"),
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
  // Как узнать «ту же строку» при ежедневной загрузке: по ID у рекла + подмене + гео,
  // а если ID нет — по продукту + гео + вебу.
  type Ex = { id: string; adv_stream_id: string | null; sub_id: string | null; geo_code: string; offer_id: string | null; webmaster: string | null; stage: string; cap: number | null; rate: number | null; currency: string; kpi: boolean | null; manager_id: string | null; notes: string | null; source_code: string | null; approach_code: string | null; ftd: number | null; issued_on: string | null };
  const key = (adv: string | null, sub: string | null, geo: string, offerId: string | null, web: string | null) =>
    adv ? `id|${adv}|${sub ?? ""}|${geo}` : `w|${offerId ?? ""}|${geo}|${(web ?? "").toLowerCase()}`;
  const byKey = new Map<string, Ex | null>();
  for (const e of (existing ?? []) as Ex[]) byKey.set(key(e.adv_stream_id, e.sub_id, e.geo_code, e.offer_id, e.webmaster), e);
  const seenIds: string[] = [];
  let updated = 0;

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
    const sub = r.sub_id && r.sub_id !== r.adv_stream_id ? r.sub_id : null;
    const k = key(r.adv_stream_id, sub, geo, offer.id, r.webmaster);
    if (byKey.has(k)) {
      const ex = byKey.get(k);
      if (!ex) {
        skipped++; // повтор строки в этом же файле
        continue;
      }
      // Уже есть: обновляем только то, что поменялось в таблице
      const next: Record<string, unknown> = {
        offer_id: offer.id,
        source_code: r.source ? r.source.toUpperCase() : null,
        approach_code: r.approach ? r.approach.toUpperCase() : null,
        rate: r.rate,
        currency: r.currency,
        cap: r.cap,
        kpi: r.kpi,
        manager_id: managerId,
        webmaster: r.webmaster,
        notes: r.notes,
        ftd: r.ftd ?? null,
        issued_on: r.issued_on ?? null,
      };
      const patch: Record<string, unknown> = {};
      for (const [f, v] of Object.entries(next)) {
        const old = (ex as unknown as Record<string, unknown>)[f];
        const same = f === "rate" ? (old == null ? null : Number(old)) === (v == null ? null : Number(v)) : (old ?? null) === (v ?? null);
        if (!same) patch[f] = v;
      }
      // Статус из таблицы: «СТОП» останавливает, а если «СТОП» убрали — снова «Льёт». Остальные статусы — твои.
      if (stage === "stopped" && ex.stage !== "stopped") patch.stage = "stopped";
      if (stage !== "stopped" && ex.stage === "stopped") patch.stage = "live";
      if (Object.keys(patch).length) {
        const { error } = await sb.from("launches").update({ ...patch, seen_at: new Date().toISOString() }).eq("id", ex.id);
        if (error) problems.push(`Строка ${r.line}: не удалось обновить — ${error.message}`);
        else updated++;
      } else {
        seenIds.push(ex.id);
        skipped++;
      }
      byKey.set(k, null);
      continue;
    }
    byKey.set(k, null);
    toInsert.push({
      offer_id: offer.id,
      geo_code: geo,
      adv_stream_id: r.adv_stream_id,
      sub_id: sub,
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
      ftd: r.ftd ?? null,
      issued_on: r.issued_on ?? null,
      issued_at: ["integrated", "live", "no_traffic", "stopped"].includes(stage) ? new Date().toISOString() : null,
      seen_at: new Date().toISOString(),
    });
  }
  if (seenIds.length) await sb.from("launches").update({ seen_at: new Date().toISOString() }).in("id", seenIds);

  if (toInsert.length) {
    const { error } = await sb.from("launches").insert(toInsert);
    if (error) return { error: `Ошибка загрузки: ${error.message}`, problems };
  }
  // после загрузки: неактуальные потоки → свободные капы
  const movedToCaps = await autoFreeCaps(sb);

  revalidatePath("/streams");
  revalidatePath("/caps");
  revalidatePath("/offers");
  revalidatePath("/managers");
  const summary = [
    `Новых потоков: ${toInsert.length}`,
    `обновлено: ${updated}`,
    `без изменений: ${skipped}`,
    movedToCaps ? `в свободные капы ушло: ${movedToCaps}` : "",
    newProducts ? `новых продуктов: ${newProducts}` : "",
    newAdvertisers ? `новых реклов: ${newAdvertisers}` : "",
    newManagers ? `новых менеджеров: ${newManagers}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  if (problems.length) return { error: `${summary}. Не загружено строк: ${problems.length}`, problems };
  redirect(`/streams?ok=${encodeURIComponent(summary)}&t=${Date.now()}`);
}

// ---------------------------------------------------------------------
// Неактуальные потоки → свободные капы
// ---------------------------------------------------------------------

/** «Неактуально» в комментариях — веб не льёт. «СТОП» сюда не входит: это рекл остановил. */
const NOT_ACTUAL = /не\s*актуальн|веб\s+отказ|отказал|отказ\b|не\s+будет\s+лить|игнор/i;
const ORIGINAL_MIN_DAYS = 7; // оригинал выдан больше 7 дней назад
const SUB_MIN_DAYS = 5; // подмена без депов выдана больше 5 дней назад

type Sb = Awaited<ReturnType<typeof createClient>>;
type L = {
  id: string;
  adv_stream_id: string | null;
  sub_id: string | null;
  geo_code: string;
  offer_id: string | null;
  notes: string | null;
  stage: string;
  ftd: number | null;
  issued_on: string | null;
  created_at: string;
  free_cap_id: string | null;
  source_code: string | null;
  approach_code: string | null;
  cap: number | null;
  rate: number | null;
  currency: string;
  webmaster: string | null;
  manager_id: string | null;
};

const daysSince = (l: L) => Math.floor((Date.now() - new Date(l.issued_on ?? l.created_at).getTime()) / 86400000);

/** Правила:
 *  - в комментариях «неактуально» (и похожее), поток выдан больше 7 дней назад;
 *  - сама строка не подмена;
 *  - если под этим ID есть подмены: ни на одной нет депов и все выданы больше 5 дней назад.
 *  Возвращает, сколько потоков ушло в свободные капы. */
async function autoFreeCaps(sb: Sb): Promise<number> {
  const [{ data }, { data: caps }] = await Promise.all([
    sb.from("launches").select("id, adv_stream_id, sub_id, geo_code, offer_id, notes, stage, ftd, issued_on, created_at, free_cap_id, source_code, approach_code, cap, rate, currency, webmaster, manager_id"),
    sb.from("free_caps").select("id, adv_stream_id, geo_code"),
  ]);
  const all = (data ?? []) as L[];
  const capByKey = new Map((caps ?? []).filter((c) => c.adv_stream_id).map((c) => [`${c.adv_stream_id}|${c.geo_code}`, c.id as string]));
  const subsOf = (l: L) => all.filter((x) => x.sub_id && x.adv_stream_id === l.adv_stream_id && x.geo_code === l.geo_code);
  let moved = 0;
  for (const l of all) {
    if (l.free_cap_id || l.sub_id || !l.adv_stream_id || !l.offer_id) continue;
    if (!l.notes || !NOT_ACTUAL.test(l.notes)) continue;
    if (daysSince(l) <= ORIGINAL_MIN_DAYS) continue;
    const subs = subsOf(l);
    if (subs.some((x) => (x.ftd ?? 0) > 0)) continue; // подмена льёт — капа занята
    if (subs.some((x) => daysSince(x) <= SUB_MIN_DAYS)) continue; // подмену выдали недавно — ждём
    moved += (await streamToCap(sb, l, capByKey, "авто: неактуально")) ? 1 : 0;
  }
  return moved;
}

/** Создать свободную капу из потока (или привязать к уже существующей по тому же ID и гео). */
async function streamToCap(sb: Sb, l: L, capByKey: Map<string, string>, why: string): Promise<boolean> {
  const k = `${l.adv_stream_id}|${l.geo_code}`;
  let capId = l.adv_stream_id ? capByKey.get(k) : undefined;
  if (!capId) {
    const { data, error } = await sb
      .from("free_caps")
      .insert({
        offer_id: l.offer_id,
        geo_code: l.geo_code,
        source_code: l.source_code,
        approach_code: l.approach_code,
        adv_stream_id: l.adv_stream_id,
        cap: l.cap,
        rate: l.rate,
        currency: l.currency === "EUR" ? "EUR" : "USD",
        released_by: l.webmaster,
        released_manager_id: l.manager_id,
        launch_id: l.id,
        notes: `из потоков (${why})${l.notes ? `: ${l.notes}` : ""}`.slice(0, 500),
      })
      .select("id")
      .single();
    if (error || !data) return false;
    capId = data.id as string;
    capByKey.set(k, capId);
  }
  await sb.from("launches").update({ free_cap_id: capId }).eq("id", l.id);
  return true;
}

/** Кнопка в строке потока: менеджер сказал «лить не будут» — капа свободна. */
export async function moveStreamToCaps(fd: FormData) {
  const id = String(fd.get("id"));
  const sb = await createClient();
  const { data: l } = await sb
    .from("launches")
    .select("id, adv_stream_id, sub_id, geo_code, offer_id, notes, stage, ftd, issued_on, created_at, free_cap_id, source_code, approach_code, cap, rate, currency, webmaster, manager_id")
    .eq("id", id)
    .single();
  if (!l) fail("Поток не найден");
  if (!(l as L).offer_id) fail("У потока не указан продукт — сначала поправь его");
  const { data: caps } = await sb.from("free_caps").select("id, adv_stream_id, geo_code");
  const capByKey = new Map((caps ?? []).filter((c) => c.adv_stream_id).map((c) => [`${c.adv_stream_id}|${c.geo_code}`, c.id as string]));
  const ok = await streamToCap(sb, l as L, capByKey, "вручную");
  if (!ok) fail("Не удалось создать свободную капу");
  revalidatePath("/streams");
  revalidatePath("/caps");
  redirect(`/streams?ok=${encodeURIComponent("Капа ушла в «Свободные капы»")}&t=${Date.now()}`);
}
