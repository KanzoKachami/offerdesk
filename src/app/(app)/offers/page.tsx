import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadAdvertiserOptions, loadDictOptions } from "@/lib/options";
import { CrudForm, fieldsFor } from "@/components/crud";
import { Card, Empty, Flash, PageHeader, Td, Th, btnCls, inputCls } from "@/components/ui";
import { Codes, OfferStatus, TierBadge, money } from "@/components/offer-bits";

type OfferRow = {
  id: string;
  name: string;
  advertiser_id: string;
  advertiser_name: string;
  tier: string;
  geos: string[];
  sources: string[];
  model: string | null;
  rate: number | null;
  currency: string;
  cap: number | null;
  status: string;
};

export default async function OffersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const geo = sp.geo?.toUpperCase() || "";
  const source = sp.source?.toUpperCase() || "";
  const status = sp.status ?? "active";
  const q = sp.q?.trim() ?? "";

  let query = supabase.from("v_offers").select("*").order("name").limit(500);
  if (geo) query = query.contains("geos", [geo]);
  if (status) query = query.eq("status", status);
  if (q) query = query.or(`name.ilike.*${q}*,advertiser_name.ilike.*${q}*`);

  const [dict, advertisers, { data }] = await Promise.all([loadDictOptions(supabase), loadAdvertiserOptions(supabase), query]);
  // Сорс: оффер принимает этот сорс или не ограничивает сорсы вовсе
  const offers = ((data ?? []) as OfferRow[]).filter((o) => !source || o.sources.length === 0 || o.sources.includes(source));

  return (
    <>
      <PageHeader title="Офферы" subtitle="Оффер — продукт рекламодателя: на каких гео работает и какие сорсы принимает." />
      <Flash sp={sp} />

      <Card className="mb-6">
        <form className="grid grid-cols-2 gap-3 md:grid-cols-5" method="get">
          <select name="geo" defaultValue={geo} className={inputCls}>
            <option value="">Все гео</option>
            {dict.geoLong.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select name="source" defaultValue={source} className={inputCls}>
            <option value="">Любой сорс</option>
            {dict.source.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select name="status" defaultValue={status} className={inputCls}>
            <option value="active">Активные</option>
            <option value="paused">На паузе</option>
            <option value="closed">Закрытые</option>
            <option value="">Все</option>
          </select>
          <input name="q" defaultValue={q} placeholder="Оффер или рекл" className={inputCls} />
          <div className="flex gap-2">
            <button className={btnCls.primary}>Найти</button>
            <Link href="/offers" className={btnCls.secondary}>
              Сброс
            </Link>
          </div>
        </form>
      </Card>

      <Card title={`Найдено: ${offers.length}`} className="mb-6">
        {offers.length === 0 ? (
          <Empty>Ничего не найдено</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Оффер</Th>
                  <Th>Рекламодатель</Th>
                  <Th>Гео</Th>
                  <Th>Сорсы</Th>
                  <Th>Условия</Th>
                  <Th>Статус</Th>
                </tr>
              </thead>
              <tbody>
                {offers.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <Td className="font-semibold text-slate-900">
                      <Link href={`/advertisers/${o.advertiser_id}?edit_offer=${o.id}#offer-form`} className="hover:text-indigo-600">
                        {o.name}
                      </Link>
                    </Td>
                    <Td>
                      <Link href={`/advertisers/${o.advertiser_id}`} className="hover:text-indigo-600">
                        {o.advertiser_name}
                      </Link>{" "}
                      <TierBadge t={o.tier} />
                    </Td>
                    <Td>
                      <Codes list={o.geos} tone="indigo" />
                    </Td>
                    <Td>
                      <Codes list={o.sources} empty="любой" />
                    </Td>
                    <Td className="whitespace-nowrap text-sm">
                      {[o.model, o.rate != null ? money(o.rate, o.currency) : null, o.cap != null ? `капа ${o.cap}` : null].filter(Boolean).join(" · ") || "—"}
                    </Td>
                    <Td>
                      <OfferStatus s={o.status} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Новый оффер">
        {advertisers.length === 0 ? (
          <Empty>
            Сначала заведи рекламодателя в разделе{" "}
            <Link href="/advertisers" className="text-indigo-600">
              Рекламодатели
            </Link>
          </Empty>
        ) : (
          <CrudForm
            table="offers"
            fields={fieldsFor("offers", { advertiser_id: advertisers, geos: dict.geo, sources: dict.source, approaches: dict.approach })}
            defaults={{ status: "active", currency: "USD", model: "CPA" }}
            path="/offers"
            columns={4}
          />
        )}
      </Card>
    </>
  );
}
