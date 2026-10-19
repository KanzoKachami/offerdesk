"use server";

// Синхронизация потоков через Chrome: токен, по которому Claude кладёт строки таблицы во входящие.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Новый токен синхронизации: старый перестаёт работать. */
export async function newSheetToken() {
  const sb = await createClient();
  const { error } = await sb.rpc("sheet_new_token");
  const qs = new URLSearchParams({ ...(error ? { error: error.message } : { ok: "Новый токен создан" }), t: String(Date.now()) });
  revalidatePath("/streams/import");
  redirect(`/streams/import?${qs}`);
}
