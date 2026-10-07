"use server";


import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type SB = Awaited<ReturnType<typeof createClient>>;

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  const s = v == null ? "" : String(v).trim();
  return s === "" ? null : s;
};
const numOrNull = (fd: FormData, k: string) => {
  const s = str(fd, k);
  if (s == null) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
// Ошибка: показываем на той же странице. t= делает адрес уникальным, чтобы страница точно обновилась.
/** Успех: страница запроса и очередь перерисуются со свежими данными. */
const done = (path: string) => {
  revalidatePath(path);
  revalidatePath("/");
};

const fail = (path: string, msg: string): never => redirect(`${path}?error=${encodeURIComponent(msg)}&t=${Date.now()}`);

async function log(sb: SB, requestId: string, kind: string, text: string | null, extra: Record<string, unknown> = {}) {
  await sb.from("activities").insert({ request_id: requestId, kind, text, ...extra });
}

async function findOrCreateWebmaster(sb: SB, name: string | null, contact: string | null) {
  if (!name) return null;
  const { data } = await sb.from("webmasters").select("id, contact").ilike("name", name).limit(1);
  if (data && data[0]) {
    if (contact && !data[0].contact) await sb.from("webmasters").update({ contact }).eq("id", data[0].id);
    return data[0].id as string;
  }
  const { data: created, error } = await sb.from("webmasters").insert({ name, contact }).select("id").single();
  if (error) throw new Error(error.message);
  return created.id as string;
}

function collectGeos(fd: FormData) {
  const fromChips = fd.getAll("geos").map(String);
  const fromText = (str(fd, "geos_text") ?? "")
    .toUpperCase()
    .split(/[\s,;\/]+/)
    .filter((g) => /^[A-Z]{2}$/.test(g))
    .map((g) => (g === "GB" ? "UK" : g));
  return [...new Set([...fromChips, ...fromText])];
}

// ---------------------------------------------------------------------
// Создание и редактирование запроса
// ---------------------------------------------------------------------
export async function createRequest(fd: FormData) {
  const sb = await createClient();
  const geos = collectGeos(fd);
  if (geos.length === 0) fail("/requests/new", "Укажи хотя бы одно гео");

  let webmasterId: string | null;
  try {
    webmasterId = await findOrCreateWebmaster(sb, str(fd, "webmaster_name"), str(fd, "webmaster_contact"));
  } catch (e) {
    fail("/requests/new", `Вебмастер: ${(e as Error).message}`);
  }

  const offerId = str(fd, "offer_id");
  const { data: req, error } = await sb
    .from("requests")
    .insert({
      manager_id: str(fd, "manager_id"),
      webmaster_id: webmasterId!,
      type: str(fd, "type") ?? "offer_search",
      mode: offerId || str(fd, "product_text") ? "specific" : "search",
      source_code: str(fd, "source_code"),
      approach_code: str(fd, "approach_code"),
      is_inhouse: fd.get("is_inhouse") === "on",
      priority: str(fd, "priority") ?? "normal",
      raw_text: str(fd, "raw_text"),
      product_text: offerId ? null : str(fd, "product_text"),
      notes: str(fd, "notes"),
      origin: "manual",
    })
    .select("id")
    .single();
  if (error || !req) fail("/requests/new", error?.message ?? "Не удалось создать запрос");

  const assignees = fd.getAll("assignee_ids").map(String).filter(Boolean);
  if (assignees.length) await sb.from("request_assignees").insert(assignees.map((a) => ({ request_id: req!.id, assignee_id: a })));

  const { error: e2 } = await sb.from("request_items").insert(
    geos.map((g) => ({
      request_id: req!.id,
      geo_code: g,
      offer_id: offerId,
      rate_min: numOrNull(fd, "rate_min"),
      rate_max: numOrNull(fd, "rate_max"),
      currency: str(fd, "currency") ?? "USD",
      model: str(fd, "model"),
    }))
  );
  if (e2) fail(`/requests/${req!.id}`, `Позиции: ${e2.message}`);

  await log(sb, req!.id, "created", `Запрос создан: ${geos.join(", ")}`);
  redirect(`/requests/${req!.id}`);
}

export async function updateRequest(fd: FormData) {
  const id = String(fd.get("request_id"));
  const path = `/requests/${id}`;
  const sb = await createClient();
  let webmasterId: string | null = null;
  try {
    webmasterId = await findOrCreateWebmaster(sb, str(fd, "webmaster_name"), str(fd, "webmaster_contact"));
  } catch (e) {
    fail(path, (e as Error).message);
  }
  const { error } = await sb
    .from("requests")
    .update({
      manager_id: str(fd, "manager_id"),
      webmaster_id: webmasterId,
      type: str(fd, "type") ?? "offer_search",
      source_code: str(fd, "source_code"),
      approach_code: str(fd, "approach_code"),
      is_inhouse: fd.get("is_inhouse") === "on",
      priority: str(fd, "priority") ?? "normal",
      product_text: str(fd, "product_text"),
      notes: str(fd, "notes"),
    })
    .eq("id", id);
  if (error) fail(path, error.message);

  await sb.from("request_assignees").delete().eq("request_id", id);
  const assignees = fd.getAll("assignee_ids").map(String).filter(Boolean);
  if (assignees.length) await sb.from("request_assignees").insert(assignees.map((a) => ({ request_id: id, assignee_id: a })));
  done(path);
  return;
}

export async function deleteRequest(fd: FormData) {
  const id = String(fd.get("request_id"));
  const sb = await createClient();
  const { error } = await sb.from("requests").delete().eq("id", id);
  if (error) fail(`/requests/${id}`, error.message);
  redirect(`/requests?ok=${encodeURIComponent("Запрос удалён")}`);
}

export async function addItems(fd: FormData) {
  const id = String(fd.get("request_id"));
  const path = `/requests/${id}`;
  const geos = collectGeos(fd);
  if (!geos.length) fail(path, "Укажи гео");
  const sb = await createClient();
  const { data: first } = await sb.from("request_items").select("offer_id, rate_min, rate_max, currency, model").eq("request_id", id).limit(1);
  const base = first?.[0] ?? {};
  const { error } = await sb.from("request_items").insert(geos.map((g) => ({ ...base, request_id: id, geo_code: g })));
  if (error) fail(path, error.code === "23503" ? "Нет такого гео в справочнике" : error.message);
  await log(sb, id, "items_added", `Добавлены гео: ${geos.join(", ")}`);
  done(path);
  return;
}

export async function updateItem(fd: FormData) {
  const itemId = String(fd.get("item_id"));
  const path = String(fd.get("_path"));
  const sb = await createClient();
  const { error } = await sb
    .from("request_items")
    .update({
      offer_id: str(fd, "offer_id"),
      rate_min: numOrNull(fd, "rate_min"),
      rate_max: numOrNull(fd, "rate_max"),
      currency: str(fd, "currency") ?? "USD",
      model: str(fd, "model"),
    })
    .eq("id", itemId);
  if (error) fail(path, error.message);
  done(path);
  return;
}

export async function deleteItem(fd: FormData) {
  const itemId = String(fd.get("item_id"));
  const path = String(fd.get("_path"));
  const sb = await createClient();
  const { error } = await sb.from("request_items").delete().eq("id", itemId);
  if (error) fail(path, error.message);
  done(path);
  return;
}

// ---------------------------------------------------------------------
// Статусы позиции
// ---------------------------------------------------------------------
export async function setItemStatus(fd: FormData) {
  const itemId = String(fd.get("item_id"));
  const path = String(fd.get("_path") ?? "/");
  let status = String(fd.get("status"));
  const sb = await createClient();

  // Лишний запрос делаем только при снятии с паузы — нужен прежний статус
  if (status === "resume") {
    const { data: item } = await sb.from("request_items").select("status_before_pause").eq("id", itemId).single();
    status = item?.status_before_pause ?? "new";
  }
  if (status === "reopen") status = "new";

  // «Передал менеджеру / реклу» = позиция закрыта. Итог считаем по ответам:
  // хоть один «одобрено» → одобрено, иначе хоть один «с условиями» → с условиями, иначе отказ.
  if (status === "passed") {
    const [{ data: ios }, { data: ims }] = await Promise.all([
      sb.from("item_offers").select("outcome").eq("item_id", itemId).eq("status", "answered"),
      sb.from("item_managers").select("outcome").eq("item_id", itemId).eq("status", "answered"),
    ]);
    const outs = [...(ios ?? []), ...(ims ?? [])].map((x) => x.outcome as string | null).filter(Boolean);
    if (!outs.length) fail(path, "Ответов ещё нет — чтобы закрыть без ответа, используй «Закрыть вручную»");
    const outcome = outs.includes("approved") ? "approved" : outs.includes("partial") ? "partial" : "declined";
    const patch: Record<string, unknown> = { status: "closed", outcome };
    const answer = str(fd, "answer_to_manager");
    if (answer) patch.answer_to_manager = answer;
    const { error } = await sb.from("request_items").update(patch).eq("id", itemId);
    if (error) fail(path, error.message);
    done(path);
    return;
  }

  const patch: Record<string, unknown> = { status };
  if (status === "paused") {
    const reason = str(fd, "paused_reason");
    if (!reason) fail(path, "Укажи причину паузы");
    patch.paused_reason = reason;
  }
  if (status === "closed") {
    const outcome = str(fd, "outcome");
    if (!outcome) fail(path, "Выбери итог");
    patch.outcome = outcome;
    patch.outcome_note = str(fd, "outcome_note");
  }
  if (status === "passed" || status === "closed") {
    const answer = str(fd, "answer_to_manager");
    if (answer) patch.answer_to_manager = answer;
  }
  if (status === "new") patch.outcome = null;

  const { error } = await sb.from("request_items").update(patch).eq("id", itemId);
  if (error) fail(path, error.message);
  done(path);
  return;
}

// ---------------------------------------------------------------------
// Офферы внутри позиции
// ---------------------------------------------------------------------
// Статус позиции по её офферам пересчитывает сама база (триггер из 005_speed.sql),
// поэтому здесь только одна запись в item_offers — без лишних запросов.

export async function addItemOffers(fd: FormData) {
  const itemId = String(fd.get("item_id"));
  const path = String(fd.get("_path"));
  const ids = fd.getAll("offer_ids").map(String).filter(Boolean);
  if (!ids.length) fail(path, "Отметь хотя бы один оффер");
  const sb = await createClient();
  const { error } = await sb.from("item_offers").upsert(
    ids.map((offer_id) => ({ item_id: itemId, offer_id, status: "draft" })),
    { onConflict: "item_id,offer_id", ignoreDuplicates: true }
  );
  if (error) fail(path, error.message);
  done(path);
  return;
}

export async function itemOfferAction(fd: FormData) {
  const ioId = String(fd.get("io_id"));
  const path = String(fd.get("_path"));
  const action = String(fd.get("action"));
  const sb = await createClient();
  const now = new Date().toISOString();

  if (action === "remove") {
    await sb.from("item_offers").delete().eq("id", ioId);
    done(path);
    return;
  }

  let patch: Record<string, unknown>;
  switch (action) {
    case "sent":
      patch = { status: "sent", sent_at: now };
      break;
    case "pinged":
      patch = { status: "pinged", pinged_at: now };
      break;
    case "answered": {
      const outcome = str(fd, "outcome");
      if (!outcome) fail(path, "Выбери, что ответил рекл");
      patch = {
        status: "answered",
        answered_at: now,
        outcome,
        offered_rate: numOrNull(fd, "offered_rate"),
        offered_currency: str(fd, "offered_currency") === "EUR" ? "EUR" : "USD",
        offered_cap: numOrNull(fd, "offered_cap"),
        conditions: str(fd, "conditions"),
        answer_text: str(fd, "answer_text"),
      };
      break;
    }
    case "cancel":
      patch = { status: "cancelled" };
      break;
    case "reset":
      patch = { status: "draft", sent_at: null, pinged_at: null, answered_at: null, outcome: null };
      break;
    default:
      fail(path, "Неизвестное действие");
  }

  // Обновление и данные для ленты — одним запросом
  const { data: io, error } = await sb
    .from("item_offers")
    .update(patch!)
    .eq("id", ioId)
    .select("item_id, outcome, offers(name), request_items(request_id)")
    .single();
  if (error || !io) fail(path, error?.message ?? "Обращение не найдено");

  const name = (io!.offers as unknown as { name: string } | null)?.name ?? "";
  const requestId = (io!.request_items as unknown as { request_id: string } | null)?.request_id;
  const outcomeWord = io!.outcome === "approved" ? "одобрено" : io!.outcome === "partial" ? "с условиями" : "отказ";
  const logText =
    action === "sent" ? `Отправлен реклу: ${name}` :
    action === "pinged" ? `Пинганул: ${name}` :
    action === "answered" ? `Ответ по ${name}: ${outcomeWord}` :
    action === "cancel" ? `Отменён: ${name}` : `Сброшен: ${name}`;
  if (requestId) await log(sb, requestId, `offer_${action}`, logText, { item_id: io!.item_id, item_offer_id: ioId });
  done(path);
  return;
}

/** Все неотправленные офферы этого рекла в запросе → «отправлен». */
export async function markAdvertiserSent(fd: FormData) {
  const requestId = String(fd.get("request_id"));
  const ids = fd.getAll("io_ids").map(String).filter(Boolean);
  const path = `/requests/${requestId}`;
  if (!ids.length) return;
  const sb = await createClient();
  const { data: rows } = await sb
    .from("item_offers")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "draft")
    .select("id");
  if (rows?.length) await log(sb, requestId, "offer_sent", `Отправлено реклу офферов: ${rows.length}`);
  done(path);
  return;
}

export async function addNote(fd: FormData) {
  const requestId = String(fd.get("request_id"));
  const text = str(fd, "text");
  const path = `/requests/${requestId}`;
  if (!text) return;
  const sb = await createClient();
  await log(sb, requestId, "note", text);
  done(path);
  return;
}

// ---------------------------------------------------------------------
// Запросы «от рекла»: обращения к менеджерам
// ---------------------------------------------------------------------
export async function addItemManagers(fd: FormData) {
  const itemId = String(fd.get("item_id"));
  const path = String(fd.get("_path"));
  const ids = fd.getAll("manager_ids").map(String).filter(Boolean);
  if (!ids.length) fail(path, "Отметь хотя бы одного менеджера");
  const sb = await createClient();
  const { error } = await sb
    .from("item_managers")
    .upsert(ids.map((manager_id) => ({ item_id: itemId, manager_id, status: "draft" })), { onConflict: "item_id,manager_id", ignoreDuplicates: true });
  if (error) fail(path, error.message);
  done(path);
}

export async function itemManagerAction(fd: FormData) {
  const imId = String(fd.get("im_id"));
  const path = String(fd.get("_path"));
  const action = String(fd.get("action"));
  const sb = await createClient();
  const now = new Date().toISOString();
  if (action === "remove") {
    await sb.from("item_managers").delete().eq("id", imId);
    done(path);
    return;
  }
  let patch: Record<string, unknown>;
  switch (action) {
    case "sent":
      patch = { status: "sent", sent_at: now };
      break;
    case "answered": {
      const outcome = str(fd, "outcome");
      if (!outcome) fail(path, "Выбери, что ответил менеджер");
      patch = { status: "answered", answered_at: now, outcome, answer_text: str(fd, "answer_text") };
      break;
    }
    case "cancel":
      patch = { status: "cancelled" };
      break;
    case "reset":
      patch = { status: "draft", sent_at: null, answered_at: null, outcome: null };
      break;
    default:
      fail(path, "Неизвестное действие");
  }
  const { data: im, error } = await sb.from("item_managers").update(patch!).eq("id", imId).select("item_id, managers(name), request_items(request_id)").single();
  if (error || !im) fail(path, error?.message ?? "Не найдено");
  const name = (im!.managers as unknown as { name: string } | null)?.name ?? "";
  const requestId = (im!.request_items as unknown as { request_id: string } | null)?.request_id;
  const words: Record<string, string> = { sent: "Спросил менеджера", answered: "Ответ менеджера", cancel: "Отменён", reset: "Сброшен" };
  if (requestId) await log(sb, requestId, `manager_${action}`, `${words[action]}: ${name}`, { item_id: im!.item_id });
  done(path);
  return;
}

/** Все неотправленные обращения к менеджерам в запросе → «отправлено». */
export async function markManagersSent(fd: FormData) {
  const requestId = String(fd.get("request_id"));
  const ids = fd.getAll("im_ids").map(String).filter(Boolean);
  const path = `/requests/${requestId}`;
  if (!ids.length) return;
  const sb = await createClient();
  const { data: rows } = await sb.from("item_managers").update({ status: "sent", sent_at: new Date().toISOString() }).in("id", ids).eq("status", "draft").select("id");
  if (rows?.length) await log(sb, requestId, "manager_sent", `Отправлено менеджерам: ${rows.length}`);
  done(path);
  return;
}

/** Ответил реклу на его пинг по позиции — снимаем «рекл ждёт». */
export async function itemReplied(fd: FormData) {
  const itemId = String(fd.get("item_id"));
  const path = String(fd.get("_path"));
  const sb = await createClient();
  const { data: it } = await sb.from("request_items").update({ adv_waiting_since: null }).eq("id", itemId).select("request_id").single();
  if (it?.request_id) await log(sb, it.request_id, "adv_replied", "Ответил реклу на пинг", { item_id: itemId });
  done(path);
  return;
}
