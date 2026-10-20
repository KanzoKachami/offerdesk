-- 012_after_stop_fix.sql — «льётся после стопа» без ложных срабатываний в день первой загрузки потока.
-- Раньше поток, впервые загруженный со стопом и депами, сразу помечался. Теперь — только если
-- рост «отлито» увидели при следующих загрузках, позже даты стопа. Данные не трогает, можно повторять.

begin;

-- Представление: рост «отлито» считается только после первой загрузки потока
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
  -- льётся после стопа: прибавились депы после стопа, или «отлито» росло позже даты стопа
  (l.stage = 'stopped' and (
     coalesce(l.ftd, 0) > coalesce(l.ftd_at_stop, l.ftd, 0)
     or (l.actualized_on is not null and l.ftd_changed_at is not null
         and l.ftd_changed_at > l.created_at + interval '10 minutes'   -- рост увидели при загрузке, а не при первой вставке строки
         and (l.ftd_changed_at at time zone 'Europe/Moscow')::date > l.actualized_on)
  )) as poured_after_stop,
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
