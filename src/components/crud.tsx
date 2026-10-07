import Link from "next/link";
import clsx from "clsx";
import { saveRow, deleteRow } from "@/lib/actions";
import { TABLES, type Field, type Option } from "@/lib/crud-config";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { PendingButton } from "@/components/pending-button";
import { btnCls, inputCls } from "@/components/ui";

type Row = Record<string, unknown>;

/** Поля таблицы с подставленными вариантами для select/multiselect. */
export function fieldsFor(table: string, options: Record<string, Option[]> = {}, omit: string[] = []): Field[] {
  return TABLES[table].fields
    .filter((f) => !omit.includes(f.name))
    .map((f) => (options[f.name] ? { ...f, options: options[f.name] } : f));
}

function FieldInput({ f, value, readOnly }: { f: Field; value: unknown; readOnly?: boolean }) {
  const common = { name: f.name, id: `f-${f.name}`, required: f.required, placeholder: f.placeholder };

  switch (f.type) {
    case "textarea":
      return <textarea {...common} rows={3} defaultValue={(value as string) ?? ""} className={inputCls} />;
    case "checkbox":
      return (
        <label className="flex h-[38px] items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name={f.name} defaultChecked={value === undefined ? f.name === "is_active" : Boolean(value)} className="h-4 w-4 accent-indigo-600" />
          {f.label}
        </label>
      );
    case "select":
      return (
        <select {...common} defaultValue={(value as string) ?? ""} className={inputCls}>
          {!f.required && <option value="">—</option>}
          {f.required && value == null && <option value="">Выбери…</option>}
          {(f.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "multiselect": {
      const selected = new Set((value as string[]) ?? []);
      return (
        <div className="flex flex-wrap gap-1.5">
          {(f.options ?? []).map((o) => (
            <label key={o.value} className="cursor-pointer">
              <input type="checkbox" name={f.name} value={o.value} defaultChecked={selected.has(o.value)} className="peer sr-only" />
              <span className="inline-block rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 peer-checked:border-indigo-500 peer-checked:bg-indigo-50 peer-checked:text-indigo-700">
                {o.label}
              </span>
            </label>
          ))}
          {(f.options ?? []).length === 0 && <span className="text-xs text-slate-400">Справочник пуст</span>}
        </div>
      );
    }
    case "tags":
      return <input {...common} defaultValue={((value as string[]) ?? []).join(", ")} className={inputCls} />;
    case "number":
      return <input {...common} type="text" inputMode="decimal" defaultValue={(value as number | null) ?? ""} className={inputCls} />;
    case "date":
      return <input {...common} type="date" defaultValue={(value as string) ?? ""} className={inputCls} />;
    default:
      return <input {...common} type="text" readOnly={readOnly} defaultValue={(value as string) ?? ""} className={inputCls} />;
  }
}

export function CrudForm({
  table,
  fields,
  row,
  path,
  fixed = {},
  cancelHref,
  columns = 3,
  defaults,
}: {
  table: string;
  fields: Field[];
  row?: Row | null;
  path: string;
  fixed?: Record<string, string>;
  cancelHref?: string;
  columns?: 2 | 3 | 4;
  defaults?: Row;
}) {
  const values = row ?? defaults;
  const pk = TABLES[table].pk;
  const id = row ? String(row[pk]) : "";
  const grid = { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-4" }[columns];

  return (
    <form action={saveRow} className="space-y-4">
      <input type="hidden" name="_table" value={table} />
      <input type="hidden" name="_id" value={id} />
      <input type="hidden" name="_path" value={path} />
      {Object.entries(fixed).map(([k, v]) => (
        <input key={k} type="hidden" name={`_fixed_${k}`} value={v} />
      ))}
      <div className={clsx("grid grid-cols-1 gap-3", grid)}>
        {fields.map((f) => (
          <div key={f.name} className={clsx(f.wide && "md:col-span-full")}>
            {f.type !== "checkbox" && (
              <label htmlFor={`f-${f.name}`} className="mb-1 block text-xs font-medium text-slate-500">
                {f.label}
                {f.required && <span className="text-rose-500"> *</span>}
              </label>
            )}
            {f.type === "checkbox" && <div className="mb-1 h-4" />}
            <FieldInput f={f} value={values?.[f.name]} readOnly={Boolean(id) && f.name === pk} />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <PendingButton className={btnCls.primary}>{id ? "Сохранить" : "Добавить"}</PendingButton>
        {id && cancelHref && (
          <Link href={cancelHref} className={btnCls.secondary} scroll={false}>
            Отмена
          </Link>
        )}
      </div>
    </form>
  );
}

export function DeleteButton({ table, id, path, label = "Удалить" }: { table: string; id: string; path: string; label?: string }) {
  return (
    <form action={deleteRow} className="inline">
      <input type="hidden" name="_table" value={table} />
      <input type="hidden" name="_id" value={id} />
      <input type="hidden" name="_path" value={path} />
      <ConfirmSubmit message="Удалить запись?" className={btnCls.danger}>
        {label}
      </ConfirmSubmit>
    </form>
  );
}
