import { Rocket } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";

// Раздел на паузе. Готовая страница лежит в src/later/streams-page.tsx
export default function StreamsPage() {
  return (
    <>
      <PageHeader title="Потоки" subtitle="Скоро" />
      <Card>
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <Rocket size={36} className="text-slate-300" />
          <div className="text-lg font-semibold text-slate-800">Раздел в разработке</div>
          <p className="max-w-md text-sm text-slate-500">
            Здесь будут потоки: запуски после одобрения рекла, ссылки, интегратор и контроль запусков. Пока ни к чему не привязано.
          </p>
        </div>
      </Card>
    </>
  );
}
