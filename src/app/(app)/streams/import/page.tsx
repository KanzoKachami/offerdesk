import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadAdvertiserOptions } from "@/lib/options";
import { StreamImport } from "@/components/stream-import";
import { Card, PageHeader, btnCls } from "@/components/ui";

export default async function StreamImportPage() {
  const sb = await createClient();
  const [advertisers, { data: geos }, { data: offers }] = await Promise.all([loadAdvertiserOptions(sb), sb.from("geos").select("code"), sb.from("offers").select("name")]);
  return (
    <>
      <PageHeader
        title="Загрузить потоки из таблицы"
        subtitle="Грузи хоть каждый день целиком: новые строки добавятся, изменившиеся обновятся, остальные останутся как есть"
        actions={
          <Link href="/streams" className={btnCls.secondary}>
            ← К потокам
          </Link>
        }
      />
      <Card>
        <StreamImport advertisers={advertisers} geoCodes={(geos ?? []).map((g) => g.code as string)} offerNames={(offers ?? []).map((o) => o.name as string)} />
      </Card>
    </>
  );
}
