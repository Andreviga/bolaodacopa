create table if not exists public.bolao_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create or replace function public.set_bolao_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_bolao_state_updated_at on public.bolao_state;

create trigger set_bolao_state_updated_at
before update on public.bolao_state
for each row
execute function public.set_bolao_updated_at();

alter table public.bolao_state enable row level security;

drop policy if exists "bolao_state_select_family" on public.bolao_state;
drop policy if exists "bolao_state_insert_family" on public.bolao_state;
drop policy if exists "bolao_state_update_family" on public.bolao_state;

create policy "bolao_state_select_family"
on public.bolao_state
for select
to anon
using (id = 'copa2026-familia');

create policy "bolao_state_insert_family"
on public.bolao_state
for insert
to anon
with check (id = 'copa2026-familia');

create policy "bolao_state_update_family"
on public.bolao_state
for update
to anon
using (id = 'copa2026-familia')
with check (id = 'copa2026-familia');

grant select, insert, update on table public.bolao_state to anon;
