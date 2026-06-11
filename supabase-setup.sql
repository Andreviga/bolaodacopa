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

create or replace function public.merge_bolao_prediction_maps(base jsonb, extra jsonb)
returns jsonb
language plpgsql
as $$
declare
  result jsonb := coalesce(base, '{}'::jsonb);
  participant text;
  games jsonb;
begin
  for participant, games in select key, value from jsonb_each(coalesce(extra, '{}'::jsonb)) loop
    result := jsonb_set(
      result,
      array[participant],
      coalesce(result -> participant, '{}'::jsonb) || coalesce(games, '{}'::jsonb),
      true
    );
  end loop;
  return result;
end;
$$;

create or replace function public.preserve_bolao_prediction_archive()
returns trigger
language plpgsql
as $$
declare
  archive jsonb := '{}'::jsonb;
begin
  if tg_op = 'UPDATE' then
    archive := public.merge_bolao_prediction_maps(archive, old.data -> 'predictionArchive');
    archive := public.merge_bolao_prediction_maps(archive, old.data -> 'predictions');
  end if;

  archive := public.merge_bolao_prediction_maps(archive, new.data -> 'predictionArchive');
  archive := public.merge_bolao_prediction_maps(archive, new.data -> 'predictions');
  new.data := jsonb_set(coalesce(new.data, '{}'::jsonb), '{predictionArchive}', archive, true);
  return new;
end;
$$;

drop trigger if exists preserve_bolao_prediction_archive on public.bolao_state;

create trigger preserve_bolao_prediction_archive
before insert or update on public.bolao_state
for each row
execute function public.preserve_bolao_prediction_archive();

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
