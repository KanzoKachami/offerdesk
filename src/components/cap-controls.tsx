"use client";

import { useState, useTransition } from "react";
import { setCapStatus } from "@/lib/caps-actions";
import { CAP_STATUS } from "@/lib/request-meta";

const TONE: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700 border-slate-200",
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  rose: "bg-rose-50 text-rose-700 border-rose-200",
};

/** Статус капы прямо в строке. */
export function CapStatusSelect({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState(status);
  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        setValue(next);
        const fd = new FormData();
        fd.set("id", id);
        fd.set("status", next);
        start(() => setCapStatus(fd));
      }}
      className={`cursor-pointer rounded-md border px-1.5 py-0.5 text-xs font-medium ${TONE[CAP_STATUS[value]?.tone ?? "slate"]} ${pending ? "animate-pulse opacity-60" : ""}`}
    >
      {Object.entries(CAP_STATUS).map(([k, v]) => (
        <option key={k} value={k}>
          {v.label}
        </option>
      ))}
    </select>
  );
}
