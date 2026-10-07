import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  addItemManagers,
  addItemOffers,
  addItems,
  itemManagerAction,
  itemReplied,
  markManagersSent,
  addNote,
  deleteItem,
  deleteRequest,
  itemOfferAction,
  markAdvertiserSent,
  setItemStatus,
  updateItem,
  updateRequest,
} from "@/lib/request-actions";
import { loadSettings, slaAlert } from "@/lib/request-data";
import { advertiserReplyText, advertiserText, managerText, managersAskText, type TextItem } from "@/lib/request-texts";
import { ITEM_STATUS, PRIORITY, REQUEST_TYPE, hoursLabel, rateLabel } from "@/lib/request-meta";
import { Badge, Card, Empty, Flash, PageHeader, btnCls, inputCls } from "@/components/ui";
import { BallBadge, IoStatusBadge, ItemStatusBadge, OutcomeBadge } from "@/components/request-bits";
import { Codes } from "@/components/offer-bits";
import { CopyBox } from "@/components/copy-box";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { PendingButton } from "@/components/pending-button";
import { ActionForm } from "@/components/action-form";

type IO = {
  id: string;
  status: string;
  sent_at: string | null;
  pinged_at: string | null;
  answered_at: string | null;
  outcome: string | null;
  offered_rate: number | null;
  offered_currency: string | null;
  offered_cap: number | null;
  conditions: string | null;
  answer_text: string | null;
  offers: {
    id: string;
    name: string;
    currency: string;
    advertiser_id: string;
    advertisers: { name: string; lang: string } | null;
  } | null;
};
type IM = {
  id: string;
  status: string;
  sent_at: string | null;
  answered_at: string | null;
  outcome: string | null;
  answer_text: string | null;
  manager_id: string;
  managers: { name: string } | null;
};
type Item = {
  id: string;
  geo_code: string;
  offer_id: string | null;
  rate_min: number | null;
  rate_max: number | null;
  currency: string;
  model: string | null;
  status: string;
  status_changed_at: string;
  paused_reason: string | null;
  outcome: string | null;
  outcome_note: string | null;
  offers: { name: string } | null;
  adv_waiting_since: string | null;
  item_offers: IO[];
  item_managers: IM[];
};
type Candidate = { id: string; name: string; advertiser_name: string; rate: number | null; currency: string; cap: number | null; sources: string[] };

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }) : "";

function Act({ action, fields, children, tone = "secondary", confirm }: { action: (fd: FormData) => Promise<void>; fields: Record<string, string>; children: ReactNode; tone?: "primary" | "secondary" | "ghost" | "danger"; confirm?: string }) {
  return (
    <ActionForm action={action} className="inline">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {confirm ? (
        <ConfirmSubmit message={confirm} className={tone === "danger" ? btnCls.danger : btnCls.ghost}>
          {children}
        </ConfirmSubmit>
      ) : (
        <PendingButton className={tone === "primary" ? `${btnCls.primary} !px-3 !py-1 !text-xs` : tone === "secondary" ? `${btnCls.secondary} !px-3 !py-1 !text-xs` : tone === "danger" ? btnCls.danger : btnCls.ghost}>{children}</PendingButton>
      )}
    </ActionForm>
  );
}

export default async function RequestCard({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const path = `/requests/${id}`;
  const sb = await createClient();

  const [{ data: req }, { data: itemsData }, { data: acts }, { data: ra }, managers, assignees, sources, approaches, allOffers, settings] = await Promise.all([
    sb.from("v_requests").select("*").eq("id", id).maybeSingle(),
    sb
      .from("request_items")
      .select("*, offers(name), item_offers(*, offers(id, name, currency, advertiser_id, advertisers(name, lang))), item_managers(*, managers(name))")
      .eq("request_id", id)
      .order("geo_code"),
    sb.from("activities").select("*").eq("request_id", id).order("created_at", { ascending: false }).limit(100),
    sb.from("request_assignees").select("assignee_id").eq("request_id", id),
    sb.from("managers").select("id, name, is_active").order("name"),
    sb.from("assignees").select("id, name, tg_username, is_me").order("name"),
    sb.from("sources").select("code").order("code"),
    sb.from("approaches").select("code").order("code"),
    sb.from("offers").select("id, name").order("name"),
    loadSettings(sb),
  ]);
  if (!req) notFound();
  const isAdv = req.direction === "from_advertiser";
  const { data: advRow } =
    isAdv && req.advertiser_id ? await sb.from("advertisers").select("name, lang").eq("id", req.advertiser_id).maybeSingle() : { data: null };
  const advLang = (advRow as { lang?: string } | null)?.lang ?? "RU";

  const items = (itemsData ?? []) as unknown as Item[];
  const itemGeo = new Map(items.map((it) => [it.id, it.geo_code]));
  const selectedAssignees = new Set((ra ?? []).map((x) => x.assignee_id as string));

  // Кандидаты-офферы по каждой позиции
  const candidates = new Map<string, { list: Candidate[]; note?: string }>();
  await Promise.all(
    items
      .filter((it) => !isAdv && !["closed", "archived"].includes(it.status))
      .map(async (it) => {
        const { data } = await sb.rpc("find_offers", {
          p_geo: it.geo_code,
          p_source: req.source_code,
          p_approach: req.approach_code,
        });
        let list = ((data ?? []) as Candidate[]).filter((c) => !it.item_offers.some((io) => io.offers?.id === c.id));
        let note: string | undefined;
        if (it.offer_id) {
          // менеджер просит конкретный оффер — показываем его первым, даже если сорс не совпал
          const own = list.filter((c) => c.id === it.offer_id);
          if (own.length) list = own;
          else if (!it.item_offers.some((io) => io.offers?.id === it.offer_id)) {
            const { data: one } = await sb.from("v_offers").select("*").eq("id", it.offer_id);
            const o = (one ?? [])[0] as (Candidate & { geos: string[] }) | undefined;
            if (o) {
              note = o.geos.includes(it.geo_code) ? "Этот оффер не принимает сорс запроса — уточни у рекла" : `У оффера нет гео ${it.geo_code} в списке — уточни у рекла`;
              list = [o, ...list];
            }
          }
        }
        candidates.set(it.id, { list, note });
      })
  );

  // Тексты
  const textReq = { number: req.number, webmaster_name: req.webmaster_name, source_code: req.source_code, approach_code: req.approach_code, is_inhouse: req.is_inhouse };
  const textItems: TextItem[] = items.map((it) => ({
    ...it,
    offers: it.item_offers
      .filter((io) => io.status !== "cancelled")
      .map((io) => ({
        display_name: io.offers?.name ?? "",
        advertiser_name: io.offers?.advertisers?.name ?? "",
        status: io.status,
        outcome: io.outcome,
        offered_rate: io.offered_rate,
        offered_cap: io.offered_cap,
        conditions: io.conditions,
        currency: io.offered_currency ?? io.offers?.currency ?? "USD",
      })),
  }));
  const byAdv = new Map<string, { name: string; lang: string; lines: { offer: string; item: TextItem }[]; draftIds: string[] }>();
  items.forEach((it, idx) => {
    for (const io of it.item_offers) {
      if (!["draft", "sent", "pinged"].includes(io.status) || !io.offers) continue;
      const advId = io.offers.advertiser_id;
      const g = byAdv.get(advId) ?? { name: io.offers.advertisers?.name ?? "", lang: io.offers.advertisers?.lang ?? "RU", lines: [], draftIds: [] };
      g.lines.push({ offer: `${io.offers.name} (${it.geo_code})`, item: textItems[idx] });
      if (io.status === "draft") g.draftIds.push(io.id);
      byAdv.set(advId, g);
    }
  });
  const anyAnswer = !isAdv && items.some((it) => it.item_offers.some((io) => io.status === "answered") || it.status === "closed");

  // «От рекла»: тексты менеджерам и ответ реклу
  const openGeos = items.filter((it) => !["closed", "archived"].includes(it.status)).map((it) => it.geo_code);
  const managerDrafts = items.flatMap((it) => it.item_managers.filter((im) => im.status === "draft").map((im) => im.id));
  const advReply = advertiserReplyText(
    advLang,
    items.map((it) => ({ geo: it.geo_code, answers: it.item_managers.filter((im) => im.status === "answered").map((im) => ({ outcome: im.outcome, text: im.answer_text })) }))
  );
  const activeManagers = (managers.data ?? []).filter((m) => m.is_active !== false);

  const typeLabel = REQUEST_TYPE.find((t) => t.value === req.type)?.label ?? req.type;
  const summary = [typeLabel, req.is_inhouse ? "инхаус" : null, req.source_code, req.approach_code, req.product_text].filter(Boolean).join(" · ");

  return (
    <>
      <div className="mb-2 text-sm">
        <Link href="/requests" className="text-slate-500 hover:text-slate-800">
          ← Запросы
        </Link>
      </div>
      <PageHeader
        title={isAdv ? `#${req.number} · от рекла ${req.advertiser_name ?? ""}` : `#${req.number} · ${req.manager_name ?? "без менеджера"}${req.webmaster_name ? ` → ${req.webmaster_name}` : ""}`}
        subtitle={`${summary} · создан ${fmt(req.created_at)}${req.assignees_label ? ` · адресаты: ${req.assignees_label}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            {req.priority !== "normal" && <Badge tone={req.priority === "urgent" ? "rose" : "amber"}>{PRIORITY.find((p) => p.value === req.priority)?.label}</Badge>}
            <BallBadge b={req.ball} />
          </div>
        }
      />
      <Flash sp={sp} />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Позиции */}
        <div className="space-y-5 lg:col-span-2">
          {items.length === 0 && (
            <Card>
              <Empty>В запросе нет позиций — добавь гео справа</Empty>
            </Card>
          )}
          {items.map((it) => {
            const hours = (Date.now() - new Date(it.status_changed_at).getTime()) / 36e5;
            const alert = ["closed", "archived", "passed"].includes(it.status) ? null : slaAlert(it.status, hours, settings);
            const cand = candidates.get(it.id);
            const live = !["closed", "archived"].includes(it.status);
            const f = { item_id: it.id, _path: path };
            return (
              <Card key={it.id} className={alert?.level === "bad" ? "border-rose-300" : alert ? "border-amber-300" : ""}>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-lg font-bold text-slate-900">{it.geo_code}</span>
                      <ItemStatusBadge s={it.status} />
                      <OutcomeBadge o={it.status === "closed" ? it.outcome : null} />
                      <span className="text-xs text-slate-400">{hoursLabel(hours)} в статусе</span>
                      {alert && <span className={`text-xs font-semibold ${alert.level === "bad" ? "text-rose-600" : "text-amber-600"}`}>⚠ {alert.text}</span>}
                      {it.adv_waiting_since && <Badge tone="rose">рекл ждёт ответа</Badge>}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {[it.offers?.name ?? (req.mode === "specific" ? req.product_text : "подбор"), rateLabel(it.rate_min, it.rate_max, it.currency) && `${it.model ?? ""} ${rateLabel(it.rate_min, it.rate_max, it.currency)}`]
                        .filter(Boolean)
                        .join(" · ")}
                      {it.paused_reason && <span className="ml-2 text-slate-600">Пауза: {it.paused_reason}</span>}
                      {it.status === "closed" && it.outcome_note && <span className="ml-2 text-slate-600">{it.outcome_note}</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {it.adv_waiting_since && (
                      <Act action={itemReplied} fields={f} tone="primary">
                        Ответил реклу
                      </Act>
                    )}
                    {!isAdv && ["new"].includes(it.status) && (
                      <Act action={setItemStatus} fields={{ ...f, status: "clarifying" }}>
                        Уточнить у менеджера
                      </Act>
                    )}
                    {it.status === "clarifying" && (
                      <Act action={setItemStatus} fields={{ ...f, status: "reopen" }} tone="primary">
                        Уточнил
                      </Act>
                    )}
                    {it.status === "answered" && (
                      <Act action={setItemStatus} fields={{ ...f, status: "passed" }} tone="primary">
                        {isAdv ? "Передал реклу" : "Передал менеджеру"}
                      </Act>
                    )}
                    {["sent", "waiting"].includes(it.status) && (
                      <Act action={setItemStatus} fields={{ ...f, status: "archived" }} confirm={isAdv ? "Закрыть позицию как «менеджеры не ответили»?" : "Закрыть позицию как «рекл не ответил»?"}>
                        В архив без ответа
                      </Act>
                    )}
                    {it.status === "paused" && (
                      <Act action={setItemStatus} fields={{ ...f, status: "resume" }} tone="primary">
                        Снять с паузы
                      </Act>
                    )}
                    {["closed", "archived"].includes(it.status) && (
                      <Act action={setItemStatus} fields={{ ...f, status: "reopen" }}>
                        Открыть заново
                      </Act>
                    )}
                  </div>
                </div>

                {/* Офферы позиции */}
                {it.item_offers.length > 0 && (
                  <div className="mb-3 divide-y divide-slate-100 rounded-lg border border-slate-100">
                    {it.item_offers
                      .sort((a, b) => (a.offers?.name ?? "").localeCompare(b.offers?.name ?? ""))
                      .map((io) => {
                        const g = { io_id: io.id, _path: path };
                        return (
                          <div key={io.id} className={`px-3 py-2 ${io.status === "cancelled" ? "opacity-50" : ""}`}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-slate-900">{io.offers?.name}</span>
                                <span className="text-xs text-slate-500">{io.offers?.advertisers?.name}</span>
                                <IoStatusBadge s={io.status} />
                                {io.status === "answered" && <OutcomeBadge o={io.outcome} />}
                                <span className="text-xs text-slate-400">
                                  {io.answered_at ? `ответ ${fmt(io.answered_at)}` : io.pinged_at ? `пинг ${fmt(io.pinged_at)}` : io.sent_at ? `отпр. ${fmt(io.sent_at)}` : ""}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-1">
                                {io.status === "draft" && (
                                  <>
                                    <Act action={itemOfferAction} fields={{ ...g, action: "sent" }} tone="primary">
                                      Отправил
                                    </Act>
                                    <Act action={itemOfferAction} fields={{ ...g, action: "remove" }} tone="danger">
                                      Убрать
                                    </Act>
                                  </>
                                )}
                                {io.status === "sent" && (
                                  <Act action={itemOfferAction} fields={{ ...g, action: "pinged" }}>
                                    Пинганул
                                  </Act>
                                )}
                                {["sent", "pinged"].includes(io.status) && (
                                  <Act action={itemOfferAction} fields={{ ...g, action: "cancel" }} tone="ghost">
                                    Отменить
                                  </Act>
                                )}
                                {["answered", "cancelled"].includes(io.status) && (
                                  <Act action={itemOfferAction} fields={{ ...g, action: "reset" }} tone="ghost">
                                    Сбросить
                                  </Act>
                                )}
                              </div>
                            </div>
                            {io.status === "answered" && (io.offered_rate != null || io.offered_cap != null || io.conditions || io.answer_text) && (
                              <div className="mt-1 text-xs text-slate-600">
                                {[io.offered_rate != null ? `ставка ${(io.offered_currency ?? io.offers?.currency) === "EUR" ? "€" : "$"}${io.offered_rate}` : null, io.offered_cap != null ? `капа ${io.offered_cap}` : null, io.conditions].filter(Boolean).join(" · ")}
                                {io.answer_text && <div className="mt-1 whitespace-pre-wrap text-slate-400">«{io.answer_text}»</div>}
                              </div>
                            )}
                            {["sent", "pinged"].includes(io.status) && (
                              <details className="mt-2">
                                <summary className="cursor-pointer text-xs font-medium text-indigo-600">Записать ответ рекла</summary>
                                <ActionForm action={itemOfferAction} className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                                  <input type="hidden" name="io_id" value={io.id} />
                                  <input type="hidden" name="_path" value={path} />
                                  <input type="hidden" name="action" value="answered" />
                                  <select name="outcome" required defaultValue="" className={inputCls}>
                                    <option value="">Итог…</option>
                                    <option value="approved">✅ Одобрено</option>
                                    <option value="partial">⚠️ С условиями</option>
                                    <option value="declined">❌ Отказ</option>
                                  </select>
                                  <div className="flex gap-1">
                                    <input name="offered_rate" placeholder="Ставка" inputMode="decimal" className={inputCls} />
                                    <select name="offered_currency" defaultValue={io.offers?.currency === "EUR" ? "EUR" : "USD"} className={`${inputCls} !w-16 !px-2`}>
                                      <option value="USD">$</option>
                                      <option value="EUR">€</option>
                                    </select>
                                  </div>
                                  <input name="offered_cap" placeholder="Капа" inputMode="numeric" className={inputCls} />
                                  <input name="conditions" placeholder="Условия (KPI, бейзлайн…)" className={inputCls} />
                                  <textarea name="answer_text" rows={2} placeholder="Ответ рекла как есть (можно вставить из чата)" className={`${inputCls} col-span-full`} />
                                  <PendingButton className={`${btnCls.primary} col-span-full md:col-span-1`}>Сохранить ответ</PendingButton>
                                </ActionForm>
                              </details>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}

                {/* «От рекла»: к каким менеджерам пошли */}
                {isAdv && it.item_managers.length > 0 && (
                  <div className="mb-3 divide-y divide-slate-100 rounded-lg border border-slate-100">
                    {[...it.item_managers]
                      .sort((a, b) => (a.managers?.name ?? "").localeCompare(b.managers?.name ?? ""))
                      .map((im) => {
                        const g = { im_id: im.id, _path: path };
                        return (
                          <div key={im.id} className={`px-3 py-2 ${im.status === "cancelled" ? "opacity-50" : ""}`}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-slate-900">{im.managers?.name}</span>
                                <IoStatusBadge s={im.status} />
                                {im.status === "answered" && <OutcomeBadge o={im.outcome} />}
                                <span className="text-xs text-slate-400">{im.answered_at ? `ответ ${fmt(im.answered_at)}` : im.sent_at ? `спросил ${fmt(im.sent_at)}` : ""}</span>
                              </div>
                              <div className="flex flex-wrap items-center gap-1">
                                {im.status === "draft" && (
                                  <>
                                    <Act action={itemManagerAction} fields={{ ...g, action: "sent" }} tone="primary">
                                      Спросил
                                    </Act>
                                    <Act action={itemManagerAction} fields={{ ...g, action: "remove" }} tone="danger">
                                      Убрать
                                    </Act>
                                  </>
                                )}
                                {im.status === "sent" && (
                                  <Act action={itemManagerAction} fields={{ ...g, action: "cancel" }} tone="ghost">
                                    Отменить
                                  </Act>
                                )}
                                {["answered", "cancelled"].includes(im.status) && (
                                  <Act action={itemManagerAction} fields={{ ...g, action: "reset" }} tone="ghost">
                                    Сбросить
                                  </Act>
                                )}
                              </div>
                            </div>
                            {im.status === "answered" && im.answer_text && <div className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{im.answer_text}</div>}
                            {im.status === "sent" && (
                              <details className="mt-2">
                                <summary className="cursor-pointer text-xs font-medium text-indigo-600">Записать ответ менеджера</summary>
                                <ActionForm action={itemManagerAction} className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-4">
                                  <input type="hidden" name="im_id" value={im.id} />
                                  <input type="hidden" name="_path" value={path} />
                                  <input type="hidden" name="action" value="answered" />
                                  <select name="outcome" required defaultValue="" className={inputCls}>
                                    <option value="">Итог…</option>
                                    <option value="approved">✅ Есть трафик</option>
                                    <option value="partial">⚠️ Есть, с оговорками</option>
                                    <option value="declined">❌ Нет</option>
                                  </select>
                                  <input name="answer_text" placeholder="Что предлагает: веб, сорс, объёмы" className={`${inputCls} md:col-span-3`} />
                                  <PendingButton className={`${btnCls.primary} md:col-span-1`}>Сохранить ответ</PendingButton>
                                </ActionForm>
                              </details>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
                {isAdv && live && (
                  <details className="mb-3 rounded-lg bg-slate-50 p-3" open={it.item_managers.length === 0}>
                    <summary className="cursor-pointer text-sm font-medium text-indigo-600">Спросить менеджеров</summary>
                    <ActionForm action={addItemManagers} className="mt-2 space-y-2">
                      <input type="hidden" name="item_id" value={it.id} />
                      <input type="hidden" name="_path" value={path} />
                      <div className="flex flex-wrap gap-1.5">
                        {activeManagers
                          .filter((m) => !it.item_managers.some((im) => im.manager_id === m.id))
                          .map((m) => (
                            <label key={m.id} className="cursor-pointer">
                              <input type="checkbox" name="manager_ids" value={m.id} className="peer sr-only" />
                              <span className="inline-block rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 peer-checked:border-indigo-500 peer-checked:bg-indigo-50 peer-checked:text-indigo-700">
                                {m.name}
                              </span>
                            </label>
                          ))}
                      </div>
                      {activeManagers.length === 0 && <p className="text-xs text-slate-500">Заведи менеджеров в разделе «Менеджеры»</p>}
                      <div className="flex gap-2">
                        <PendingButton className={`${btnCls.primary} !px-3 !py-1 !text-xs`}>Добавить выбранных</PendingButton>
                      </div>
                    </ActionForm>
                    <ActionForm action={addItemManagers} className="mt-2">
                      <input type="hidden" name="item_id" value={it.id} />
                      <input type="hidden" name="_path" value={path} />
                      {activeManagers.filter((m) => !it.item_managers.some((im) => im.manager_id === m.id)).map((m) => (
                        <input key={m.id} type="hidden" name="manager_ids" value={m.id} />
                      ))}
                      <PendingButton className={`${btnCls.secondary} !px-3 !py-1 !text-xs`}>Спросить всех</PendingButton>
                    </ActionForm>
                  </details>
                )}

                {/* Подбор офферов */}
                {live && cand && (
                  <details className="mb-3 rounded-lg bg-slate-50 p-3" open={it.item_offers.length === 0}>
                    <summary className="cursor-pointer text-sm font-medium text-indigo-600">Подобрать офферы ({cand.list.length})</summary>
                    {cand.note && <p className="mt-2 text-xs text-amber-700">{cand.note}</p>}
                    {cand.list.length === 0 ? (
                      <p className="mt-2 text-xs text-slate-500">
                        Подходящих активных офферов нет. Проверь сорс и подход запроса или{" "}
                        <Link href="/offers" className="text-indigo-600">
                          заведи оффер
                        </Link>
                        .
                      </p>
                    ) : (
                      <ActionForm action={addItemOffers} className="mt-2 space-y-2">
                        <input type="hidden" name="item_id" value={it.id} />
                        <input type="hidden" name="_path" value={path} />
                        <div className="max-h-64 space-y-1 overflow-y-auto">
                          {cand.list.map((c) => (
                            <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-white">
                              <input type="checkbox" name="offer_ids" value={c.id} className="h-4 w-4 accent-indigo-600" />
                              <span className="font-semibold text-slate-900">{c.name}</span>
                              <span className="text-slate-500">{c.advertiser_name}</span>
                              <Codes list={c.sources} empty="любой сорс" />
                              {c.rate != null && (
                                <span className="text-slate-400">
                                  {c.currency === "EUR" ? "€" : "$"}
                                  {c.rate}
                                </span>
                              )}
                              {c.cap != null && <span className="text-slate-400">капа {c.cap}</span>}
                            </label>
                          ))}
                        </div>
                        <PendingButton className={`${btnCls.primary} !px-3 !py-1 !text-xs`}>Добавить выбранные</PendingButton>
                      </ActionForm>
                    )}
                  </details>
                )}

                {/* Закрыть / пауза / правка */}
                {live && (
                  <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-3 text-xs">
                    <details>
                      <summary className="cursor-pointer font-medium text-slate-600" title="Когда ответа рекла нет: менеджер передумал, неактуально, нашли сами">
                        Закрыть вручную
                      </summary>
                      <ActionForm action={setItemStatus} className="mt-2 flex flex-wrap gap-2">
                        <input type="hidden" name="item_id" value={it.id} />
                        <input type="hidden" name="_path" value={path} />
                        <input type="hidden" name="status" value="closed" />
                        <select name="outcome" required defaultValue="" className={`${inputCls} !w-auto`}>
                          <option value="">Итог…</option>
                          <option value="approved">✅ Одобрено</option>
                          <option value="partial">⚠️ Частично / с условиями</option>
                          <option value="declined">❌ Отказ / неактуально</option>
                        </select>
                        <input name="outcome_note" placeholder="Причина: неактуально, нашли сами…" className={`${inputCls} !w-64`} />
                        <PendingButton className={`${btnCls.primary} !px-3 !py-1 !text-xs`}>Закрыть</PendingButton>
                      </ActionForm>
                    </details>
                    {it.status !== "paused" && (
                      <details>
                        <summary className="cursor-pointer font-medium text-slate-600">На паузу</summary>
                        <ActionForm action={setItemStatus} className="mt-2 flex flex-wrap gap-2">
                          <input type="hidden" name="item_id" value={it.id} />
                          <input type="hidden" name="_path" value={path} />
                          <input type="hidden" name="status" value="paused" />
                          <input name="paused_reason" required placeholder="Причина" className={`${inputCls} !w-64`} />
                          <PendingButton className={`${btnCls.secondary} !px-3 !py-1 !text-xs`}>Поставить</PendingButton>
                        </ActionForm>
                      </details>
                    )}
                    <details>
                      <summary className="cursor-pointer font-medium text-slate-600">Изменить позицию</summary>
                      <ActionForm action={updateItem} className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-5">
                        <input type="hidden" name="item_id" value={it.id} />
                        <input type="hidden" name="_path" value={path} />
                        <select name="offer_id" defaultValue={it.offer_id ?? ""} className={inputCls}>
                          <option value="">— подбор —</option>
                          {(allOffers.data ?? []).map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                        <input name="rate_min" defaultValue={it.rate_min ?? ""} placeholder="от" className={inputCls} />
                        <input name="rate_max" defaultValue={it.rate_max ?? ""} placeholder="до" className={inputCls} />
                        <select name="model" defaultValue={it.model ?? "CPA"} className={inputCls}>
                          {["CPA", "RS", "Hybrid", "CPL", "other"].map((m) => (
                            <option key={m}>{m}</option>
                          ))}
                        </select>
                        <select name="currency" defaultValue={it.currency} className={inputCls}>
                          <option>USD</option>
                          <option>EUR</option>
                        </select>
                        <PendingButton className={`${btnCls.secondary} !px-3 !py-1 !text-xs`}>Сохранить</PendingButton>
                      </ActionForm>
                      <ActionForm action={deleteItem} className="mt-2">
                        <input type="hidden" name="item_id" value={it.id} />
                        <input type="hidden" name="_path" value={path} />
                        <ConfirmSubmit message="Удалить позицию вместе с офферами?" className={btnCls.danger}>
                          Удалить позицию
                        </ConfirmSubmit>
                      </ActionForm>
                    </details>
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        {/* Правая колонка */}
        <div className="space-y-5">
          {isAdv && openGeos.length > 0 && (
            <Card
              title="Текст менеджерам"
              actions={
                managerDrafts.length > 0 ? (
                  <ActionForm action={markManagersSent}>
                    <input type="hidden" name="request_id" value={id} />
                    {managerDrafts.map((x) => (
                      <input key={x} type="hidden" name="im_ids" value={x} />
                    ))}
                    <PendingButton className={`${btnCls.primary} !px-2 !py-1 !text-xs`}>Отметить: спросил ({managerDrafts.length})</PendingButton>
                  </ActionForm>
                ) : null
              }
            >
              <CopyBox text={managersAskText(req.advertiser_name ?? "", openGeos, req.source_code, req.raw_text)} rows={7} />
            </Card>
          )}
          {isAdv && (
            <Card title={`Ответ реклу (${advLang})`}>
              <CopyBox text={advReply} rows={Math.min(10, items.length + 3)} />
            </Card>
          )}
          {byAdv.size > 0 && (
            <Card title="Тексты реклам">
              <div className="space-y-5">
                {[...byAdv.entries()].map(([advId, g]) => (
                  <div key={advId}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-800">{g.name}</span>
                      {g.draftIds.length > 0 && (
                        <ActionForm action={markAdvertiserSent}>
                          <input type="hidden" name="request_id" value={id} />
                          {g.draftIds.map((x) => (
                            <input key={x} type="hidden" name="io_ids" value={x} />
                          ))}
                          <PendingButton className={`${btnCls.primary} !px-2 !py-1 !text-xs`}>Отметить отправленным ({g.draftIds.length})</PendingButton>
                        </ActionForm>
                      )}
                    </div>
                    <CopyBox text={advertiserText(textReq, g.lines, g.lang)} rows={Math.min(10, g.lines.length + 6)} />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {anyAnswer && (
            <Card title="Ответ менеджеру">
              <CopyBox text={managerText(textReq, textItems)} rows={Math.min(14, items.length * 2 + 3)} />
            </Card>
          )}

          <Card title="Добавить гео">
            <ActionForm action={addItems} className="flex gap-2">
              <input type="hidden" name="request_id" value={id} />
              <input name="geos_text" placeholder="IT, FR" className={inputCls} />
              <PendingButton className={btnCls.secondary}>Добавить</PendingButton>
            </ActionForm>
          </Card>

          <Card title="Лента">
            <ActionForm action={addNote} className="mb-4 flex gap-2">
              <input type="hidden" name="request_id" value={id} />
              <input name="text" placeholder="Заметка…" className={inputCls} />
              <PendingButton className={btnCls.secondary}>+</PendingButton>
            </ActionForm>
            <div className="max-h-96 space-y-2 overflow-y-auto">
              {(acts ?? []).map((a) => (
                <div key={a.id} className="text-xs">
                  <span className="text-slate-400">{fmt(a.created_at)}</span>{" "}
                  <span className={a.kind === "note" ? "text-slate-900" : "text-slate-600"}>
                    {a.text ?? (a.kind === "status_changed" && a.meta?.to ? `${itemGeo.get(a.item_id) ?? ""} ${ITEM_STATUS[a.meta.from]?.label ?? a.meta.from} → ${ITEM_STATUS[a.meta.to]?.label ?? a.meta.to}` : a.kind)}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {req.raw_text && (
            <Card title="Исходное сообщение">
              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap font-mono text-xs text-slate-600">{req.raw_text}</pre>
            </Card>
          )}

          <details className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">Редактировать запрос</summary>
            <ActionForm action={updateRequest} className="mt-4 space-y-3">
              <input type="hidden" name="request_id" value={id} />
              <select name="manager_id" defaultValue={req.manager_id ?? ""} className={inputCls}>
                <option value="">— менеджер —</option>
                {(managers.data ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <input name="webmaster_name" defaultValue={req.webmaster_name ?? ""} placeholder="Вебмастер" className={inputCls} />
              <input type="hidden" name="webmaster_contact" value="" />
              <select name="type" defaultValue={req.type} className={inputCls}>
                {REQUEST_TYPE.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <select name="source_code" defaultValue={req.source_code ?? ""} className={inputCls}>
                  <option value="">— сорс —</option>
                  {(sources.data ?? []).map((s) => (
                    <option key={s.code}>{s.code}</option>
                  ))}
                </select>
                <select name="approach_code" defaultValue={req.approach_code ?? ""} className={inputCls}>
                  <option value="">— подход —</option>
                  {(approaches.data ?? []).map((s) => (
                    <option key={s.code}>{s.code}</option>
                  ))}
                </select>
              </div>
              <input name="product_text" defaultValue={req.product_text ?? ""} placeholder="Продукт текстом" className={inputCls} />
              <select name="priority" defaultValue={req.priority} className={inputCls}>
                {PRIORITY.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="is_inhouse" defaultChecked={req.is_inhouse} className="h-4 w-4 accent-indigo-600" />
                Инхаус
              </label>
              <div className="flex flex-wrap gap-1.5">
                {(assignees.data ?? []).map((a) => (
                  <label key={a.id} className="cursor-pointer">
                    <input type="checkbox" name="assignee_ids" value={a.id} defaultChecked={selectedAssignees.has(a.id)} className="peer sr-only" />
                    <span className="inline-block rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 peer-checked:border-indigo-500 peer-checked:bg-indigo-50 peer-checked:text-indigo-700">
                      {a.tg_username ? `@${a.tg_username}` : a.name}
                    </span>
                  </label>
                ))}
              </div>
              <input name="notes" defaultValue={req.notes ?? ""} placeholder="Заметка" className={inputCls} />
              <PendingButton className={btnCls.primary}>Сохранить</PendingButton>
            </ActionForm>
            <ActionForm action={deleteRequest} className="mt-4 border-t border-slate-100 pt-3">
              <input type="hidden" name="request_id" value={id} />
              <ConfirmSubmit message="Удалить запрос целиком?" className={btnCls.danger}>
                Удалить запрос
              </ConfirmSubmit>
            </ActionForm>
          </details>
        </div>
      </div>
    </>
  );
}
