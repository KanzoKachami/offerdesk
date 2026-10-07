import { ExternalLink } from "lucide-react";
import { SimpleEntityPage } from "@/components/simple-entity";

/** Короткий вид ссылки: docs.google.com → «Google Таблицы». */
function host(url: string) {
  try {
    const u = new URL(url);
    if (u.hostname === "docs.google.com" && u.pathname.includes("/spreadsheets/")) return "Google Таблицы";
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const href = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

export default async function SheetsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  return (
    <SimpleEntityPage
      table="sheets"
      title="Таблицы"
      subtitle="Ссылки на рабочие таблицы — открываются в новой вкладке"
      path="/sheets"
      sp={await searchParams}
      columns={[
        {
          label: "Таблица",
          render: (r) => (
            <a href={href(String(r.url))} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-indigo-700 hover:underline">
              {String(r.name)}
              <ExternalLink size={13} />
            </a>
          ),
        },
        { label: "Где", render: (r) => <span className="text-xs text-slate-500">{host(String(r.url))}</span> },
        { label: "Заметка", render: (r) => (r.notes as string) ?? "", className: "max-w-md truncate text-slate-600" },
      ]}
    />
  );
}
