-- 010_streams_sync.sql — «Потоки» из таблицы: то, что уже было в базе, но не было в репозитории,
-- плюс капа на ID за месяц. Данные не удаляет, можно запускать повторно.
--
-- 1. Поля потоков, которые уже есть в рабочей базе (отлито, дата выдачи, подмена в свободные капы и т. д.).
--    В рабочей базе они уже созданы — здесь «if not exists», чтобы новая база собиралась так же.
-- 2. cap_month — «КАП <МЕСЯЦ> НА ID»: сколько FTD рекл дал на свой ID в этом месяце.

begin;

-- ---------------------------------------------------------------------
-- 1. Поля потоков (как в рабочей базе)
-- ---------------------------------------------------------------------
alter table launches
  add column if not exists changed_at     timestamptz default now(),   -- последнее изменение строки из таблицы
  add column if not exists seen_at        timestamptz,                 -- когда строка последний раз была в загрузке
  add column if not exists ftd            integer,                     -- «Отлито»: депы за текущий месяц
  add column if not exists ftd_changed_at timestamptz,                 -- когда «отлито» последний раз выросло
  add column if not exists issued_on      date,                        -- дата выдачи потока из таблицы
  add column if not exists free_cap_id    uuid references free_caps(id) on delete set null;  -- ушёл в «Свободные капы»

alter table free_caps add column if not exists launch_id uuid references launches(id) on delete set null;

create or replace function on_launch_change() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.ftd, 0) > 0 and new.ftd_changed_at is null then new.ftd_changed_at := now(); end if;
    return new;
  end if;
  if coalesce(new.ftd, 0) > coalesce(old.ftd, 0) then new.ftd_changed_at := now(); end if;
  if (new.stage, new.cap, new.rate, new.currency, new.kpi, new.manager_id, new.webmaster, new.notes,
      new.source_code, new.approach_code, new.sub_id, new.adv_stream_id, new.offer_id, new.geo_code, new.ftd, new.issued_on)
     is distinct from
     (old.stage, old.cap, old.rate, old.currency, old.kpi, old.manager_id, old.webmaster, old.notes,
      old.source_code, old.approach_code, old.sub_id, old.adv_stream_id, old.offer_id, old.geo_code, old.ftd, old.issued_on) then
    new.changed_at := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_launch_change on launches;
create trigger trg_launch_change before insert or update on launches for each row execute function on_launch_change();

-- ---------------------------------------------------------------------
-- 2. Капа на ID за месяц
-- ---------------------------------------------------------------------
alter table launches add column if not exists cap_month integer;

-- Представление потоков (как в рабочей базе + cap_month)
drop view if exists v_launches;
create view v_launches with (security_invoker = true) as
select l.*,
  r.number as request_number,
  coalesce(o.name, r.product_text) as offer_name,
  a.id as advertiser_id, a.name as advertiser_name, a.lang as advertiser_lang,
  m.name as manager_name,
  coalesce(nullif(l.webmaster, ''), w.name) as webmaster_name,
  extract(epoch from now() - l.stage_changed_at) / 3600 as hours_in_stage,
  extract(epoch from now() - coalesce(l.issued_at, l.stage_changed_at)) / 86400 as days_since_issued,
  floor(extract(epoch from now() - l.changed_at) / 86400)::int as days_unchanged,
  l.created_at > now() - interval '24 hours' as is_new,
  current_date - coalesce(l.issued_on, l.created_at::date) as days_issued,
  case when l.ftd_changed_at is not null then floor(extract(epoch from now() - l.ftd_changed_at) / 86400)::int
       else current_date - coalesce(l.issued_on, l.created_at::date) end as days_no_ftd
from launches l
left join requests    r on r.id = l.request_id
left join offers      o on o.id = l.offer_id
left join advertisers a on a.id = coalesce(o.advertiser_id, l.advertiser_ref)
left join managers    m on m.id = l.manager_id
left join webmasters  w on w.id = l.webmaster_id;
grant select on v_launches to authenticated;

commit;

notify pgrst, 'reload schema';
