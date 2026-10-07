import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadParseDicts } from "@/lib/request-data";
import { InboundForm } from "@/components/inbound-form";
import { Card, Flash, PageHeader } from "@/components/ui";

export default async function InboundPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const sb = await createClient();
  const [dicts, { data: advs }] = await Promise.all([loadParseDicts(sb), sb.from("advertisers").select("id, name").order("name")]);
  return (
    <>
      <div className="mb-2 text-sm">
        <Link href="/" className="text-slate-500 hover:text-slate-800">
          ← Очередь
        </Link>
      </div>
      <PageHeader title="Сообщение от рекла" subtitle="Вставь сообщение рекла: пинг по начатому привяжется к запуску или запросу, новый спрос станет запросом «от рекла»." />
      <Flash sp={sp} />
      <Card>
        <InboundForm advertisers={(advs ?? []) as { id: string; name: string }[]} dicts={dicts} />
      </Card>
    </>
  );
}
