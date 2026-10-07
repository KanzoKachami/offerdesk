import { SimpleEntityPage } from "@/components/simple-entity";
import { WEBMASTER_KIND_OPTIONS } from "@/lib/crud-config";

const kind = (v: unknown) => WEBMASTER_KIND_OPTIONS.find((o) => o.value === v)?.label ?? "—";

export default async function WebmastersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  return (
    <SimpleEntityPage
      table="webmasters"
      title="Вебмастера"
      subtitle="Лёгкие карточки: по ним видно историю запросов и дубли. Обычно создаются автоматически из запросов."
      path="/webmasters"
      sp={await searchParams}
      columns={[
        { label: "Имя / команда", render: (r) => <span className="font-medium text-slate-900">{String(r.name)}</span> },
        { label: "Контакт", render: (r) => (r.contact as string) ?? "—" },
        { label: "Тип", render: (r) => kind(r.kind) },
        { label: "Заметки", render: (r) => (r.notes as string) ?? "", className: "max-w-xs truncate" },
      ]}
    />
  );
}
