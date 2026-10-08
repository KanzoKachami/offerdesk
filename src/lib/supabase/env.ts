// Адрес и публичный ключ Supabase из переменных окружения Vercel.
// Пробелы и кавычки по краям убираем: их часто захватывают при копировании.
const clean = (v: string | undefined) => (v ?? "").trim().replace(/^["']|["']$/g, "").trim();

export const SUPABASE_URL = clean(process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, "");
export const SUPABASE_KEY = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** Что не так с настройками (null — всё в порядке). Значения ключей не раскрываем. */
export function supabaseEnvProblem(): string | null {
  if (!SUPABASE_URL) return "Не задана переменная NEXT_PUBLIC_SUPABASE_URL";
  if (!SUPABASE_KEY) return "Не задана переменная NEXT_PUBLIC_SUPABASE_ANON_KEY";
  if (!/^https?:\/\/[^/\s]+$/.test(SUPABASE_URL))
    return "NEXT_PUBLIC_SUPABASE_URL должна выглядеть как https://xxxx.supabase.co — без пути, пробелов и слеша в конце";
  if (/^sb_secret_/.test(SUPABASE_KEY) || /service_role/.test(SUPABASE_KEY))
    return "В NEXT_PUBLIC_SUPABASE_ANON_KEY вставлен секретный ключ — нужен anon / publishable";
  if (!/^(eyJ|sb_publishable_)/.test(SUPABASE_KEY))
    return "NEXT_PUBLIC_SUPABASE_ANON_KEY не похож на ключ Supabase (должен начинаться с eyJ… или sb_publishable_…)";
  return null;
}
