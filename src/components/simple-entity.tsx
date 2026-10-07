import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { CrudForm, DeleteButton, fieldsFor } from "@/components/crud";
import { Card, EditLink, Empty, Flash, PageHeader, Td, Th } from "@/components/ui";

type Row = Record<string, unknown>;
export type Column = { label: string; render: (r: Row) => ReactNode; className?: string };

/** Страница «список + форма» для простых сущностей. */
export async function SimpleEntityPage({
  table,
  title,
  subtitle,
  path,
  columns,
  sp,
  orderBy = "name",
  formTitle = "Добавить",
}: {
  table: string;
  title: string;
  subtitle?: string;
  path: string;
  columns: Column[];
  sp: { ok?: string; error?: string; edit?: string };
  orderBy?: string;
  formTitle?: string;
}) {
  const supabase = await createClient();
  const { data: rows } = await supabase.from(table).select("*").order(orderBy);
  const list = (rows ?? []) as Row[];
  const editing = sp.edit ? list.find((r) => String(r.id) === sp.edit) : null;

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <Flash sp={sp} />
      <Card title={editing ? "Редактирование" : formTitle} className="mb-6">
        <CrudForm key={editing ? String(editing.id) : "new"} table={table} fields={fieldsFor(table)} row={editing} path={path} cancelHref={path} />
      </Card>
      <Card title={`Всего: ${list.length}`}>
        {list.length === 0 ? (
          <Empty>Пока пусто</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {columns.map((c) => (
                    <Th key={c.label}>{c.label}</Th>
                  ))}
                  <Th />
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={String(r.id)} className="hover:bg-slate-50">
                    {columns.map((c) => (
                      <Td key={c.label} className={c.className}>
                        {c.render(r)}
                      </Td>
                    ))}
                    <Td className="whitespace-nowrap text-right">
                      <EditLink href={`${path}?edit=${r.id}`} />
                      <DeleteButton table={table} id={String(r.id)} path={path} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

export function tgLink(username: unknown) {
  if (!username) return <span className="text-slate-300">—</span>;
  return (
    <a href={`https://t.me/${username}`} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
      @{String(username)}
    </a>
  );
}

export function chatLink(link: unknown) {
  if (!link) return <span className="text-slate-300">—</span>;
  return (
    <a href={String(link)} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
      открыть
    </a>
  );
}
