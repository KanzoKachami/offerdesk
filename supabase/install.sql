-- УСТАНОВКА С НУЛЯ: запусти этот файл целиком в Supabase → SQL Editor.
-- Внутри schema + 002…007. ВНИМАНИЕ: пересоздаёт базу, старые данные CRM удаляются.

-- =====================================================================
-- Offerdesk — полная схема базы. Пересоздаёт всё с нуля.
-- Supabase → SQL Editor → вставить файл целиком → Run.
--
-- Структура: рекламодатель → его офферы. Оффер = продукт (SANKRA),
-- у него список гео, где он работает, и список сорсов, которые он принимает.
--
-- ВНИМАНИЕ: удаляет все прежние таблицы Offerdesk вместе с данными.
-- Пользователь в Authentication остаётся.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Чистим всё старое
-- ---------------------------------------------------------------------
drop view if exists v_launches cascade;
drop table if exists launches, item_managers, activities, item_offers, request_items, request_assignees, requests,
  offer_variants, offers, brands, webmasters, advertisers, assignees, managers, settings,
  source_tag_sources, source_tags, approaches, sources, geos cascade;
drop view if exists v_offers, v_requests, v_queue cascade;
drop function if exists find_offers(text, text, text) cascade;
drop function if exists find_offers(text, text, text, boolean) cascade;
drop function if exists find_duplicates(uuid, text, uuid, int) cascade;
drop function if exists set_updated_at, normalize_brand, build_offer_name, rename_brand_offers,
  on_item_status, sync_item_status, sort_tags, normalize_variant, normalize_offer,
  on_launch_stage, create_launch_on_approve, create_launch_on_item_close, create_launch_on_manager_approve,
  create_launch_for_item cascade;
drop type if exists advertiser_tier, webmaster_kind, request_type, request_mode, request_origin,
  priority_level, payout_model, offer_status, item_status, outcome_kind, item_offer_status,
  launch_stage cascade;

-- ---------------------------------------------------------------------
-- 1. Типы
-- ---------------------------------------------------------------------
create type advertiser_tier   as enum ('key', 'occasional');
create type webmaster_kind    as enum ('solo', 'inhouse', 'team');
create type request_type      as enum ('offer_search', 'rate', 'cap', 'approval', 'tech', 'quality', 'payout', 'other');
create type request_mode      as enum ('specific', 'search');
create type request_origin    as enum ('bot', 'manual');
create type priority_level    as enum ('low', 'normal', 'high', 'urgent');
create type payout_model      as enum ('CPA', 'RS', 'Hybrid', 'CPL', 'other');
create type offer_status      as enum ('active', 'paused', 'closed');
create type item_status       as enum ('new', 'clarifying', 'sent', 'waiting', 'answered', 'passed', 'closed', 'archived', 'paused');
create type outcome_kind      as enum ('approved', 'partial', 'declined');
create type item_offer_status as enum ('draft', 'sent', 'pinged', 'answered', 'cancelled');

-- ---------------------------------------------------------------------
-- 2. Справочники
-- ---------------------------------------------------------------------
create table geos (
  code    text primary key check (code ~ '^[A-Z]{2}$'),   -- ISO, кроме Великобритании: UK
  name_ru text not null
);
create table sources (
  code text primary key check (code = upper(code)),
  name text not null
);
create table approaches (
  code text primary key check (code = upper(code)),
  name text not null
);

-- ---------------------------------------------------------------------
-- 3. Люди и рекламодатели
-- ---------------------------------------------------------------------
create table managers (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid(),
  name        text not null,
  department  text,
  tg_username text,
  tg_user_id  bigint,
  chat_link   text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table assignees (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid(),
  name        text not null,
  tg_username text,
  is_me       boolean not null default false,
  created_at  timestamptz not null default now()
);

create table webmasters (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid(),
  name       text not null,
  contact    text,
  kind       webmaster_kind,
  notes      text,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table advertisers (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid(),
  name        text not null,
  tier        advertiser_tier not null default 'key',
  contact     text,
  tg_username text,
  chat_link   text,
  notes       text,
  created_at  timestamptz not null default now(),
  unique (owner_id, name)
);

-- ---------------------------------------------------------------------
-- 4. Офферы: продукт рекла + где работает + какие сорсы принимает
-- ---------------------------------------------------------------------
create table offers (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid(),
  advertiser_id uuid not null references advertisers(id) on delete restrict,
  name          text not null,                    -- SANKRA (капсом)
  geos          text[] not null default '{}',     -- {DE,ES,IT}
  sources       text[] not null default '{}',     -- {FB,APPS,SEO}; пусто = любой
  approaches    text[] not null default '{}',     -- {SLOT}; пусто = любой
  model         payout_model,
  rate          numeric(10,2),
  currency      text not null default 'USD',
  cap           integer,
  status        offer_status not null default 'active',
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (owner_id, name)
);
create index offers_geos_gin on offers using gin (geos);
create index offers_adv on offers (advertiser_id);

create or replace function normalize_offer() returns trigger language plpgsql as $$
declare bad text;
begin
  new.name := upper(regexp_replace(trim(new.name), '\s+', ' ', 'g'));
  new.geos := array(select distinct upper(trim(g)) from unnest(new.geos) g where trim(g) <> '' order by 1);
  new.sources := array(select distinct upper(trim(s)) from unnest(new.sources) s where trim(s) <> '' order by 1);
  new.approaches := array(select distinct upper(trim(a)) from unnest(new.approaches) a where trim(a) <> '' order by 1);
  select g into bad from unnest(new.geos) g where not exists (select 1 from geos x where x.code = g) limit 1;
  if bad is not null then raise exception 'Нет гео % в справочнике', bad using errcode = '23514'; end if;
  select s into bad from unnest(new.sources) s where not exists (select 1 from sources x where x.code = s) limit 1;
  if bad is not null then raise exception 'Нет сорса % в справочнике', bad using errcode = '23514'; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger trg_offers_norm before insert or update on offers for each row execute function normalize_offer();

-- ---------------------------------------------------------------------
-- 5. Запросы
-- ---------------------------------------------------------------------
create table requests (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid(),
  number        bigint generated always as identity,
  manager_id    uuid references managers(id) on delete set null,
  webmaster_id  uuid references webmasters(id) on delete set null,
  type          request_type   not null default 'offer_search',
  mode          request_mode   not null default 'search',
  source_code   text references sources(code),
  approach_code text references approaches(code),
  is_inhouse    boolean not null default false,
  priority      priority_level not null default 'normal',
  raw_text      text,
  product_text  text,
  origin        request_origin not null default 'manual',
  tg_chat_id    bigint,
  tg_message_id bigint,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table request_assignees (
  request_id  uuid references requests(id)  on delete cascade,
  assignee_id uuid references assignees(id) on delete cascade,
  owner_id    uuid not null default auth.uid(),
  primary key (request_id, assignee_id)
);

create table request_items (               -- позиция = одно гео
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null default auth.uid(),
  request_id          uuid not null references requests(id) on delete cascade,
  geo_code            text not null references geos(code),
  offer_id            uuid references offers(id) on delete set null,   -- если менеджер просит конкретный продукт
  rate_min            numeric(10,2),
  rate_max            numeric(10,2),
  currency            text not null default 'USD',
  model               payout_model,
  status              item_status not null default 'new',
  status_changed_at   timestamptz not null default now(),
  paused_reason       text,
  status_before_pause item_status,
  outcome             outcome_kind,
  outcome_note        text,
  answer_to_manager   text,
  created_at          timestamptz not null default now(),
  closed_at           timestamptz,
  check (status <> 'closed' or outcome is not null),
  check (status <> 'paused' or paused_reason is not null)
);

create table item_offers (                 -- обращение к реклу по офферу в рамках позиции
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid(),
  item_id      uuid not null references request_items(id) on delete cascade,
  offer_id     uuid not null references offers(id) on delete restrict,
  status       item_offer_status not null default 'draft',
  sent_at      timestamptz,
  pinged_at    timestamptz,
  answered_at  timestamptz,
  outcome      outcome_kind,
  offered_rate numeric(10,2),
  offered_cap  integer,
  conditions   text,
  answer_text  text,
  created_at   timestamptz not null default now(),
  unique (item_id, offer_id)
);

create table activities (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid(),
  request_id    uuid references requests(id)      on delete cascade,
  item_id       uuid references request_items(id) on delete cascade,
  item_offer_id uuid references item_offers(id)   on delete cascade,
  kind          text not null,
  text          text,
  meta          jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

create table settings (
  owner_id        uuid primary key default auth.uid(),
  tz              text not null default 'Europe/Moscow',
  work_start      time not null default '10:00',
  work_end        time not null default '19:00',
  work_days       int[] not null default '{1,2,3,4,5}',
  sla_new_h       int not null default 2,
  sla_adv_ping_h  int not null default 24,
  sla_adv_escal_h int not null default 48,
  sla_pass_h      int not null default 1,
  sla_manager_h   int not null default 24,
  archive_days    int not null default 7,
  duplicate_days  int not null default 30,
  digest_morning  time not null default '10:00',
  digest_evening  time not null default '19:00',
  tg_user_id      bigint
);

create index on requests (owner_id, created_at desc);
create index on request_items (request_id);
create index on request_items (status, status_changed_at);
create index on item_offers (item_id);
create index on item_offers (offer_id);
create index on activities (request_id, created_at desc);

-- ---------------------------------------------------------------------
-- 6. Триггеры статусов
-- ---------------------------------------------------------------------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger trg_requests_upd before update on requests for each row execute function set_updated_at();

-- Смена статуса позиции: время, закрытие, пауза, запись в ленту
create or replace function on_item_status() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
    if new.status in ('closed', 'archived') then new.closed_at := now();
    elsif old.status in ('closed', 'archived') then new.closed_at := null; end if;
    if new.status = 'paused' then new.status_before_pause := old.status;
    elsif old.status = 'paused' then new.paused_reason := null; new.status_before_pause := null; end if;
    insert into activities (owner_id, request_id, item_id, kind, meta)
    values (new.owner_id, new.request_id, new.id, 'status_changed', jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end $$;
create trigger trg_items_status before update of status on request_items for each row execute function on_item_status();

-- Статус позиции следует за обращениями к реклам: отправил → «Отправлен», ответ → «Ответ получен»
create or replace function sync_item_status() returns trigger language plpgsql as $$
declare v_item uuid := coalesce(new.item_id, old.item_id); v_cur item_status; v_target item_status;
begin
  select status into v_cur from request_items where id = v_item;
  if v_cur is null or v_cur not in ('new', 'sent', 'waiting', 'answered') then return null; end if;
  select case when bool_or(status = 'answered') then 'answered'
              when bool_or(status = 'pinged') then 'waiting'
              when bool_or(status = 'sent') then 'sent'
              else 'new' end::item_status
    into v_target from item_offers where item_id = v_item and status <> 'cancelled';
  v_target := coalesce(v_target, 'new');
  if v_target <> v_cur then update request_items set status = v_target where id = v_item; end if;
  return null;
end $$;
create trigger trg_item_offers_sync after insert or delete or update of status on item_offers
  for each row execute function sync_item_status();

-- ---------------------------------------------------------------------
-- 7. Представления и подбор
-- ---------------------------------------------------------------------
create view v_offers with (security_invoker = true) as
select o.*, a.name as advertiser_name, a.tier
from offers o join advertisers a on a.id = o.advertiser_id;

-- Подбор офферов под позицию: гео обязательно, сорс и подход — если оффер их ограничивает
create or replace function find_offers(p_geo text, p_source text default null, p_approach text default null)
returns setof v_offers language sql stable security invoker as $$
  select o.* from v_offers o
  where o.status = 'active'
    and upper(p_geo) = any(o.geos)
    and (p_source is null or cardinality(o.sources) = 0 or upper(p_source) = any(o.sources))
    and (p_approach is null or cardinality(o.approaches) = 0 or upper(p_approach) = any(o.approaches))
  order by o.tier, o.name;
$$;

create view v_requests with (security_invoker = true) as
select
  r.*,
  m.name as manager_name,
  w.name as webmaster_name,
  (select coalesce(string_agg(coalesce('@' || a.tg_username, a.name), ' ' order by a.name), '')
     from request_assignees ra join assignees a on a.id = ra.assignee_id where ra.request_id = r.id) as assignees_label,
  exists (select 1 from request_assignees ra join assignees a on a.id = ra.assignee_id
           where ra.request_id = r.id and a.is_me) as mine,
  count(i.id) as items_total,
  count(i.id) filter (where i.status in ('passed','closed','archived')) as items_done,
  coalesce(jsonb_agg(jsonb_build_object('geo', i.geo_code, 'status', i.status, 'outcome', i.outcome)
           order by i.geo_code) filter (where i.id is not null), '[]') as items_brief,
  case
    when count(i.id) = 0 then 'empty'
    when bool_and(i.status in ('closed','archived')) then 'closed'
    when bool_or(i.status in ('new','answered')) then 'on_me'
    when bool_or(i.status = 'clarifying') then 'on_manager'
    when bool_or(i.status in ('sent','waiting')) then 'on_advertiser'
    when bool_and(i.status in ('passed','closed','archived','paused')) then 'done_or_paused'
    else 'mixed'
  end as ball
from requests r
left join managers   m on m.id = r.manager_id
left join webmasters w on w.id = r.webmaster_id
left join request_items i on i.request_id = r.id
group by r.id, m.name, w.name;

create view v_queue with (security_invoker = true) as
select
  i.id as item_id, i.request_id, r.number, i.geo_code, i.status, i.status_changed_at, i.paused_reason,
  r.priority, r.type, r.source_code, r.approach_code, r.is_inhouse,
  m.name as manager_name, w.name as webmaster_name, coalesce(o.name, r.product_text) as product,
  exists (select 1 from request_assignees ra join assignees a on a.id = ra.assignee_id
           where ra.request_id = r.id and a.is_me) as mine,
  (select count(*) from item_offers io where io.item_id = i.id and io.status <> 'cancelled') as offers_count,
  (select string_agg(distinct adv.name, ', ')
     from item_offers io join offers oo on oo.id = io.offer_id join advertisers adv on adv.id = oo.advertiser_id
    where io.item_id = i.id and io.status in ('sent','pinged')) as waiting_for,
  case
    when i.status in ('new','answered') then 'on_me'
    when i.status = 'clarifying'        then 'on_manager'
    when i.status in ('sent','waiting') then 'on_advertiser'
    when i.status = 'paused'            then 'paused'
  end as ball,
  extract(epoch from now() - i.status_changed_at) / 3600 as hours_in_status
from request_items i
join requests r on r.id = i.request_id
left join managers   m on m.id = r.manager_id
left join webmasters w on w.id = r.webmaster_id
left join offers     o on o.id = i.offer_id
where i.status not in ('passed','closed','archived');

-- ---------------------------------------------------------------------
-- 8. Доступ: каждый видит только свои записи
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['managers','assignees','webmasters','advertisers','offers',
                           'requests','request_assignees','request_items','item_offers','activities','settings']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy own_rows on %I for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
  end loop;
  foreach t in array array['geos','sources','approaches']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy read_all on %I for select to authenticated using (true)', t);
    execute format('create policy write_all on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- ---------------------------------------------------------------------
-- 9. Справочники
-- ---------------------------------------------------------------------
insert into sources (code, name) values
  ('FB','Facebook'), ('APPS','Приложения'), ('INAPP','In-app'), ('UAC','Google UAC'), ('SEO','SEO'),
  ('PPC','PPC'), ('ASO','ASO'), ('SMS','SMS'), ('EMAIL','Email'), ('PUSH','Push'), ('POP','Popunder'),
  ('TG','Telegram'), ('TIKTOK','TikTok'), ('NATIVE','Native'), ('INH','Инхаус');

insert into approaches (code, name) values
  ('SLOT','Слоты'), ('SPORT','Спорт'), ('LIVE','Live casino'), ('CRASH','Crash-игры'),
  ('PRAGMATIC','Pragmatic Play'), ('BRAND','Брендовый трафик'), ('BONUS','Бонусный подход');

insert into geos (code, name_ru) values
  ('AT','Австрия'), ('AU','Австралия'), ('AZ','Азербайджан'), ('BD','Бангладеш'), ('BE','Бельгия'),
  ('BR','Бразилия'), ('CA','Канада'), ('CH','Швейцария'), ('CL','Чили'), ('CO','Колумбия'),
  ('CZ','Чехия'), ('DE','Германия'), ('DK','Дания'), ('EG','Египет'), ('ES','Испания'),
  ('FI','Финляндия'), ('FR','Франция'), ('UK','Великобритания'), ('GR','Греция'), ('HU','Венгрия'),
  ('IE','Ирландия'), ('IN','Индия'), ('IT','Италия'), ('JP','Япония'), ('KZ','Казахстан'),
  ('MX','Мексика'), ('NL','Нидерланды'), ('NO','Норвегия'), ('NZ','Новая Зеландия'), ('PE','Перу'),
  ('PH','Филиппины'), ('PK','Пакистан'), ('PL','Польша'), ('PT','Португалия'), ('RO','Румыния'),
  ('RS','Сербия'), ('SE','Швеция'), ('SK','Словакия'), ('TR','Турция'), ('UA','Украина'),
  ('UZ','Узбекистан'), ('AR','Аргентина'), ('EC','Эквадор'), ('ZA','ЮАР'), ('NG','Нигерия'),
  ('KE','Кения'), ('TH','Таиланд'), ('VN','Вьетнам'), ('ID','Индонезия'), ('MY','Малайзия'),
  ('GH','Гана'), ('CI','Кот-д''Ивуар'), ('KG','Киргизия'), ('ET','Эфиопия'), ('TG','Того'),
  ('TJ','Таджикистан'), ('MN','Монголия'), ('LK','Шри-Ланка'), ('KR','Южная Корея'), ('VE','Венесуэла'),
  ('UG','Уганда'), ('TZ','Танзания'), ('SN','Сенегал'), ('CM','Камерун'), ('BF','Буркина-Фасо'),
  ('CD','ДР Конго'), ('GN','Гвинея'), ('BJ','Бенин'), ('ZM','Замбия'), ('MZ','Мозамбик'), ('NP','Непал');

commit;

-- Сообщаем API Supabase, что структура базы поменялась
notify pgrst, 'reload schema';


-- =====================================================================
-- 002 — запуски, входящие от реклов, язык рекла.
-- Запускать после schema.sql (и seed.sql). Данные не удаляет.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Язык общения с реклом
-- ---------------------------------------------------------------------
alter table advertisers add column if not exists lang text not null default 'RU' check (lang in ('RU', 'EN'));

-- ---------------------------------------------------------------------
-- 2. Запросы «от рекла»: рекл ищет трафик, мы спрашиваем менеджеров
-- ---------------------------------------------------------------------
alter table requests
  add column if not exists direction text not null default 'from_manager' check (direction in ('from_manager', 'from_advertiser')),
  add column if not exists advertiser_id uuid references advertisers(id) on delete set null;

-- «Рекл ждёт ответа»: пинг от рекла поднимает позицию в очереди
alter table request_items add column if not exists adv_waiting_since timestamptz;

create table if not exists item_managers (       -- к каким менеджерам пошли с запросом рекла
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid(),
  item_id     uuid not null references request_items(id) on delete cascade,
  manager_id  uuid not null references managers(id) on delete cascade,
  status      item_offer_status not null default 'draft',   -- draft / sent / pinged / answered / cancelled
  sent_at     timestamptz,
  answered_at timestamptz,
  outcome     outcome_kind,
  answer_text text,                                          -- что предложил менеджер: веб, объёмы, условия
  created_at  timestamptz not null default now(),
  unique (item_id, manager_id)
);
create index if not exists item_managers_item on item_managers (item_id);

-- Статус позиции следует и за обращениями к реклам, и за обращениями к менеджерам
create or replace function sync_item_status() returns trigger language plpgsql as $$
declare v_item uuid := coalesce(new.item_id, old.item_id); v_cur item_status; v_target item_status;
begin
  select status into v_cur from request_items where id = v_item;
  if v_cur is null or v_cur not in ('new', 'sent', 'waiting', 'answered') then return null; end if;
  select case when bool_or(s = 'answered') then 'answered'
              when bool_or(s = 'pinged') then 'waiting'
              when bool_or(s = 'sent') then 'sent'
              else 'new' end::item_status
    into v_target
    from (select status::text as s from item_offers where item_id = v_item and status <> 'cancelled'
          union all
          select status::text from item_managers where item_id = v_item and status <> 'cancelled') x;
  v_target := coalesce(v_target, 'new');
  if v_target <> v_cur then update request_items set status = v_target where id = v_item; end if;
  return null;
end $$;

drop trigger if exists trg_item_managers_sync on item_managers;
create trigger trg_item_managers_sync after insert or delete or update of status on item_managers
  for each row execute function sync_item_status();

-- ---------------------------------------------------------------------
-- 3. Запуски: от «рекл согласовал» до трафика и депа
-- ---------------------------------------------------------------------
do $$ begin
  create type launch_stage as enum (
    'waiting_link',   -- ждём ссылку от рекла
    'link_received',  -- ссылка получена → передать интегратору
    'at_integrator',  -- у интегратора
    'integrated',     -- интегрировано → сообщить менеджеру, ждём трафик
    'live',           -- трафик пошёл
    'ftd',            -- был деп
    'no_traffic',     -- трафик не пошёл
    'stopped'         -- остановлен / отменён
  );
exception when duplicate_object then null; end $$;

create table if not exists launches (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null default auth.uid(),
  item_offer_id     uuid unique references item_offers(id) on delete set null,
  request_id        uuid references requests(id) on delete set null,
  offer_id          uuid references offers(id) on delete set null,
  geo_code          text references geos(code),
  manager_id        uuid references managers(id) on delete set null,
  webmaster_id      uuid references webmasters(id) on delete set null,
  conditions        text,                 -- что согласовали: ставка, капа, условия
  stage             launch_stage not null default 'waiting_link',
  stage_changed_at  timestamptz not null default now(),
  link              text,                 -- ссылка от рекла
  stop_reason       text,
  adv_waiting_since timestamptz,          -- рекл спрашивал статус и ждёт ответа
  notes             text,
  created_at        timestamptz not null default now()
);
create index if not exists launches_stage on launches (stage, stage_changed_at);

alter table activities add column if not exists launch_id uuid references launches(id) on delete cascade;
create index if not exists activities_launch on activities (launch_id, created_at desc);

create or replace function on_launch_stage() returns trigger language plpgsql as $$
begin
  if new.stage is distinct from old.stage then
    new.stage_changed_at := now();
    new.adv_waiting_since := null;   -- сдвинули этап — рекл больше не «ждёт»
    insert into activities (owner_id, request_id, launch_id, kind, meta)
    values (new.owner_id, new.request_id, new.id, 'launch_stage', jsonb_build_object('from', old.stage, 'to', new.stage));
  end if;
  return new;
end $$;
drop trigger if exists trg_launch_stage on launches;
create trigger trg_launch_stage before update of stage on launches for each row execute function on_launch_stage();

-- Рекл одобрил оффер → карточка запуска появляется сама
create or replace function create_launch_on_approve() returns trigger language plpgsql as $$
begin
  if new.status = 'answered' and new.outcome in ('approved', 'partial')
     and (old.status is distinct from 'answered' or old.outcome is distinct from new.outcome) then
    insert into launches (owner_id, item_offer_id, request_id, offer_id, geo_code, manager_id, webmaster_id, conditions)
    select new.owner_id, new.id, r.id, new.offer_id, i.geo_code, r.manager_id, r.webmaster_id,
           nullif(concat_ws(' · ',
             case when new.offered_rate is not null then 'ставка ' || new.offered_rate end,
             case when new.offered_cap  is not null then 'капа ' || new.offered_cap end,
             new.conditions), '')
    from request_items i join requests r on r.id = i.request_id
    where i.id = new.item_id
    on conflict (item_offer_id) do nothing;
  end if;
  return null;
end $$;
-- Уже одобренные раньше офферы тоже получают карточки запуска
insert into launches (owner_id, item_offer_id, request_id, offer_id, geo_code, manager_id, webmaster_id, conditions)
select io.owner_id, io.id, r.id, io.offer_id, i.geo_code, r.manager_id, r.webmaster_id,
       nullif(concat_ws(' · ',
         case when io.offered_rate is not null then 'ставка ' || io.offered_rate end,
         case when io.offered_cap  is not null then 'капа ' || io.offered_cap end,
         io.conditions), '')
from item_offers io join request_items i on i.id = io.item_id join requests r on r.id = i.request_id
where io.status = 'answered' and io.outcome in ('approved', 'partial')
on conflict (item_offer_id) do nothing;

drop trigger if exists trg_io_launch on item_offers;
create trigger trg_io_launch after update of status, outcome on item_offers
  for each row execute function create_launch_on_approve();

drop view if exists v_launches;
create view v_launches with (security_invoker = true) as
select l.*,
  r.number as request_number,
  o.name as offer_name,
  a.id as advertiser_id, a.name as advertiser_name, a.lang as advertiser_lang,
  m.name as manager_name,
  w.name as webmaster_name,
  case
    when l.stage = 'waiting_link'  then 'on_advertiser'
    when l.stage = 'at_integrator' then 'on_integrator'
    when l.stage in ('link_received') then 'on_me'
    when l.stage = 'integrated' then 'waiting_traffic'
    else 'done'
  end as ball,
  extract(epoch from now() - l.stage_changed_at) / 3600 as hours_in_stage
from launches l
left join requests   r on r.id = l.request_id
left join offers     o on o.id = l.offer_id
left join advertisers a on a.id = o.advertiser_id
left join managers   m on m.id = l.manager_id
left join webmasters w on w.id = l.webmaster_id;

-- ---------------------------------------------------------------------
-- 4. Настройки: интегратор и SLA запусков
-- ---------------------------------------------------------------------
alter table settings
  add column if not exists integrator_name text,
  add column if not exists integrator_tg   text,
  add column if not exists sla_link_h       int not null default 24,
  add column if not exists sla_integrator_h int not null default 24,
  add column if not exists sla_traffic_h    int not null default 48;

-- ---------------------------------------------------------------------
-- 5. Представления запросов и очереди: направление и «рекл ждёт»
-- ---------------------------------------------------------------------
drop view if exists v_queue;
drop view if exists v_requests;

create view v_requests with (security_invoker = true) as
select
  r.*,
  m.name as manager_name,
  w.name as webmaster_name,
  adv.name as advertiser_name,
  (select coalesce(string_agg(coalesce('@' || a.tg_username, a.name), ' ' order by a.name), '')
     from request_assignees ra join assignees a on a.id = ra.assignee_id where ra.request_id = r.id) as assignees_label,
  exists (select 1 from request_assignees ra join assignees a on a.id = ra.assignee_id
           where ra.request_id = r.id and a.is_me) as mine,
  count(i.id) as items_total,
  count(i.id) filter (where i.status in ('passed','closed','archived')) as items_done,
  coalesce(jsonb_agg(jsonb_build_object('geo', i.geo_code, 'status', i.status, 'outcome', i.outcome)
           order by i.geo_code) filter (where i.id is not null), '[]') as items_brief,
  case
    when count(i.id) = 0 then 'empty'
    when bool_and(i.status in ('closed','archived')) then 'closed'
    when bool_or(i.status in ('new','answered')) or bool_or(i.adv_waiting_since is not null) then 'on_me'
    when bool_or(i.status = 'clarifying') then 'on_manager'
    when bool_or(i.status in ('sent','waiting')) then case when r.direction = 'from_advertiser' then 'on_manager' else 'on_advertiser' end
    when bool_and(i.status in ('passed','closed','archived','paused')) then 'done_or_paused'
    else 'mixed'
  end as ball
from requests r
left join managers    m   on m.id = r.manager_id
left join webmasters  w   on w.id = r.webmaster_id
left join advertisers adv on adv.id = r.advertiser_id
left join request_items i on i.request_id = r.id
group by r.id, m.name, w.name, adv.name;

create view v_queue with (security_invoker = true) as
select
  i.id as item_id, i.request_id, r.number, i.geo_code, i.status, i.status_changed_at, i.paused_reason,
  i.adv_waiting_since, r.direction, adv.name as advertiser_name,
  r.priority, r.type, r.source_code, r.approach_code, r.is_inhouse,
  m.name as manager_name, w.name as webmaster_name, coalesce(o.name, r.product_text) as product,
  exists (select 1 from request_assignees ra join assignees a on a.id = ra.assignee_id
           where ra.request_id = r.id and a.is_me) as mine,
  (select count(*) from item_offers io where io.item_id = i.id and io.status <> 'cancelled')
    + (select count(*) from item_managers im where im.item_id = i.id and im.status <> 'cancelled') as offers_count,
  coalesce(
    (select string_agg(distinct ad.name, ', ')
       from item_offers io join offers oo on oo.id = io.offer_id join advertisers ad on ad.id = oo.advertiser_id
      where io.item_id = i.id and io.status in ('sent','pinged')),
    (select string_agg(distinct mm.name, ', ')
       from item_managers im join managers mm on mm.id = im.manager_id
      where im.item_id = i.id and im.status in ('sent','pinged'))) as waiting_for,
  case
    when i.adv_waiting_since is not null then 'on_me'
    when i.status in ('new','answered') then 'on_me'
    when i.status = 'clarifying'        then 'on_manager'
    when i.status in ('sent','waiting') then case when r.direction = 'from_advertiser' then 'on_manager' else 'on_advertiser' end
    when i.status = 'paused'            then 'paused'
  end as ball,
  extract(epoch from now() - i.status_changed_at) / 3600 as hours_in_status
from request_items i
join requests r on r.id = i.request_id
left join managers    m   on m.id = r.manager_id
left join webmasters  w   on w.id = r.webmaster_id
left join advertisers adv on adv.id = r.advertiser_id
left join offers      o   on o.id = i.offer_id
where i.status not in ('passed','closed','archived');

-- ---------------------------------------------------------------------
-- 6. Доступ
-- ---------------------------------------------------------------------
alter table item_managers enable row level security;
alter table launches enable row level security;
drop policy if exists own_rows on item_managers;
drop policy if exists own_rows on launches;
create policy own_rows on item_managers for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy own_rows on launches      for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
grant all on item_managers, launches to authenticated;
grant select on v_launches, v_requests, v_queue to authenticated;

commit;

notify pgrst, 'reload schema';

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

-- 004_geos.sql — гео, которых не было в справочнике (из таблицы потоков). Можно запускать повторно.
insert into geos (code, name_ru) values
  ('GH','Гана'), ('CI','Кот-д''Ивуар'), ('KG','Киргизия'), ('ET','Эфиопия'), ('TG','Того'),
  ('TJ','Таджикистан'), ('MN','Монголия'), ('LK','Шри-Ланка'), ('KR','Южная Корея'), ('VE','Венесуэла'),
  ('UG','Уганда'), ('TZ','Танзания'), ('SN','Сенегал'), ('CM','Камерун'), ('BF','Буркина-Фасо'),
  ('CD','ДР Конго'), ('GN','Гвинея'), ('BJ','Бенин'), ('ZM','Замбия'), ('MZ','Мозамбик'), ('NP','Непал')
on conflict (code) do nothing;

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

-- 006_currency.sql — валюта ставки в ответе рекла ($ или €). Можно запускать повторно.
begin;

alter table item_offers add column if not exists offered_currency text check (offered_currency in ('USD', 'EUR'));

-- поток берёт валюту из ответа рекла
create or replace function create_launch_on_approve() returns trigger language plpgsql as $$
begin
  if new.status = 'answered' and new.outcome in ('approved', 'partial')
     and (old.status is distinct from 'answered' or old.outcome is distinct from new.outcome) then
    insert into launches (owner_id, item_offer_id, item_id, request_id, offer_id, geo_code, manager_id, webmaster_id,
                          source_code, approach_code, rate, currency, cap, notes)
    select new.owner_id, new.id, i.id, r.id, new.offer_id, i.geo_code, r.manager_id, r.webmaster_id,
           r.source_code, r.approach_code, coalesce(new.offered_rate, i.rate_max, i.rate_min),
           coalesce(new.offered_currency, i.currency), new.offered_cap, nullif(new.conditions, '')
    from request_items i join requests r on r.id = i.request_id
    where i.id = new.item_id
    on conflict (item_offer_id) do nothing;
  end if;
  return null;
end $$;

commit;

notify pgrst, 'reload schema';

-- 007_streams_off.sql — «Потоки» на паузе: выключаем автосоздание и очищаем потоки.
-- ВНИМАНИЕ: удаляет все потоки (в том числе загруженные из таблицы). Запросы, офферы и рекламодатели не трогает.
-- Таблица потоков остаётся — раздел вернётся позже. Можно запускать повторно.
begin;

drop trigger if exists trg_io_launch on item_offers;
drop trigger if exists trg_item_close_launch on request_items;
drop trigger if exists trg_im_launch on item_managers;

delete from activities where launch_id is not null;
delete from launches;

commit;

notify pgrst, 'reload schema';

notify pgrst, 'reload schema';
