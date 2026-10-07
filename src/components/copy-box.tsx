"use client";

import { useState } from "react";

/** Готовый текст с кнопкой «Скопировать». */
export function CopyBox({ text, rows = 5 }: { text: string; rows?: number }) {
  const [done, setDone] = useState(false);
  return (
    <div className="space-y-2">
      <textarea readOnly value={text} rows={rows} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800" />
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }}
        className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        {done ? "Скопировано ✓" : "Скопировать"}
      </button>
    </div>
  );
}
