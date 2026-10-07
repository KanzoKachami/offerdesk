import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadDictOptions } from "@/lib/options";
import { CrudForm, DeleteButton, fieldsFor } from "@/components/crud";
import { Card, EditLink, Empty, Flash, PageHeader, Td, Th } from "@/components/ui";
import { Codes, OfferStatus, TierBadge, money } from "@/components/offer-bits";
import { chatLink, tgLink } from "@/components/simple-entity";
import { AddProductsForm } from "@/components/advertiser-form";

type Offer = {
  id: string;
  name: string;
  geos: string[];
  sources: string[];
  approaches: string[];
  model: string | null;
  rate: number | null;
  currency: string;
  cap: number | null;
  status: string;
  notes: string | null;
};

export default async function AdvertiserCard({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const path = `/advertisers/${id}`;
  const supabase = await createClient();

  const [{ data: adv }, { data: offersData }, dict] = await Promise.all([
    supabase.from("advertisers").select("*").eq("id", id).maybeSingle(),
    supabase.from("offers").select("*").eq("advertiser_id", id).order("name"),
    loadDictOptions(supabase),
  ]);
  if (!adv) notFound();

  const offers = (offersData ?? []) as Offer[];
  const editOffer = sp.edit_offer ? offers.find((o) => o.id === sp.edit_offer) ?? null : null;
  const offerFields = fieldsFor("offers", { geos: dict.geo, sources: dict.source, approaches: dict.approach }, ["advertiser_id"]);

  return (
    <>
      <div className="mb-2 text-sm">
        <Link href="/advertisers" className="text-slate-500 hover:text-slate-800">
          ← Рекламодатели
        </Link>
      </div>
      <PageHeader
        title={adv.name}
        subtitle={[adv.contact, adv.notes].filter(Boolean).join(" · ") || undefined}
        actions={
          <div className="flex items-center gap-3 text-sm">
            <TierBadge t={adv.tier} />
            {tgLink(adv.tg_username)}
            {adv.chat_link && <span>Чат: {chatLink(adv.chat_link)}</span>}
          </div>
        }
      />
      <Flash sp={sp} />

      <Card title={`Продукты · ${offers.length}`} className="mb-6">
        {offers.length === 0 ? (
          <Empty>У рекла пока нет продуктов — добавь ниже</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Продукт</Th>
                  <Th>Гео</Th>
                  <Th>Сорсы</Th>
                  <Th>Условия</Th>
                  <Th>Статус</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {offers.map((o) => (
                  <tr key={o.id} className={o.id === sp.edit_offer ? "bg-indigo-50/50" : "hover:bg-slate-50"}>
                    <Td className="font-semibold text-slate-900">
                      {o.name}
                      {o.notes && <div className="text-xs font-normal text-slate-400">{o.notes}</div>}
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
                    <Td className="whitespace-nowrap text-right">
                      <EditLink href={`${path}?edit_offer=${o.id}#offer-form`} />
                      <DeleteButton table="offers" id={o.id} path={path} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editOffer ? (
        <Card title={`Редактирование: ${editOffer.name}`} className="mb-6">
          <div id="offer-form">
            <CrudForm
              key={editOffer.id}
              table="offers"
              fields={offerFields}
              row={editOffer}
              fixed={{ advertiser_id: id }}
              path={path}
              cancelHref={path}
              columns={4}
            />
          </div>
        </Card>
      ) : (
        <Card title="Добавить продукты" className="mb-6">
          <div id="offer-form">
            <AddProductsForm advertiserId={id} geoCodes={dict.geo.map((g) => g.value)} sourceCodes={dict.source.map((x) => x.value)} />
            <p className="mt-3 text-xs text-slate-400">Ставку, капу и подходы можно указать потом — кнопка «Изменить» у продукта.</p>
          </div>
        </Card>
      )}

      <details className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" open={sp.edit === "1"}>
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">Редактировать карточку рекла</summary>
        <div className="mt-4">
          <CrudForm table="advertisers" fields={fieldsFor("advertisers")} row={adv} path={path} cancelHref={path} />
          <div className="mt-4 border-t border-slate-100 pt-3">
            <DeleteButton table="advertisers" id={id} path="/advertisers" label="Удалить рекла (только если нет офферов)" />
          </div>
        </div>
      </details>
    </>
  );
}
