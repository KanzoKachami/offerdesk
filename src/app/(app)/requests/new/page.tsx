import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadParseDicts } from "@/lib/request-data";
import { RequestForm } from "@/components/request-form";
import { Card, Flash, PageHeader } from "@/components/ui";

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const sb = await createClient();
  const [dicts, managers, assignees, webmasters] = await Promise.all([
    loadParseDicts(sb),
    sb.from("managers").select("id, name").eq("is_active", true).order("name"),
    sb.from("assignees").select("id, name, tg_username, is_me").order("name"),
    sb.from("webmasters").select("name").order("name"),
  ]);

  return (
    <>
      <div className="mb-2 text-sm">
        <Link href="/requests" className="text-slate-500 hover:text-slate-800">
          ← Запросы
        </Link>
      </div>
      <PageHeader title="Новый запрос" subtitle="Вставь сообщение менеджера и нажми «Разобрать» — поля заполнятся сами. Каждое гео станет отдельной позицией." />
      <Flash sp={sp} />
      <Card>
        <RequestForm
          managers={(managers.data ?? []) as { id: string; name: string }[]}
          assignees={(assignees.data ?? []) as { id: string; name: string; tg_username: string | null; is_me: boolean }[]}
          dicts={dicts}
          webmasters={(webmasters.data ?? []).map((w) => w.name as string)}
        />
      </Card>
    </>
  );
}
