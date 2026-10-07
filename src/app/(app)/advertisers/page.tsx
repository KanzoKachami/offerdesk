import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NewAdvertiserForm } from "@/components/advertiser-form";
import { Card, Empty, Flash, PageHeader, Td, Th } from "@/components/ui";
import { TierBadge } from "@/components/offer-bits";
import { tgLink, chatLink } from "@/components/simple-entity";

type Adv = {
  id: string;
  name: string;
  tier: string;
  tg_username: string | null;
  chat_link: string | null;
  offers: { id: string; status: string }[];
};

export default async function AdvertisersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: geos }, { data: sources }] = await Promise.all([
    supabase.from("geos").select("code"),
    supabase.from("sources").select("code"),
  ]);
  const { data } = await supabase
    .from("advertisers")
    .select("id, name, tier, tg_username, chat_link, offers(id, status)")
    .order("tier")
    .order("name");
  const list = (data ?? []) as Adv[];
  const tier = sp.tier;
  const shown = tier ? list.filter((a) => a.tier === tier) : list;

  return (
    <>
      <PageHeader title="Рекламодатели" subtitle="Владельцы офферов. Ключевые заводятся заранее, разовые — по ходу запросов." />
      <Flash sp={sp} />
      <Card title="Новый рекламодатель" className="mb-6">
        <NewAdvertiserForm geoCodes={(geos ?? []).map((g) => g.code as string)} sourceCodes={(sources ?? []).map((x) => x.code as string)} />
      </Card>
      <Card
        title={`Всего: ${shown.length}`}
        actions={
          <div className="flex gap-1 text-xs">
            {[
              ["", "Все"],
              ["key", "Ключевые"],
              ["occasional", "Разовые"],
            ].map(([v, l]) => (
              <Link
                key={v}
                href={v ? `/advertisers?tier=${v}` : "/advertisers"}
                className={`rounded-md px-2 py-1 ${tier === v || (!tier && !v) ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-100"}`}
              >
                {l}
              </Link>
            ))}
          </div>
        }
      >
        {shown.length === 0 ? (
          <Empty>Пока нет реклов</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Название</Th>
                  <Th>Уровень</Th>
                  <Th>Продукты</Th>
                  <Th>Активные</Th>
                  <Th>Telegram</Th>
                  <Th>Чат</Th>
                </tr>
              </thead>
              <tbody>
                {shown.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/advertisers/${a.id}`} className="font-medium text-slate-900 hover:text-indigo-600">
                        {a.name}
                      </Link>
                    </Td>
                    <Td>
                      <TierBadge t={a.tier} />
                    </Td>
                    <Td>{a.offers.length}</Td>
                    <Td>{a.offers.filter((o) => o.status === "active").length}</Td>
                    <Td>{tgLink(a.tg_username)}</Td>
                    <Td>{chatLink(a.chat_link)}</Td>
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
