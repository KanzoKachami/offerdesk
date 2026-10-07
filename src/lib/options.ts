import type { SupabaseClient } from "@supabase/supabase-js";
import type { Option } from "@/lib/crud-config";

/** Варианты для выпадающих списков справочников. */
export async function loadDictOptions(supabase: SupabaseClient) {
  const [geos, approaches, sources] = await Promise.all([
    supabase.from("geos").select("code, name_ru").order("code"),
    supabase.from("approaches").select("code, name").order("code"),
    supabase.from("sources").select("code, name").order("code"),
  ]);
  const geo: Option[] = (geos.data ?? []).map((g) => ({ value: g.code, label: g.code }));
  const geoLong: Option[] = (geos.data ?? []).map((g) => ({ value: g.code, label: `${g.code} — ${g.name_ru}` }));
  const approach: Option[] = (approaches.data ?? []).map((a) => ({ value: a.code, label: a.code }));
  const source: Option[] = (sources.data ?? []).map((s) => ({ value: s.code, label: s.code }));
  return { geo, geoLong, approach, source };
}

/** Рекламодатели для выпадающего списка. */
export async function loadAdvertiserOptions(supabase: SupabaseClient): Promise<Option[]> {
  const { data } = await supabase.from("advertisers").select("id, name").order("name");
  return (data ?? []).map((a) => ({ value: a.id as string, label: a.name as string }));
}
