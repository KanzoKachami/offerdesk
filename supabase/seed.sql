-- =====================================================================
-- Offerdesk — стартовые данные: 16 рекламодателей и офферы SANKRA, SLOTAZA.
-- Запускать после schema.sql. Владелец — первый пользователь в Authentication.
-- Повторный запуск безопасен: существующие записи пропускаются.
-- =====================================================================

do $$
declare me uuid := (select id from auth.users order by created_at limit 1);
begin
  if me is null then raise exception 'Сначала создай пользователя в Authentication → Users'; end if;

  insert into advertisers (owner_id, name, tier) values
    (me, 'Gambleon', 'key'), (me, 'AFFINA', 'key'), (me, 'The Clubhouse', 'key'), (me, '1WIN', 'key'),
    (me, 'REVENUE LAB', 'key'), (me, 'ILLUSION PARTNERS', 'key'), (me, 'Lukkly', 'key'), (me, 'afs.partners', 'key'),
    (me, 'Epicstar', 'key'), (me, 'Hidden partners', 'key'), (me, 'Vantio Partners', 'key'), (me, 'Spingold', 'key'),
    (me, 'Vivajack', 'key'), (me, 'FM Partners', 'key'), (me, 'EnjerBet', 'key'), (me, 'WinBuddies', 'key')
  on conflict (owner_id, name) do nothing;

  insert into offers (owner_id, advertiser_id, name, geos, sources)
  select me, a.id, v.name, v.geos, v.sources
  from (values
    ('SANKRA',  'Gambleon',          '{DE,DK,ES,FR,GR,IT,NL,PL,UK}'::text[], '{APPS,FB,INH,PPC,SEO,SMS}'::text[]),
    ('SLOTAZA', 'ILLUSION PARTNERS', '{AT,FR,GR,NL,UK}'::text[],             '{APPS,PPC,SEO}'::text[])
  ) v(name, adv, geos, sources)
  join advertisers a on a.owner_id = me and a.name = v.adv
  on conflict (owner_id, name) do nothing;
end $$;

select a.name as advertiser, o.name as offer, array_to_string(o.geos, ', ') as geos, array_to_string(o.sources, ', ') as sources
from offers o join advertisers a on a.id = o.advertiser_id order by 1;
