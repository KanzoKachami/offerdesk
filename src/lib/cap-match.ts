// Подходит ли свободная капа под позицию запроса.

const APPS = ["APPS", "FB", "INAPP", "UAC"]; // всё это может называться [APPS]

export function sourceMatch(want: string | null | undefined, has: string | null | undefined) {
  if (!want || !has) return true;
  const w = want.toUpperCase().split(/\s+/)[0];
  const h = has.toUpperCase().split(/\s+/)[0];
  if (w === h) return true;
  if (w === "APPS" && APPS.includes(h)) return true;
  if (h === "APPS" && APPS.includes(w)) return true;
  return false;
}

export function capMatches(
  item: { geo_code: string; offer_id: string | null },
  req: { source_code: string | null; approach_code: string | null },
  cap: { geo_code: string; offer_id: string; source_code: string | null; approach_code: string | null }
) {
  if (cap.geo_code !== item.geo_code) return false;
  if (item.offer_id && cap.offer_id !== item.offer_id) return false;
  if (!sourceMatch(req.source_code, cap.source_code)) return false;
  if (req.approach_code && cap.approach_code && req.approach_code.toUpperCase() !== cap.approach_code.toUpperCase()) return false;
  return true;
}

export type CapText = {
  offer_name: string;
  geo_code: string;
  source_code: string | null;
  approach_code: string | null;
  adv_stream_id: string | null;
  cap: number | null;
  rate: number | null;
  currency: string;
};

export const capMoney = (c: { rate: number | null; currency: string }) => (c.rate != null ? `${c.currency === "EUR" ? "€" : "$"}${Number(c.rate)}` : "");

/** Одна строка про капу: «CRUSADO [FB] SLOTS — кап 20, $240 (ID 118185)» */
export function capLine(c: CapText, withGeo = false) {
  const head = `${c.offer_name}${withGeo ? ` (${c.geo_code})` : ""}${c.source_code ? ` [${c.source_code}]` : ""}${c.approach_code ? ` ${c.approach_code}` : ""}`;
  const terms = [c.cap ? `кап ${c.cap}` : null, capMoney(c) || null].filter(Boolean).join(", ");
  return `${head}${terms ? ` — ${terms}` : ""}${c.adv_stream_id ? ` (ID ${c.adv_stream_id})` : ""}`;
}

/** Сообщение аффам: свободные капы по гео. */
export function affText(caps: CapText[]) {
  if (!caps.length) return "Свободных кап нет.";
  const byGeo = new Map<string, CapText[]>();
  for (const c of caps) byGeo.set(c.geo_code, [...(byGeo.get(c.geo_code) ?? []), c]);
  const blocks = [...byGeo.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([geo, list]) => `${geo}:\n${list.map((c) => `• ${capLine(c)}`).join("\n")}`);
  return ["Ребят, есть свободные капы — посмотрите, кому можем предложить? Хочется начать отливать 🙏", "", ...blocks.join("\n\n").split("\n")].join("\n");
}
