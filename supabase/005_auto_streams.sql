-- 005_auto_streams.sql — поток появляется при любом «одобрено», а не только при ответе рекла по офферу.
-- Запускать после 003. Данные не удаляет, можно запускать повторно.
--
-- Откуда теперь берётся поток:
--   1) рекл ответил «одобрено / с условиями» по офферу в позиции (было и раньше);
--   2) позицию закрыли с итогом «одобрено / с условиями»;
--   3) в запросе от рекла менеджер ответил «одобрено / с условиями»;
--   4) кнопка «→ В потоки» у позиции — вручную.

begin;

alter table launches
  add column if not exists item_id         uuid references request_items(id) on delete set null,
  add column if not exists item_manager_id uuid references item_managers(id) on delete set null,
  add column if not exists advertiser_ref  uuid references advertisers(id) on delete set null;  -- рекл, если нет оффера

-- у потоков из ответов по офферам проставляем позицию
update launches l set item_id = io.item_id
from item_offers io where io.id = l.item_offer_id and l.item_id is null;

create index if not exists launches_item on launches (item_id);

-- Поток по позиции (и, если задано, по ответу конкретного менеджера). Повторно не создаёт.
create or replace function create_launch_for_item(p_item uuid, p_im uuid default null) returns uuid
language plpgsql as $$
declare v_id uuid;
begin
  if p_im is not null then
    select id into v_id from launches where item_manager_id = p_im limit 1;
  else
    select id into v_id from launches where item_id = p_item limit 1;
  end if;
  if v_id is not null then return v_id; end if;

  insert into launches (owner_id, item_id, item_manager_id, request_id, offer_id, advertiser_ref, geo_code,
                        manager_id, webmaster_id, source_code, approach_code, rate, currency, notes)
  select i.owner_id, i.id, p_im, r.id, i.offer_id, coalesce(o.advertiser_id, r.advertiser_id), i.geo_code,
         coalesce(im.manager_id, r.manager_id), r.webmaster_id, r.source_code, r.approach_code,
         coalesce(i.rate_max, i.rate_min), i.currency, nullif(coalesce(im.answer_text, i.outcome_note), '')
  from request_items i
  join requests r on r.id = i.request_id
  left join offers o on o.id = i.offer_id
  left join item_managers im on im.id = p_im
  where i.id = p_item
  returning id into v_id;
  return v_id;
end $$;

-- 1) ответ рекла по офферу — теперь ещё и с позицией
create or replace function create_launch_on_approve() returns trigger language plpgsql as $$
begin
  if new.status = 'answered' and new.outcome in ('approved', 'partial')
     and (old.status is distinct from 'answered' or old.outcome is distinct from new.outcome) then
    insert into launches (owner_id, item_offer_id, item_id, request_id, offer_id, geo_code, manager_id, webmaster_id,
                          source_code, approach_code, rate, currency, cap, notes)
    select new.owner_id, new.id, i.id, r.id, new.offer_id, i.geo_code, r.manager_id, r.webmaster_id,
           r.source_code, r.approach_code, coalesce(new.offered_rate, i.rate_max, i.rate_min), i.currency, new.offered_cap,
           nullif(new.conditions, '')
    from request_items i join requests r on r.id = i.request_id
    where i.id = new.item_id
    on conflict (item_offer_id) do nothing;
  end if;
  return null;
end $$;

-- 2) позицию закрыли с итогом «одобрено»
create or replace function create_launch_on_item_close() returns trigger language plpgsql as $$
begin
  if new.status = 'closed' and new.outcome in ('approved', 'partial')
     and (old.status is distinct from new.status or old.outcome is distinct from new.outcome) then
    perform create_launch_for_item(new.id);
  end if;
  return null;
end $$;
drop trigger if exists trg_item_close_launch on request_items;
create trigger trg_item_close_launch after update of status, outcome on request_items
  for each row execute function create_launch_on_item_close();

-- 3) в запросе от рекла менеджер ответил «одобрено»
create or replace function create_launch_on_manager_approve() returns trigger language plpgsql as $$
begin
  if new.status = 'answered' and new.outcome in ('approved', 'partial')
     and (old.status is distinct from 'answered' or old.outcome is distinct from new.outcome) then
    perform create_launch_for_item(new.item_id, new.id);
  end if;
  return null;
end $$;
drop trigger if exists trg_im_launch on item_managers;
create trigger trg_im_launch after update of status, outcome on item_managers
  for each row execute function create_launch_on_manager_approve();

-- То, что уже одобрили раньше, тоже попадает в потоки
select create_launch_for_item(i.id)
from request_items i
where i.status = 'closed' and i.outcome in ('approved', 'partial')
  and not exists (select 1 from launches l where l.item_id = i.id);

select create_launch_for_item(im.item_id, im.id)
from item_managers im
where im.status = 'answered' and im.outcome in ('approved', 'partial')
  and not exists (select 1 from launches l where l.item_manager_id = im.id);

-- Представление: рекл берём из оффера, а если оффера нет — из потока (запросы от реклов)
drop view if exists v_launches;
create view v_launches with (security_invoker = true) as
select l.*,
  r.number as request_number,
  coalesce(o.name, r.product_text) as offer_name,
  a.id as advertiser_id, a.name as advertiser_name, a.lang as advertiser_lang,
  m.name as manager_name,
  coalesce(nullif(l.webmaster, ''), w.name) as webmaster_name,
  extract(epoch from now() - l.stage_changed_at) / 3600 as hours_in_stage,
  extract(epoch from now() - coalesce(l.issued_at, l.stage_changed_at)) / 86400 as days_since_issued
from launches l
left join requests    r on r.id = l.request_id
left join offers      o on o.id = l.offer_id
left join advertisers a on a.id = coalesce(o.advertiser_id, l.advertiser_ref)
left join managers    m on m.id = l.manager_id
left join webmasters  w on w.id = l.webmaster_id;

grant select on v_launches to authenticated;
grant execute on function create_launch_for_item(uuid, uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
