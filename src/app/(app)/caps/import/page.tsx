import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadAdvertiserOptions } from "@/lib/options";
import { StreamImport } from "@/components/stream-import";
import { Card, PageHeader, btnCls } from "@/components/ui";

export default async function CapsImportPage() {
  const sb = await createClient();
  const [advertisers, { data: geos }, { data: offers }] = await Promise.all([loadAdvertiserOptions(sb), sb.from("geos").select("code"), sb.from("offers").select("name")]);
  return (
    <>
      <PageHeader
        title="Загрузить свободные капы списком"
        subtitle="Колонки — как в таблице потоков: ID у рекла, Продукт, Название потока (веб, который отказался), Гео, Кап, Подход, Источник, Ставка, Менеджер, комментарии"
        actions={
          <Link href="/caps" className={btnCls.secondary}>
            ← К капам
          </Link>
        }
      />
      <Card>
        <StreamImport mode="caps" advertisers={advertisers} geoCodes={(geos ?? []).map((g) => g.code as string)} offerNames={(offers ?? []).map((o) => o.name as string)} />
      </Card>
    </>
  );
}
