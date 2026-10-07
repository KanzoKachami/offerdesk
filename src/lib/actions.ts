"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TABLES, parseForm } from "@/lib/crud-config";

type DbError = { code?: string; message: string } | null;

function humanError(e: DbError): string {
  if (!e) return "";
  if (e.code === "23505") return "Такая запись уже есть";
  if (e.code === "23503") return "Нельзя удалить: на запись ссылаются другие данные";
  if (e.code === "23514") return "Значение не прошло проверку";
  if (e.code === "23502") return "Не заполнено обязательное поле";
  return e.message;
}

function back(path: string, params: Record<string, string>): never {
  const clean = path.split("?")[0];
  // t= делает адрес уникальным: иначе повторное «Добавлено» на том же адресе не обновит страницу
  const qs = new URLSearchParams({ ...params, t: String(Date.now()) }).toString();
  redirect(qs ? `${clean}?${qs}` : clean);
}

/** Создание или обновление строки любой таблицы из TABLES. */
export async function saveRow(fd: FormData) {
  const table = String(fd.get("_table"));
  const id = String(fd.get("_id") ?? "");
  const path = String(fd.get("_path") ?? "/");
  const cfg = TABLES[table];
  if (!cfg) throw new Error("Unknown table");

  const data = parseForm(cfg, fd);
  // первичный ключ-код (гео, сорс, подход) после создания не меняем: на него ссылаются офферы
  if (id && cfg.pk !== "id") delete data[cfg.pk];
  // скрытые поля с фиксированными значениями (например, advertiser_id в карточке рекла)
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("_fixed_")) data[k.slice(7)] = String(v);
  }

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from(table).update(data).eq(cfg.pk, id)
    : await supabase.from(table).insert(data);

  if (error) back(path, { error: humanError(error) });
  revalidatePath(path.split("?")[0]);
  back(path, { ok: id ? "Сохранено" : "Добавлено" });
}

export async function deleteRow(fd: FormData) {
  const table = String(fd.get("_table"));
  const id = String(fd.get("_id"));
  const path = String(fd.get("_path") ?? "/");
  const cfg = TABLES[table];
  if (!cfg || !id) throw new Error("Bad delete");

  const supabase = await createClient();
  const { error } = await supabase.from(table).delete().eq(cfg.pk, id);
  if (error) back(path, { error: humanError(error) });
  revalidatePath(path.split("?")[0]);
  back(path, { ok: "Удалено" });
}

const SETTINGS_INT = [
  "sla_new_h",
  "sla_adv_ping_h",
  "sla_adv_escal_h",
  "sla_pass_h",
  "sla_manager_h",
  "archive_days",
  "duplicate_days",
  "sla_link_h",
  "sla_integrator_h",
] as const;

export async function saveSettings(fd: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const row: Record<string, unknown> = { owner_id: user.id };
  for (const k of SETTINGS_INT) {
    const n = Number(fd.get(k));
    if (Number.isFinite(n) && n > 0) row[k] = Math.round(n);
  }
  for (const k of ["work_start", "work_end", "digest_morning", "digest_evening"]) {
    const v = String(fd.get(k) ?? "");
    if (/^\d{2}:\d{2}$/.test(v)) row[k] = v;
  }
  const push = String(fd.get("push_days") ?? "")
    .split(/[\s,;]+/)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  if (push.length) row.push_days = [...new Set(push)].sort((a, b) => a - b).slice(0, 4);
  row.work_days = fd.getAll("work_days").map(Number).filter((n) => n >= 1 && n <= 7);
  row.integrator_name = String(fd.get("integrator_name") ?? "").trim() || null;
  row.integrator_tg = String(fd.get("integrator_tg") ?? "").trim().replace(/^@+/, "") || null;
  const tg = String(fd.get("tg_user_id") ?? "").trim();
  row.tg_user_id = tg ? Number(tg) : null;

  const { error } = await supabase.from("settings").upsert(row);
  if (error) back("/settings", { error: humanError(error) });
  revalidatePath("/settings");
  back("/settings", { ok: "Настройки сохранены" });
}

export async function signIn(fd: FormData) {
  const email = String(fd.get("email") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) back("/login", { error: "Неверный email или пароль" });
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
