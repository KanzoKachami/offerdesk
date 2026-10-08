-- 008_sheets.sql — раздел «Таблицы»: список ссылок на гугл-таблицы. Можно запускать повторно.
begin;

create table if not exists sheets (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid(),
  name       text not null,
  url        text not null,
  notes      text,
  created_at timestamptz not null default now()
);

alter table sheets enable row level security;
drop policy if exists own_rows on sheets;
create policy own_rows on sheets for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
grant all on sheets to authenticated;

commit;

notify pgrst, 'reload schema';
