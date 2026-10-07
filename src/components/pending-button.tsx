"use client";

import type { ReactNode } from "react";
import { usePending } from "@/components/pending-context";

/** Кнопка формы, которая сразу показывает, что нажатие принято. */
export function PendingButton({ children, className, name, value }: { children: ReactNode; className?: string; name?: string; value?: string }) {
  const pending = usePending();
  return (
    <button type="submit" name={name} value={value} disabled={pending} aria-busy={pending} className={`${className ?? ""} relative disabled:cursor-wait disabled:opacity-60`}>
      {pending && <span className="mr-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent align-[-1px]" />}
      {children}
    </button>
  );
}
