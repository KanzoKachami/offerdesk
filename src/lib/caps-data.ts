import type { SupabaseClient } from "@supabase/supabase-js";

export type FreeCap = {
  id: string;
  offer_id: string;
  offer_name: string;
  advertiser_name: string | null;
  geo_code: string;
  source_code: string | null;
  approach_code: string | null;
  adv_stream_id: string | null;
  cap: number | null;
  rate: number | null;
  currency: string;
  released_by: string | null;
  released_manager_id: string | null;
  released_manager_name: string | null;
  released_at: string;
  days_free: number;
  status: string;
  item_id: string | null;
  request_id: string | null;
  request_number: number | null;
  issued_webmaster: string | null;
  issued_manager_name: string | null;
  notes: string | null;
};

export const CAP_FILTERS: Record<string, { label: string; statuses: string[] }> = {
  active: { label: "Свободные и предложенные", statuses: ["free", "offered"] },
  free: { label: "Только свободные", statuses: ["free"] },
  offered: { label: "Предложенные", statuses: ["offered"] },
  issued: { label: "Выданные", statuses: ["issued"] },
  gone: { label: "Сгоревшие", statuses: ["gone"] },
  all: { label: "Все", statuses: ["free", "offered", "issued", "gone"] },
};

/** Капы по фильтрам из адресной строки (страница и выгрузка используют одно и то же). */
export async function loadCaps(sb: SupabaseClient, sp: Record<string, string>) {
  const f = CAP_FILTERS[sp.status ?? "active"] ?? CAP_FILTERS.active;
  let q = sb.from("v_free_caps").select("*").in("status", f.statuses);
  if (sp.geo) q = q.eq("geo_code", sp.geo);
  if (sp.offer) q = q.eq("offer_id", sp.offer);
  const { data } = await q.order("released_at", { ascending: true });
  const text = (sp.q ?? "").trim().toLowerCase();
  return ((data ?? []) as FreeCap[]).filter(
    (c) =>
      !text ||
      [c.offer_name, c.advertiser_name, c.adv_stream_id, c.released_by, c.source_code, c.approach_code, c.notes]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(text))
  );
}
