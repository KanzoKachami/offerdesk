"use client";

import type { ReactNode } from "react";
import { usePending } from "@/components/pending-context";

/** Кнопка отправки формы с подтверждением и индикатором ожидания. */
export function ConfirmSubmit({ children, message, className }: { children: ReactNode; message: string; className?: string }) {
  const pending = usePending();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${className ?? ""} disabled:cursor-wait disabled:opacity-60`}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {pending && <span className="mr-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent align-[-1px]" />}
      {children}
    </button>
  );
}
