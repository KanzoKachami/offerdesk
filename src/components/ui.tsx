import Link from "next/link";
import clsx from "clsx";
import type { ReactNode } from "react";
import { FlashClient } from "@/components/flash-client";

export const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 read-only:bg-slate-50 read-only:text-slate-500";

export const btnCls = {
  primary:
    "inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50",
  secondary:
    "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50",
  ghost:
    "inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800",
  danger:
    "inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50",
};

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, className, actions }: { title?: string; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={clsx("rounded-xl border border-slate-200 bg-white p-5 shadow-sm", className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold text-slate-900">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Flash({ sp }: { sp: { ok?: string; error?: string; t?: string } }) {
  if (!sp.ok && !sp.error) return null;
  // key по t: каждое новое сообщение показывается заново
  return <FlashClient key={sp.t ?? sp.error ?? sp.ok} ok={sp.ok} error={sp.error} />;
}

const badgeTones = {
  slate: "bg-slate-100 text-slate-700",
  indigo: "bg-indigo-50 text-indigo-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  rose: "bg-rose-50 text-rose-700",
};

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: keyof typeof badgeTones }) {
  return <span className={clsx("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", badgeTones[tone])}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-400">{children}</p>;
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={clsx("border-b border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500", className)}>{children}</th>;
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={clsx("border-b border-slate-100 px-3 py-2 text-sm text-slate-700", className)}>{children}</td>;
}

export function EditLink({ href }: { href: string }) {
  return (
    <Link href={href} className={btnCls.ghost} scroll={false}>
      Изменить
    </Link>
  );
}
