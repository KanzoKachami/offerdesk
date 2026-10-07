"use client";

import { useEffect, useState } from "react";

/** Сообщение «Добавлено» / ошибка. После показа убирает ?ok= / ?error= из адреса,
 *  чтобы старое сообщение не висело после следующих действий. */
export function FlashClient({ ok, error }: { ok?: string; error?: string }) {
  const [msg] = useState({ ok, error });
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("ok") || url.searchParams.has("error") || url.searchParams.has("t")) {
      ["ok", "error", "t"].forEach((k) => url.searchParams.delete(k));
      window.history.replaceState(window.history.state, "", url.pathname + (url.search ? url.search : "") + url.hash);
    }
    if (msg.ok) {
      const t = setTimeout(() => setVisible(false), 4000);
      return () => clearTimeout(t);
    }
  }, [msg.ok]);

  if (!visible || (!msg.ok && !msg.error)) return null;
  if (msg.error)
    return (
      <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
        <span>{msg.error}</span>
        <button type="button" onClick={() => setVisible(false)} className="text-rose-400 hover:text-rose-700">
          ×
        </button>
      </div>
    );
  return <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{msg.ok}</div>;
}
