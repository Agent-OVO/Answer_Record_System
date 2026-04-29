create table if not exists public.study_records (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  record_type text not null check (record_type in ('exercise', 'material', 'summary')),
  record_date date not null,
  data jsonb not null default '{}'::jsonb,
  created_at_ms bigint not null,
  deleted_at_ms bigint,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists study_records_user_type_date_idx
  on public.study_records (user_id, record_type, record_date desc);

create index if not exists study_records_user_updated_idx
  on public.study_records (user_id, updated_at desc);

alter table public.study_records enable row level security;

drop policy if exists "Users can view own study records" on public.study_records;
drop policy if exists "Users can insert own study records" on public.study_records;
drop policy if exists "Users can update own study records" on public.study_records;
drop policy if exists "Users can delete own study records" on public.study_records;

create policy "Users can view own study records"
  on public.study_records
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own study records"
  on public.study_records
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update own study records"
  on public.study_records
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete own study records"
  on public.study_records
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists study_records_set_updated_at on public.study_records;

create trigger study_records_set_updated_at
  before update on public.study_records
  for each row
  execute function public.set_updated_at();

alter table public.study_records replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.study_records;
  exception
    when duplicate_object then null;
  end;
end;
$$;
