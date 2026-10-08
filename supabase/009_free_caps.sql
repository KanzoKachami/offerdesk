-- 009_free_caps.sql — «Свободные капы»: капы, от которых веб отказался, их можно отдать на подмену.
-- Рекл про подмену не знает: для него это тот же оригинальный ID. Можно запускать повторно.
begin;

create table if not exists free_caps (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null default auth.uid(),
  offer_id            uuid not null references offers(id) on delete cascade,
  geo_code            text not null references geos(code),
  source_code         text,
  approach_code       text,
  adv_stream_id       text,                       -- оригинальный ID у рекла
  cap                 integer,
  rate                numeric(10,2),
  currency            text not null default 'USD' check (currency in ('USD', 'EUR')),
  released_by         text,                       -- веб, который отказался
  released_manager_id uuid references managers(id) on delete set null,
  released_at         date not null default current_date,
  status              text not null default 'free' check (status in ('free', 'offered', 'issued', 'gone')),
  status_changed_at   timestamptz not null default now(),
  item_id             uuid references request_items(id) on delete set null,   -- кому предложили / выдали
  issued_webmaster    text,
  issued_manager_id   uuid references managers(id) on delete set null,
  notes               text,
  created_at          timestamptz not null default now()
);
create index if not exists free_caps_geo on free_caps (geo_code, status);
create index if not exists free_caps_item on free_caps (item_id);

create or replace function on_free_cap_status() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then new.status_changed_at := now(); end if;
  new.geo_code := upper(new.geo_code);
  new.source_code := nullif(upper(trim(new.source_code)), '');
  new.approach_code := nullif(upper(trim(new.approach_code)), '');
  return new;
end $$;
drop trigger if exists trg_free_cap_status on free_caps;
create trigger trg_free_cap_status before insert or update on free_caps for each row execute function on_free_cap_status();

drop view if exists v_free_caps;
create view v_free_caps with (security_invoker = true) as
select c.*,
  o.name as offer_name,
  a.id as advertiser_id, a.name as advertiser_name,
  rm.name as released_manager_name,
  im.name as issued_manager_name,
  r.id as request_id, r.number as request_number,
  (current_date - c.released_at) as days_free
from free_caps c
join offers o on o.id = c.offer_id
left join advertisers a on a.id = o.advertiser_id
left join managers rm on rm.id = c.released_manager_id
left join managers im on im.id = c.issued_manager_id
left join request_items i on i.id = c.item_id
left join requests r on r.id = i.request_id;

alter table free_caps enable row level security;
drop policy if exists own_rows on free_caps;
create policy own_rows on free_caps for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
grant all on free_caps to authenticated;
grant select on v_free_caps to authenticated;

commit;

notify pgrst, 'reload schema';
