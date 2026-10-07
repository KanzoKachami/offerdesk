"use client";

import { useEffect, useState, useTransition } from "react";
import { bulkSetStage, setLaunchStage } from "@/lib/launch-actions";
import { LAUNCH_STAGE, STREAM_STAGES } from "@/lib/request-meta";

const TONE: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700 border-slate-200",
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  rose: "bg-rose-50 text-rose-700 border-rose-200",
};

const norm = (s: string) => (s === "link_received" ? "at_integrator" : s === "ftd" ? "live" : s);

/** Статус потока прямо в строке: выбрал — сохранилось. */
export function StageSelect({ id, stage }: { id: string; stage: string }) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState(norm(stage));
  const tone = LAUNCH_STAGE[value]?.tone ?? "slate";
  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        setValue(next);
        const fd = new FormData();
        fd.set("launch_id", id);
        fd.set("stage", next);
        start(() => setLaunchStage(fd));
      }}
      className={`cursor-pointer rounded-md border px-1.5 py-0.5 text-xs font-medium ${TONE[tone]} ${pending ? "animate-pulse opacity-60" : ""}`}
    >
      {STREAM_STAGES.map((s) => (
        <option key={s} value={s}>
          {LAUNCH_STAGE[s].label}
        </option>
      ))}
    </select>
  );
}

/** Галочка «выбрать все» в шапке таблицы раздела. */
export function SelectAll({ group }: { group: string }) {
  return (
    <input
      type="checkbox"
      data-all
      title="Выбрать все в разделе"
      className="h-3.5 w-3.5 accent-indigo-600"
      onChange={(e) => {
        document.querySelectorAll<HTMLInputElement>(`input[data-group="${group}"]`).forEach((cb) => {
          cb.checked = e.target.checked;
        });
        document.dispatchEvent(new Event("stream-selection"));
      }}
    />
  );
}

/** Галочка строки. */
export function RowCheck({ id, group }: { id: string; group: string }) {
  return (
    <input
      type="checkbox"
      data-group={group}
      data-stream={id}
      className="h-3.5 w-3.5 accent-indigo-600"
      onChange={() => document.dispatchEvent(new Event("stream-selection"))}
    />
  );
}

/** Панель массовой смены статуса: появляется, когда отмечены строки. */
export function BulkBar() {
  const [count, setCount] = useState(0);
  const [stage, setStage] = useState("integrated");
  const [pending, start] = useTransition();
  const checked = () => [...document.querySelectorAll<HTMLInputElement>("input[data-stream]:checked")];

  useEffect(() => {
    const h = () => setCount(checked().length);
    document.addEventListener("stream-selection", h);
    return () => document.removeEventListener("stream-selection", h);
  }, []);

  function apply() {
    const ids = checked().map((cb) => cb.dataset.stream!);
    if (!ids.length) return;
    const fd = new FormData();
    ids.forEach((i) => fd.append("ids", i));
    fd.set("stage", stage);
    start(async () => {
      await bulkSetStage(fd);
      document.querySelectorAll<HTMLInputElement>("input[data-stream], input[data-all]").forEach((cb) => (cb.checked = false));
      setCount(0);
    });
  }

  if (!count) return null;
  return (
    <div className="sticky top-2 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm shadow-sm">
      <span className="font-semibold text-indigo-900">Выбрано: {count}</span>
      <span className="text-indigo-800">→ поставить статус</span>
      <select value={stage} onChange={(e) => setStage(e.target.value)} className="rounded-md border border-indigo-300 bg-white px-2 py-1 text-sm">
        {STREAM_STAGES.map((s) => (
          <option key={s} value={s}>
            {LAUNCH_STAGE[s].label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={apply}
        disabled={pending}
        className="rounded-md bg-indigo-600 px-3 py-1 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {pending ? "Сохраняю…" : "Применить"}
      </button>
      <button
        type="button"
        onClick={() => {
          document.querySelectorAll<HTMLInputElement>("input[data-stream], input[data-all]").forEach((cb) => (cb.checked = false));
          setCount(0);
        }}
        className="text-xs text-indigo-700 hover:underline"
      >
        снять выделение
      </button>
    </div>
  );
}
