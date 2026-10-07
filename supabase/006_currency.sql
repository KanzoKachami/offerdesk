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
