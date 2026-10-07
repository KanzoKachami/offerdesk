import { SimpleEntityPage, chatLink, tgLink } from "@/components/simple-entity";
import { Badge } from "@/components/ui";

export default async function ManagersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  return (
    <SimpleEntityPage
      table="managers"
      title="Менеджеры"
      subtitle="Заказчики запросов — у каждого свой чат в Telegram"
      path="/managers"
      sp={await searchParams}
      columns={[
        { label: "Имя", render: (r) => <span className="font-medium text-slate-900">{String(r.name)}</span> },
        { label: "Отдел", render: (r) => (r.department as string) ?? "—" },
        { label: "Telegram", render: (r) => tgLink(r.tg_username) },
        { label: "Чат", render: (r) => chatLink(r.chat_link) },
        { label: "Статус", render: (r) => (r.is_active ? <Badge tone="green">активен</Badge> : <Badge>неактивен</Badge>) },
      ]}
    />
  );
}
