import { createClient } from "@/lib/supabase/server";
import { loadCaps } from "@/lib/caps-data";

// CSV свободных кап с теми же фильтрами, что на странице
export async function GET(req: Request) {
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const sb = await createClient();
  const list = (await loadCaps(sb, { ...sp, status: "free" })).sort((a, b) => a.geo_code.localeCompare(b.geo_code));
  const head = ["Гео", "Продукт", "Рекл", "Сорс", "Подход", "Кап", "Ставка", "Валюта", "ID у рекла", "Свободна с", "Заметка"];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [head, ...list.map((c) => [c.geo_code, c.offer_name, c.advertiser_name, c.source_code, c.approach_code, c.cap, c.rate, c.currency, c.adv_stream_id, c.released_at, c.notes])].map((r) => r.map(esc).join(","));
  const date = new Date().toISOString().slice(0, 10);
  return new Response("﻿" + lines.join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="free-caps-${date}.csv"` },
  });
}
