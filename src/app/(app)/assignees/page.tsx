import { SimpleEntityPage, tgLink } from "@/components/simple-entity";
import { Badge } from "@/components/ui";

export default async function AssigneesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  return (
    <SimpleEntityPage
      table="assignees"
      title="Адресаты"
      subtitle="Кого менеджеры тегают в запросах (@Vladsupp, @Diii_bro…). Отметь себя галочкой «Это я»."
      path="/assignees"
      sp={await searchParams}
      columns={[
        { label: "Имя", render: (r) => <span className="font-medium text-slate-900">{String(r.name)}</span> },
        { label: "Telegram", render: (r) => tgLink(r.tg_username) },
        { label: "", render: (r) => (r.is_me ? <Badge tone="indigo">это я</Badge> : null) },
      ]}
    />
  );
}
