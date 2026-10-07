-- 003_streams.sql — «Запуски» становятся «Потоками».
-- Запускать после 002_launches.sql. Данные не удаляет, можно запускать повторно.
--
-- Поток = строка как в гугл-таблице: оригинальный ID у рекла, ID подмены (если веб заменён),
-- продукт, гео, сорс, подход, ставка, кап, КПИ, менеджер, веб, статус, заметки.
-- Статусы: ждём ссылку → у интегратора → ссылка выдана (ждём запуск) → льёт / стоп / не запустился.

begin;

-- 1. Новые поля потока
alter table launches
  add column if not exists adv_stream_id text,          -- оригинальный ID потока у рекла
  add column if not exists sub_id        text,          -- ID подмены; пусто — льёт оригинал
  add column if not exists source_code   text,
  add column if not exists approach_code text,
  add column if not exists rate          numeric(10,2),
  add column if not exists currency      text not null default 'USD',
  add column if not exists cap           integer,
  add column if not exists kpi           boolean,       -- КПИ: есть / нет / не указано
  add column if not exists webmaster     text,          -- веб текстом (почта, ник)
  add column if not exists issued_at     timestamptz;   -- когда ссылку выдали менеджеру

-- 2. Старые этапы сводим к новым
update launches set stage = 'at_integrator' where stage = 'link_received';
update launches set stage = 'live'          where stage = 'ftd';
update launches set issued_at = stage_changed_at where issued_at is null and stage in ('integrated','live','no_traffic');

-- Условия, согласованные с реклом, переносим в заметки (поле «условия» больше не показываем)
update launches set notes = concat_ws(E'\n', conditions, notes), conditions = null
 where conditions is not null and conditions <> '';

-- 3. Триггер смены статуса: история + дата выдачи ссылки
create or replace function on_launch_stage() returns trigger language plpgsql as $$
begin
  if new.stage is distinct from old.stage then
    new.stage_changed_at := now();
    new.adv_waiting_since := null;
    if new.stage = 'integrated' then new.issued_at := now(); end if;
    insert into activities (owner_id, request_id, launch_id, kind, meta)
    values (new.owner_id, new.request_id, new.id, 'launch_stage', jsonb_build_object('from', old.stage, 'to', new.stage));
  end if;
  return new;
end $$;

-- 4. Рекл одобрил → поток появляется сам, сразу с сорсом, подходом, ставкой и капой
create or replace function create_launch_on_approve() returns trigger language plpgsql as $$
begin
  if new.status = 'answered' and new.outcome in ('approved', 'partial')
     and (old.status is distinct from 'answered' or old.outcome is distinct from new.outcome) then
    insert into launches (owner_id, item_offer_id, request_id, offer_id, geo_code, manager_id, webmaster_id,
                          source_code, approach_code, rate, currency, cap, notes)
    select new.owner_id, new.id, r.id, new.offer_id, i.geo_code, r.manager_id, r.webmaster_id,
           r.source_code, r.approach_code, coalesce(new.offered_rate, i.rate_max, i.rate_min), i.currency, new.offered_cap,
           nullif(new.conditions, '')
    from request_items i join requests r on r.id = i.request_id
    where i.id = new.item_id
    on conflict (item_offer_id) do nothing;
  end if;
  return null;
end $$;

-- Дозаполняем уже созданные из запросов потоки
update launches l set
  source_code   = coalesce(l.source_code, r.source_code),
  approach_code = coalesce(l.approach_code, r.approach_code),
  rate          = coalesce(l.rate, io.offered_rate, i.rate_max, i.rate_min),
  currency      = coalesce(i.currency, l.currency),
  cap           = coalesce(l.cap, io.offered_cap)
from item_offers io
join request_items i on i.id = io.item_id
join requests r on r.id = i.request_id
where io.id = l.item_offer_id;

-- 5. Пороги «ссылка выдана, а запуска нет» в днях
alter table settings add column if not exists push_days int[] not null default '{1,3,5,7}';

-- 6. Представление потоков
drop view if exists v_launches;
create view v_launches with (security_invoker = true) as
select l.*,
  r.number as request_number,
  o.name as offer_name,
  a.id as advertiser_id, a.name as advertiser_name, a.lang as advertiser_lang,
  m.name as manager_name,
  coalesce(nullif(l.webmaster, ''), w.name) as webmaster_name,
  extract(epoch from now() - l.stage_changed_at) / 3600 as hours_in_stage,
  extract(epoch from now() - coalesce(l.issued_at, l.stage_changed_at)) / 86400 as days_since_issued
from launches l
left join requests    r on r.id = l.request_id
left join offers      o on o.id = l.offer_id
left join advertisers a on a.id = o.advertiser_id
left join managers    m on m.id = l.manager_id
left join webmasters  w on w.id = l.webmaster_id;

create index if not exists launches_ids on launches (adv_stream_id, sub_id);

grant select on v_launches to authenticated;

commit;

notify pgrst, 'reload schema';
