import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadAdvertiserOptions } from "@/lib/options";
import { newSheetToken } from "@/lib/sheet-actions";
import { StreamImport, type SheetInbox } from "@/components/stream-import";
import { ActionForm } from "@/components/action-form";
import { PendingButton } from "@/components/pending-button";
import { CopyBox } from "@/components/copy-box";
import { Card, Flash, PageHeader, btnCls } from "@/components/ui";

export default async function StreamImportPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const sb = await createClient();
  const [advertisers, { data: geos }, { data: offers }, { data: inbox }, { data: settings }] = await Promise.all([
    loadAdvertiserOptions(sb),
    sb.from("geos").select("code"),
    sb.from("offers").select("name"),
    // последняя синхронизация из Chrome (если таблица sheet_inbox ещё не создана — просто ничего не покажем)
    sb.from("sheet_inbox").select("id, created_at, tabs, rows, body").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("settings").select("sheet_token").maybeSingle(),
  ]);
  const token = (settings as { sheet_token?: string | null } | null)?.sheet_token ?? null;
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
      <Flash sp={sp} />
      <Card className="mb-6">
        <StreamImport
          advertisers={advertisers}
          geoCodes={(geos ?? []).map((g) => g.code as string)}
          offerNames={(offers ?? []).map((o) => o.name as string)}
          inbox={(inbox as SheetInbox | null) ?? null}
        />
      </Card>

      <details className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">Синхронизация через Chrome — токен</summary>
        <div className="mt-3 space-y-3 text-sm text-slate-600">
          <p>
            Скажи Claude «синхронизируй потоки»: он прочитает вкладки таблицы в Chrome и положит их сюда — сверху появится кнопка «Подставить». Таблица при этом только читается.
          </p>
          {token ? <CopyBox text={token} rows={1} /> : <p className="text-slate-400">Токена ещё нет.</p>}
          <ActionForm action={newSheetToken}>
            <PendingButton className={btnCls.secondary}>{token ? "Создать новый токен" : "Создать токен"}</PendingButton>
          </ActionForm>
          <p className="text-xs text-slate-400">По токену можно только положить строки во входящие. Новый токен отменяет старый.</p>
        </div>
      </details>
    </>
  );
}
