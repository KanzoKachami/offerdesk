-- 013_after_stop_baseline.sql — «льётся после стопа» = рост «отлито» ПОСЛЕ того, как поток встал на стоп.
-- Всё, что было отлито к моменту стопа, считается долётом до стопа и не подсвечивается.
-- Заодно обнуляет точку отсчёта у всех потоков на стопе: прошлые загрузки один раз
-- прочитали часть вкладок с нулями (формулы пересчитывались), из-за этого были ложные срабатывания.
-- Данные (отлито, статусы) не трогает, можно запускать повторно — но повторный запуск снова обнулит точку отсчёта.

begin;

create or replace function on_launch_change() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.ftd, 0) > 0 and new.ftd_changed_at is null then new.ftd_changed_at := now(); end if;
    if new.stage = 'stopped' and new.ftd_at_stop is null then new.ftd_at_stop := coalesce(new.ftd, 0); end if;
    return new;
  end if;
  if coalesce(new.ftd, 0) > coalesce(old.ftd, 0) then new.ftd_changed_at := now(); end if;

  -- точка отсчёта для «льётся после стопа»
  if new.stage = 'stopped' then
    if old.stage is distinct from 'stopped' or new.ftd_at_stop is null then
      new.ftd_at_stop := coalesce(new.ftd, 0);                  -- встал на стоп: всё, что отлито до этого, — до стопа
    elsif coalesce(new.ftd, 0) < coalesce(old.ftd, 0) then
      new.ftd_at_stop := 0;                                     -- новый месяц: «отлито» обнулилось
    end if;
  else
    new.ftd_at_stop := null;
  end if;

  if (new.stage, new.cap, new.rate, new.currency, new.kpi, new.manager_id, new.webmaster, new.notes,
      new.source_code, new.approach_code, new.sub_id, new.adv_stream_id, new.offer_id, new.geo_code, new.ftd, new.issued_on, new.actualized_on)
     is distinct from
     (old.stage, old.cap, old.rate, old.currency, old.kpi, old.manager_id, old.webmaster, old.notes,
      old.source_code, old.approach_code, old.sub_id, old.adv_stream_id, old.offer_id, old.geo_code, old.ftd, old.issued_on, old.actualized_on) then
    new.changed_at := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_launch_change on launches;
create trigger trg_launch_change before insert or update on launches for each row execute function on_launch_change();

-- точка отсчёта = текущее «отлито» у всех потоков на стопе
update launches set ftd_at_stop = coalesce(ftd, 0) where stage = 'stopped';

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
       else current_date - coalesce(l.issued_on, l.created_at::date) end as days_no_ftd,
  -- сколько депов прибавилось после того, как поток увидели на стопе
  case when l.stage = 'stopped' then greatest(coalesce(l.ftd, 0) - coalesce(l.ftd_at_stop, l.ftd, 0), 0) else 0 end as ftd_after_stop,
  -- льётся после стопа: «отлито» выросло после того, как поток впервые увидели на стопе
  (l.stage = 'stopped' and coalesce(l.ftd, 0) > coalesce(l.ftd_at_stop, l.ftd, 0)) as poured_after_stop,
  (l.stage = 'stopped' and l.actualized_on is null) as stop_without_date
from launches l
left join requests    r on r.id = l.request_id
left join offers      o on o.id = l.offer_id
left join advertisers a on a.id = coalesce(o.advertiser_id, l.advertiser_ref)
left join managers    m on m.id = l.manager_id
left join webmasters  w on w.id = l.webmaster_id;
grant select on v_launches to authenticated;

commit;

notify pgrst, 'reload schema';
