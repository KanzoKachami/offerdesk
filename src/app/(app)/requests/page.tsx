import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, Flash, PageHeader, Td, Th, btnCls, inputCls } from "@/components/ui";
import { BallBadge, GeoChips } from "@/components/request-bits";
import { REQUEST_TYPE } from "@/lib/request-meta";

type Req = {
  id: string;
  number: number;
  created_at: string;
  manager_name: string | null;
  direction: string;
  advertiser_name: string | null;
  webmaster_name: string | null;
  product_text: string | null;
  source_code: string | null;
  approach_code: string | null;
  is_inhouse: boolean;
  type: string;
  priority: string;
  ball: string;
  mine: boolean;
  assignees_label: string;
  items_brief: { geo: string; status: string; outcome: string | null }[];
};

const fmt = (d: string) => new Date(d).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });

export default async function RequestsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const view = sp.view ?? "open";
  const sb = await createClient();
  const { data: managers } = await sb.from("managers").select("id, name").order("name");

  let q = sb.from("v_requests").select("*").order("created_at", { ascending: false }).limit(300);
  if (view === "open") q = q.neq("ball", "closed");
  if (view === "closed") q = q.eq("ball", "closed");
  if (sp.mine === "1") q = q.eq("mine", true);
  if (sp.manager) q = q.eq("manager_id", sp.manager);
  if (sp.q) q = q.or(`webmaster_name.ilike.%${sp.q}%,product_text.ilike.%${sp.q}%,raw_text.ilike.%${sp.q}%`);
  const { data } = await q;
  let list = (data ?? []) as Req[];
  if (sp.geo) list = list.filter((r) => r.items_brief.some((i) => i.geo === sp.geo.toUpperCase()));
  const typeLabel = (t: string) => REQUEST_TYPE.find((x) => x.value === t)?.label ?? t;

  return (
    <>
      <PageHeader
        title="Запросы"
        subtitle="Все запросы менеджеров. Каждое гео — отдельная позиция со своим статусом."
        actions={
          <Link href="/requests/new" className={btnCls.primary}>
            + Новый запрос
          </Link>
        }
      />
      <Flash sp={sp} />
      <Card className="mb-6">
        <form method="get" className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <select name="view" defaultValue={view} className={inputCls}>
            <option value="open">Открытые</option>
            <option value="closed">Закрытые</option>
            <option value="all">Все</option>
          </select>
          <select name="manager" defaultValue={sp.manager ?? ""} className={inputCls}>
            <option value="">Все менеджеры</option>
            {(managers ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <input name="geo" defaultValue={sp.geo ?? ""} placeholder="Гео, напр. DE" className={inputCls} />
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Веб, продукт, текст" className={inputCls} />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="mine" value="1" defaultChecked={sp.mine === "1"} className="h-4 w-4 accent-indigo-600" />
            Только мои
          </label>
          <div className="flex gap-2">
            <button className={btnCls.primary}>Найти</button>
            <Link href="/requests" className={btnCls.secondary}>
              Сброс
            </Link>
          </div>
        </form>
      </Card>
      <Card title={`Найдено: ${list.length}`}>
        {list.length === 0 ? (
          <Empty>Запросов нет</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Создан</Th>
                  <Th>Кто просит</Th>
                  <Th>Что ищем</Th>
                  <Th>Гео</Th>
                  <Th>Мяч</Th>
                  <Th>Адресаты</Th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/requests/${r.id}`} className="font-semibold text-indigo-600 hover:underline">
                        #{r.number}
                      </Link>
                      {r.priority === "urgent" && <span className="ml-1 text-rose-600">●</span>}
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-slate-500">{fmt(r.created_at)}</Td>
                    <Td>
                      {r.direction === "from_advertiser" ? (
                        <span className="font-medium text-slate-900">
                          <span className="mr-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] uppercase text-amber-700">от рекла</span>
                          {r.advertiser_name}
                        </span>
                      ) : (
                        <>
                          <span className="font-medium text-slate-900">{r.manager_name ?? "—"}</span>
                          {r.webmaster_name && <span className="text-slate-500"> → {r.webmaster_name}</span>}
                        </>
                      )}
                    </Td>
                    <Td className="text-xs">
                      {typeLabel(r.type)}
                      {[r.is_inhouse ? "INH" : null, r.source_code, r.approach_code, r.product_text].filter(Boolean).length > 0 && (
                        <span className="text-slate-500"> · {[r.is_inhouse ? "INH" : null, r.source_code, r.approach_code, r.product_text].filter(Boolean).join(" ")}</span>
                      )}
                    </Td>
                    <Td>
                      <GeoChips items={r.items_brief} />
                    </Td>
                    <Td>
                      <BallBadge b={r.ball} />
                    </Td>
                    <Td className="text-xs text-slate-500">{r.assignees_label}</Td>
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
