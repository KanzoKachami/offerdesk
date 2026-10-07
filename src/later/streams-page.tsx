import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  PUSH_TEXT,
  launchAlert,
  loadSettings,
  pushLevel,
  type PushLevel,
} from "@/lib/request-data";
import { LAUNCH_STAGE, hoursLabel } from "@/lib/request-meta";
import {
  deleteStream,
  launchNote,
  launchReplied,
  setLaunchStage,
} from "@/lib/launch-actions";
import {
  advertiserLinkRequestText,
  advertiserStatusText,
  integratorText,
  managerLaunchText,
  managerPushText,
  type LaunchText,
} from "@/lib/request-texts";
import { ActionForm } from "@/components/action-form";
import { PendingButton } from "@/components/pending-button";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { CopyBox } from "@/components/copy-box";
import { StreamForm, type StreamFormRow } from "@/components/stream-form";
import { BulkBar, RowCheck, SelectAll, StageSelect } from "@/components/stream-controls";
import {
  Badge,
  Card,
  Flash,
  PageHeader,
  btnCls,
  inputCls,
} from "@/components/ui";

type S = LaunchText &
  StreamFormRow & {
    id: string;
    stage: string;
    request_id: string | null;
    request_number: number | null;
    advertiser_id: string | null;
    adv_waiting_since: string | null;
    hours_in_stage: number;
    days_since_issued: number;
    created_at: string;
  };

const small = `${btnCls.primary} !px-2.5 !py-1 !text-xs`;
const smallSec = `${btnCls.secondary} !px-2.5 !py-1 !text-xs`;

const PUSH_ROW: Record<PushLevel, string> = {
  0: "",
  1: "",
  2: "bg-amber-50/60",
  3: "bg-orange-50",
  4: "bg-rose-50",
};
const PUSH_BADGE: Record<PushLevel, string> = {
  0: "bg-slate-100 text-slate-600",
  1: "bg-slate-200 text-slate-700",
  2: "bg-amber-100 text-amber-800",
  3: "bg-orange-100 text-orange-800",
  4: "bg-rose-100 text-rose-700",
};

const SECTIONS: {
  key: string;
  title: string;
  hint: string;
  stages: string[];
}[] = [
  {
    key: "link",
    title: "Ждём ссылку",
    hint: "рекл апрувнул, ссылки ещё нет — самые старые сверху",
    stages: ["waiting_link"],
  },
  {
    key: "integrator",
    title: "У интегратора",
    hint: "ссылку получили, интегрируем",
    stages: ["at_integrator", "link_received"],
  },
  {
    key: "issued",
    title: "Ссылка выдана — ждём запуск",
    hint: "дольше всех без запуска — сверху",
    stages: ["integrated"],
  },
  { key: "live", title: "Льёт", hint: "", stages: ["live", "ftd"] },
];
const CLOSED = ["stopped", "no_traffic"];

const money = (s: S) =>
  s.rate != null ? `${s.currency === "EUR" ? "€" : "$"}${Number(s.rate)}` : "";

export default async function StreamsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const sb = await createClient();
  const [
    { data },
    settings,
    { data: offers },
    { data: managers },
    { data: geos },
    { data: sources },
    { data: approaches },
  ] = await Promise.all([
    sb.from("v_launches").select("*").order("created_at", { ascending: true }),
    loadSettings(sb),
    sb.from("offers").select("id, name, advertisers(name)").order("name"),
    sb.from("managers").select("id, name").order("name"),
    sb.from("geos").select("code").order("code"),
    sb.from("sources").select("code").order("code"),
    sb.from("approaches").select("code").order("code"),
  ]);
  const all = (data ?? []) as S[];

  // фильтры
  const q = (sp.q ?? "").trim().toLowerCase();
  const fManager = sp.manager ?? "";
  const fGeo = sp.geo ?? "";
  const rows = all.filter(
    (s) =>
      (!fManager || s.manager_id === fManager) &&
      (!fGeo || s.geo_code === fGeo) &&
      (!q ||
        [
          s.offer_name,
          s.advertiser_name,
          s.adv_stream_id,
          s.sub_id,
          s.webmaster_name,
          s.notes,
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))),
  );

  const offerOpts = (offers ?? []).map((o) => ({
    value: o.id as string,
    label: `${o.name} — ${(o.advertisers as unknown as { name: string } | null)?.name ?? ""}`,
  }));
  const managerOpts = (managers ?? []).map((m) => ({
    value: m.id as string,
    label: m.name as string,
  }));
  const geoCodes = (geos ?? []).map((g) => g.code as string);
  const formProps = {
    offers: offerOpts,
    geos: geoCodes,
    sources: (sources ?? []).map((x) => x.code as string),
    approaches: (approaches ?? []).map((x) => x.code as string),
    managers: managerOpts,
  };
  const editing = sp.edit ? all.find((s) => s.id === sp.edit) : undefined;

  // история открытого потока
  const openId = sp.open ?? "";
  const { data: history } = openId
    ? await sb
        .from("activities")
        .select("kind, text, meta, created_at")
        .eq("launch_id", openId)
        .order("created_at", { ascending: false })
        .limit(15)
    : { data: [] };

  const issuedOverdue = rows.filter(
    (s) =>
      s.stage === "integrated" &&
      pushLevel(Number(s.days_since_issued), settings.push_days) >= 2,
  ).length;
  const advWaiting = rows.filter((s) => s.adv_waiting_since).length;
  const closed = rows.filter((s) => CLOSED.includes(s.stage));

  // компактный статус: выпадающий список + счётчик времени
  const statusCell = (s: S) => {
    let chip: React.ReactNode = null;
    let hint = "";
    if (s.stage === "integrated") {
      const days = Number(s.days_since_issued);
      const lvl = pushLevel(days, settings.push_days);
      hint = PUSH_TEXT[lvl];
      chip = (
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${PUSH_BADGE[lvl]}`} title={hint}>
          {Math.floor(days)} дн
        </span>
      );
    } else if (["waiting_link", "at_integrator", "link_received"].includes(s.stage)) {
      const alert = launchAlert(s.stage, Number(s.hours_in_stage), settings, false);
      hint = alert?.text ?? "";
      chip = (
        <span className={`text-[11px] ${alert ? "font-semibold text-amber-700" : "text-slate-400"}`} title={hint}>
          {hoursLabel(Number(s.hours_in_stage))}
        </span>
      );
    } else if (s.stop_reason && CLOSED.includes(s.stage)) {
      chip = (
        <span className="max-w-28 truncate text-[11px] text-slate-500" title={s.stop_reason}>
          {s.stop_reason}
        </span>
      );
    }
    return (
      <div className="flex items-center gap-1.5">
        <StageSelect key={s.stage} id={s.id} stage={s.stage} />
        {chip}
        {s.adv_waiting_since && (
          <span className="text-[11px] font-semibold text-rose-600" title="рекл ждёт ответа">
            ● рекл ждёт
          </span>
        )}
      </div>
    );
  };

  const detail = (s: S) => {
    const days = Number(s.days_since_issued);
    return (
      <div className="grid gap-4 p-2 lg:grid-cols-3">
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Готовые тексты
          </div>
          {s.stage === "waiting_link" && (
            <div>
              <div className="mb-1 text-xs text-slate-500">
                Реклу: попросить ссылку
              </div>
              <CopyBox text={advertiserLinkRequestText(s)} rows={2} />
            </div>
          )}
          {["at_integrator", "link_received"].includes(s.stage) && (
            <div>
              <div className="mb-1 text-xs text-slate-500">
                Интегратору
                {settings.integrator_name
                  ? ` (${settings.integrator_name})`
                  : ""}
              </div>
              <CopyBox text={integratorText(s)} rows={4} />
            </div>
          )}
          {s.stage === "integrated" && (
            <>
              <div>
                <div className="mb-1 text-xs text-slate-500">
                  Менеджеру: ссылка выдана
                </div>
                <CopyBox text={managerLaunchText(s)} rows={4} />
              </div>
              {days >= 1 && (
                <div>
                  <div className="mb-1 text-xs text-slate-500">
                    Менеджеру: пнуть на запуск
                  </div>
                  <CopyBox text={managerPushText(s, days)} rows={3} />
                </div>
              )}
            </>
          )}
          <div>
            <div className="mb-1 text-xs text-slate-500">
              Реклу: статус{s.adv_waiting_since ? " (ждёт ответа!)" : ""}
            </div>
            <CopyBox text={advertiserStatusText(s, s.stage)} rows={2} />
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Действия
          </div>
          {s.adv_waiting_since && (
            <ActionForm action={launchReplied}>
              <input type="hidden" name="launch_id" value={s.id} />
              <PendingButton className={small}>Ответил реклу</PendingButton>
            </ActionForm>
          )}
          {!CLOSED.includes(s.stage) && (
            <ActionForm action={setLaunchStage} className="flex gap-1">
              <input type="hidden" name="launch_id" value={s.id} />
              <input type="hidden" name="stage" value="stopped" />
              <input
                name="stop_reason"
                placeholder="причина стопа (бюджет, качество…)"
                className={`${inputCls} !px-2 !py-1 !text-xs`}
              />
              <PendingButton className={smallSec}>Стоп</PendingButton>
            </ActionForm>
          )}
          <ActionForm action={launchNote} className="flex gap-1">
            <input type="hidden" name="launch_id" value={s.id} />
            <input
              name="text"
              required
              placeholder="пнул менеджера / заметка в историю"
              className={`${inputCls} !px-2 !py-1 !text-xs`}
            />
            <PendingButton className={smallSec}>+</PendingButton>
          </ActionForm>
          <div className="flex flex-wrap gap-2">
            <Link href={`/streams?edit=${s.id}`} className={smallSec}>
              Редактировать
            </Link>
            {s.request_id && (
              <Link href={`/requests/${s.request_id}`} className={smallSec}>
                Запрос #{s.request_number}
              </Link>
            )}
            <form action={deleteStream}>
              <input type="hidden" name="id" value={s.id} />
              <ConfirmSubmit
                message="Удалить поток?"
                className={`${btnCls.danger}`}
              >
                Удалить
              </ConfirmSubmit>
            </form>
          </div>
          {s.notes && (
            <div className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
              {s.notes}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            История
          </div>
          {(history ?? []).length === 0 ? (
            <div className="text-xs text-slate-400">пока пусто</div>
          ) : (
            <ul className="space-y-1 text-xs">
              {(history ?? []).map((h, i) => {
                const meta = h.meta as { from?: string; to?: string } | null;
                return (
                  <li key={i} className="text-slate-600">
                    <span className="text-slate-400">
                      {new Date(h.created_at as string).toLocaleString(
                        "ru-RU",
                        {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </span>{" "}
                    {h.kind === "launch_stage" && meta?.to
                      ? `→ ${LAUNCH_STAGE[meta.to]?.label ?? meta.to}`
                      : (h.text as string)}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    );
  };

  const COLS = 14;
  const td = "px-2 py-1 whitespace-nowrap";
  const table = (list: S[], group: string) => (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <th className="w-6 px-2 py-1.5">
              <SelectAll group={group} />
            </th>
            <th className="px-2 py-1.5">Ориг. ID</th>
            <th className="px-2 py-1.5">Подмена</th>
            <th className="px-2 py-1.5">Продукт</th>
            <th className="px-2 py-1.5">Гео</th>
            <th className="px-2 py-1.5">Сорс · подход</th>
            <th className="px-2 py-1.5">Ставка</th>
            <th className="px-2 py-1.5">Кап</th>
            <th className="px-2 py-1.5">КПИ</th>
            <th className="px-2 py-1.5">Менеджер</th>
            <th className="px-2 py-1.5">Веб</th>
            <th className="px-2 py-1.5">Статус</th>
            <th className="px-2 py-1.5">Заметки</th>
            <th className="px-2 py-1.5"></th>
          </tr>
        </thead>
        <tbody>
          {list.map((s) => {
            const lvl = s.stage === "integrated" ? pushLevel(Number(s.days_since_issued), settings.push_days) : 0;
            const open = openId === s.id;
            const rowBg = s.adv_waiting_since ? "bg-rose-50" : s.stage === "stopped" ? "bg-rose-50/60" : PUSH_ROW[lvl];
            const href = open ? "/streams" : `/streams?open=${s.id}#s-${s.id}`;
            return [
              <tr key={s.id} id={`s-${s.id}`} className={`border-b border-slate-100 align-middle hover:bg-slate-50 ${rowBg} ${open ? "!bg-indigo-50/60" : ""}`}>
                <td className="px-2 py-1">
                  <RowCheck id={s.id} group={group} />
                </td>
                <td className={`${td} font-mono`}>{s.adv_stream_id ?? "—"}</td>
                <td className={`${td} font-mono text-amber-700`}>{s.sub_id ?? ""}</td>
                <td className={td}>
                  <Link href={href} scroll={false} className="font-semibold text-slate-900 hover:text-indigo-700 hover:underline" title={`${s.advertiser_name ?? ""} — тексты, стоп, история`}>
                    {s.offer_name ?? "без продукта"}
                  </Link>
                  <span className="ml-1 text-[10px] text-slate-400">{s.advertiser_name}</span>
                </td>
                <td className={`${td} font-mono font-semibold`}>{s.geo_code}</td>
                <td className={td}>{[s.source_code, s.approach_code].filter(Boolean).join(" · ")}</td>
                <td className={td}>{money(s)}</td>
                <td className={td}>{s.cap ?? ""}</td>
                <td className={td}>{s.kpi == null ? "" : s.kpi ? "есть" : "нет"}</td>
                <td className={td}>{s.manager_name ?? ""}</td>
                <td className={`${td} max-w-40 truncate`} title={s.webmaster_name ?? ""}>
                  {s.webmaster_name ?? ""}
                </td>
                <td className={td}>{statusCell(s)}</td>
                <td className={`${td} max-w-56 truncate text-slate-500`} title={s.notes ?? ""}>
                  {s.notes}
                </td>
                <td className="px-1 py-1 text-right">
                  <Link href={href} scroll={false} className="rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Тексты, стоп, история, редактирование">
                    {open ? "▴" : "▾"}
                  </Link>
                </td>
              </tr>,
              open ? (
                <tr key={`${s.id}-d`} className="border-b border-indigo-100 bg-indigo-50/30">
                  <td colSpan={COLS}>{detail(s)}</td>
                </tr>
              ) : null,
            ];
          })}
        </tbody>
      </table>
    </div>
  );

  const sortSection = (key: string, list: S[]) => {
    const w = (s: S) => (s.adv_waiting_since ? 1 : 0);
    if (key === "issued")
      return [...list].sort(
        (a, b) =>
          w(b) - w(a) ||
          Number(b.days_since_issued) - Number(a.days_since_issued),
      );
    if (key === "live")
      return [...list].sort(
        (a, b) =>
          w(b) - w(a) ||
          String(a.offer_name).localeCompare(String(b.offer_name)) ||
          String(a.geo_code).localeCompare(String(b.geo_code)) ||
          String(a.adv_stream_id ?? "").localeCompare(
            String(b.adv_stream_id ?? ""),
          ),
      );
    return [...list].sort(
      (a, b) =>
        w(b) - w(a) || Number(b.hours_in_stage) - Number(a.hours_in_stage),
    );
  };

  return (
    <>
      <PageHeader
        title="Потоки"
        subtitle={[
          `Всего: ${rows.length}`,
          issuedOverdue ? `ссылка выдана, а запуска нет: ${issuedOverdue}` : "",
          advWaiting ? `рекл ждёт ответа: ${advWaiting}` : "",
          settings.integrator_name
            ? `интегратор: ${settings.integrator_name}${settings.integrator_tg ? ` (@${settings.integrator_tg})` : ""}`
            : "",
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <Link href="/streams/import" className={btnCls.secondary}>
              Загрузить из таблицы
            </Link>
            <Link href="/streams?new=1" className={btnCls.primary}>
              + Поток
            </Link>
          </>
        }
      />
      <Flash sp={sp} />

      {(sp.new === "1" || editing) && (
        <Card
          title={
            editing
              ? `Поток ${editing.offer_name} (${editing.geo_code})`
              : "Новый поток"
          }
          className="mb-6"
        >
          <StreamForm key={editing?.id ?? "new"} row={editing} {...formProps} />
        </Card>
      )}

      <form className="mb-5 flex flex-wrap items-end gap-2" action="/streams">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Продукт, ID, веб, заметка…"
          className={`${inputCls} !w-64`}
        />
        <select
          name="manager"
          defaultValue={fManager}
          className={`${inputCls} !w-44`}
        >
          <option value="">Все менеджеры</option>
          {managerOpts.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <select name="geo" defaultValue={fGeo} className={`${inputCls} !w-28`}>
          <option value="">Все гео</option>
          {[...new Set(all.map((s) => s.geo_code).filter(Boolean))]
            .sort()
            .map((g) => (
              <option key={g} value={g!}>
                {g}
              </option>
            ))}
        </select>
        <button className={btnCls.secondary}>Показать</button>
        {(q || fManager || fGeo) && (
          <Link href="/streams" className={btnCls.ghost}>
            Сбросить
          </Link>
        )}
      </form>

      <BulkBar />
      <div className="space-y-4">
        {SECTIONS.map((sec) => {
          const list = sortSection(
            sec.key,
            rows.filter((s) => sec.stages.includes(s.stage)),
          );
          return list.length === 0 ? (
            <div
              key={sec.key}
              className="rounded-xl border border-dashed border-slate-200 px-5 py-3 text-sm text-slate-400"
            >
              {sec.title} · 0
            </div>
          ) : (
            <Card key={sec.key} title={`${sec.title} · ${list.length}`} className="!p-4">
              {sec.hint && (
                <p className="-mt-3 mb-3 text-xs text-slate-400">{sec.hint}</p>
              )}
              {sec.key === "issued" && (
                <p className="-mt-2 mb-3 text-xs text-slate-500">
                  Пороги: {settings.push_days.map((d) => `${d} дн`).join(" → ")}{" "}
                  (меняются в Настройках)
                </p>
              )}
              {table(list, sec.key)}
            </Card>
          );
        })}

        <details
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          open={closed.some((s) => s.id === openId)}
        >
          <summary className="cursor-pointer text-base font-semibold text-slate-900">
            Стоп и не запустились · {closed.length}
          </summary>
          <div className="mt-4">
            {closed.length === 0 ? (
              <p className="text-sm text-slate-400">пусто</p>
            ) : (
              table(sortSection("closed", closed), "closed")
            )}
          </div>
        </details>
      </div>
    </>
  );
}
