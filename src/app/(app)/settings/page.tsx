import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { saveSettings } from "@/lib/actions";
import { CrudForm, DeleteButton, fieldsFor } from "@/components/crud";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { PendingButton } from "@/components/pending-button";
import { Card, Flash, PageHeader, btnCls, inputCls } from "@/components/ui";

type Dict = { code: string; name?: string; name_ru?: string };

const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function DictCard({ table, title, rows, edit }: { table: string; title: string; rows: Dict[]; edit?: string }) {
  const editing = edit ? rows.find((r) => r.code === edit) : null;
  return (
    <Card title={`${title} · ${rows.length}`}>
      <div className="mb-4 max-h-72 overflow-y-auto rounded-lg border border-slate-100">
        {rows.map((r) => (
          <div key={r.code} className={`flex items-center justify-between gap-2 px-3 py-1.5 text-sm ${r.code === edit ? "bg-indigo-50" : "odd:bg-slate-50"}`}>
            <span>
              <span className="font-mono font-semibold text-slate-900">{r.code}</span> <span className="text-slate-500">{r.name_ru ?? r.name}</span>
            </span>
            <span className="whitespace-nowrap">
              <Link href={`/settings?edit_${table}=${r.code}#${table}`} className={btnCls.ghost} scroll={false}>
                Изм.
              </Link>
              <DeleteButton table={table} id={r.code} path="/settings" label="×" />
            </span>
          </div>
        ))}
      </div>
      <div id={table}>
        <CrudForm key={editing?.code ?? "new"} table={table} fields={fieldsFor(table)} row={editing} path="/settings" cancelHref="/settings" columns={2} />
      </div>
    </Card>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [geos, sources, approaches, settings] = await Promise.all([
    supabase.from("geos").select("*").order("code"),
    supabase.from("sources").select("*").order("code"),
    supabase.from("approaches").select("*").order("code"),
    supabase.from("settings").select("*").maybeSingle(),
  ]);
  const s = settings.data ?? {};
  const workDays = new Set<number>(s.work_days ?? [1, 2, 3, 4, 5]);

  const num = (name: string, label: string, def: number, unit: string) => (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <div className="flex items-center gap-2">
        <input name={name} type="number" min={1} defaultValue={s[name] ?? def} className={inputCls} />
        <span className="text-xs text-slate-400">{unit}</span>
      </div>
    </label>
  );
  const time = (name: string, label: string, def: string) => (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <input name={name} type="time" defaultValue={(s[name] ?? def).slice(0, 5)} className={inputCls} />
    </label>
  );

  return (
    <>
      <PageHeader title="Настройки" subtitle="SLA, рабочие часы и справочники" />
      <Flash sp={sp} />

      <Card title="SLA и рабочее время (МСК)" className="mb-6">
        <form action={saveSettings} className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {num("sla_new_h", "Новый запрос без реакции", 2, "ч")}
            {num("sla_adv_ping_h", "Рекл молчит → пингануть", 24, "ч")}
            {num("sla_adv_escal_h", "После пинга → эскалация", 48, "ч")}
            {num("sla_pass_h", "Ответ не передан менеджеру", 1, "ч")}
            {num("sla_manager_h", "Ждём уточнение от менеджера", 24, "ч")}
            {num("archive_days", "Без движения → в архив", 7, "дн")}
            {num("duplicate_days", "Окно поиска дублей", 30, "дн")}
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Мой Telegram ID</span>
              <input name="tg_user_id" defaultValue={s.tg_user_id ?? ""} placeholder="для бота" className={inputCls} />
            </label>
            {time("work_start", "Начало дня", "10:00")}
            {time("work_end", "Конец дня", "19:00")}
            {time("digest_morning", "Утренний дайджест", "10:00")}
            {time("digest_evening", "Вечерний дайджест", "19:00")}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-2 text-xs font-medium text-slate-500">Рабочие дни:</span>
            {DAYS.map((d, i) => (
              <label key={d} className="cursor-pointer">
                <input type="checkbox" name="work_days" value={i + 1} defaultChecked={workDays.has(i + 1)} className="peer sr-only" />
                <span className="inline-block rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-600 peer-checked:border-indigo-500 peer-checked:bg-indigo-50 peer-checked:text-indigo-700">
                  {d}
                </span>
              </label>
            ))}
          </div>
          <PendingButton className={btnCls.primary}>Сохранить настройки</PendingButton>
        </form>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <DictCard table="geos" title="Гео" rows={(geos.data ?? []) as Dict[]} edit={sp.edit_geos} />
        <DictCard table="sources" title="Сорсы трафика" rows={(sources.data ?? []) as Dict[]} edit={sp.edit_sources} />
        <DictCard table="approaches" title="Подходы" rows={(approaches.data ?? []) as Dict[]} edit={sp.edit_approaches} />
      </div>
    </>
  );
}
