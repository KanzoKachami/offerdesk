"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Inbox, FileText, Package, Building2, Users, UserCheck, Globe2, Settings, Rocket } from "lucide-react";

const ITEMS: { href: string; label: string; icon: typeof Inbox; soon?: boolean }[] = [
  { href: "/", label: "Очередь", icon: Inbox },
  { href: "/requests", label: "Запросы", icon: FileText },
  { href: "/streams", label: "Потоки", icon: Rocket, soon: true },
  { href: "/offers", label: "Офферы", icon: Package },
  { href: "/advertisers", label: "Рекламодатели", icon: Building2 },
  { href: "/managers", label: "Менеджеры", icon: Users },
  { href: "/assignees", label: "Адресаты", icon: UserCheck },
  { href: "/webmasters", label: "Вебмастера", icon: Globe2 },
  { href: "/settings", label: "Настройки", icon: Settings },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="space-y-0.5">
      {ITEMS.map(({ href, label, icon: Icon, soon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={clsx(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium",
              active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            <Icon size={17} strokeWidth={2} />
            <span className="flex-1">{label}</span>
            {soon && <span className="text-[10px] font-semibold uppercase text-slate-400">скоро</span>}
          </Link>
        );
      })}
    </nav>
  );
}
