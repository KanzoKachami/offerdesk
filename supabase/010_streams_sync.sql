-- 010_streams_sync.sql — «Потоки» из таблицы: то, что уже было в базе, но не было в репозитории,
-- плюс капа на ID за месяц и синхронизация через Chrome. Данные не удаляет, можно запускать повторно.
--
-- 1. Поля потоков, которые уже есть в рабочей базе (отлито, дата выдачи, подмена в свободные капы и т. д.).
--    В рабочей базе они уже созданы — здесь «if not exists», чтобы новая база собиралась так же.
-- 2. cap_month — «КАП <МЕСЯЦ> НА ID»: сколько FTD рекл дал на свой ID в этом месяце.
-- 3. Входящие синхронизации: Claude читает вкладки таблицы в Chrome и кладёт их сюда по токену,
--    на странице «Загрузить из таблицы» они подставляются кнопкой и грузятся как обычно.

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

-- ---------------------------------------------------------------------
-- 3. Синхронизация через Chrome
-- ---------------------------------------------------------------------
alter table settings add column if not exists sheet_token text unique;
update settings set sheet_token = replace(gen_random_uuid()::text, '-', '') where sheet_token is null;

create table if not exists sheet_inbox (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  tabs       text[] not null default '{}',   -- какие вкладки прочитаны
  rows       int not null default 0,
  body       text not null,                  -- строки в формате таблицы (табы), вместе со шапкой
  used_at    timestamptz                     -- когда подставили на странице загрузки
);
create index if not exists sheet_inbox_owner on sheet_inbox (owner_id, created_at desc);
alter table sheet_inbox enable row level security;
drop policy if exists own_rows on sheet_inbox;
create policy own_rows on sheet_inbox for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
grant all on sheet_inbox to authenticated;

-- Вызывается из вкладки гугл-таблицы, без входа в Offerdesk — только с токеном.
create or replace function sheet_push(p_token text, p_tabs text[], p_rows int, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_id uuid;
begin
  select owner_id into v_owner from settings where sheet_token = p_token and length(coalesce(p_token, '')) >= 16;
  if v_owner is null then raise exception 'Неверный токен синхронизации' using errcode = '28000'; end if;
  if length(coalesce(p_body, '')) = 0 or length(p_body) > 5000000 then raise exception 'Пустые или слишком большие данные'; end if;
  insert into sheet_inbox (owner_id, tabs, rows, body) values (v_owner, coalesce(p_tabs, '{}'), coalesce(p_rows, 0), p_body)
  returning id into v_id;
  -- храним последние 30 синхронизаций
  delete from sheet_inbox where owner_id = v_owner and id not in
    (select id from sheet_inbox where owner_id = v_owner order by created_at desc limit 30);
  return jsonb_build_object('id', v_id, 'rows', p_rows);
end $$;
revoke all on function sheet_push(text, text[], int, text) from public;
grant execute on function sheet_push(text, text[], int, text) to anon, authenticated;

-- Новый токен (старый перестаёт работать)
create or replace function sheet_new_token() returns text language sql security invoker as $$
  insert into settings (owner_id, sheet_token) values (auth.uid(), replace(gen_random_uuid()::text, '-', ''))
  on conflict (owner_id) do update set sheet_token = excluded.sheet_token
  returning sheet_token
$$;
grant execute on function sheet_new_token() to authenticated;

commit;

notify pgrst, 'reload schema';
