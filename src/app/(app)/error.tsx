"use client";

import { useEffect } from "react";

/** Вместо пустого экрана — понятная ошибка и кнопка «Повторить». */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-xl rounded-xl border border-rose-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-bold text-slate-900">Страница не загрузилась</h1>
      <p className="mt-2 text-sm text-slate-600">Пришли этот текст — по нему сразу видно, что сломалось:</p>
      <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-mono text-xs text-rose-700">
        {error.message || "Неизвестная ошибка"}
        {error.digest ? `\nкод: ${error.digest}` : ""}
      </pre>
      <button onClick={reset} className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
        Повторить
      </button>
    </div>
  );
}
