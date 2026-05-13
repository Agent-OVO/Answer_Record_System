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

create or replace function public.replace_study_records(import_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  imported_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if import_rows is null or jsonb_typeof(import_rows) <> 'array' then
    raise exception 'import_rows must be a JSON array';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(import_rows) as item
    where jsonb_typeof(item) <> 'object'
      or coalesce(item->>'id', '') = ''
      or coalesce(item->>'record_type', '') not in ('exercise', 'material', 'summary')
      or coalesce(item->>'record_date', '') = ''
      or coalesce(item->>'created_at_ms', '') = ''
      or jsonb_typeof(coalesce(item->'data', '{}'::jsonb)) <> 'object'
  ) then
    raise exception 'import_rows contains invalid records';
  end if;

  delete from public.study_records
  where user_id = current_user_id
    and record_type in ('exercise', 'material', 'summary');

  insert into public.study_records (
    id,
    user_id,
    record_type,
    record_date,
    data,
    created_at_ms,
    deleted_at_ms
  )
  select
    item->>'id',
    current_user_id,
    item->>'record_type',
    (item->>'record_date')::date,
    coalesce(item->'data', '{}'::jsonb),
    (item->>'created_at_ms')::bigint,
    nullif(item->>'deleted_at_ms', '')::bigint
  from jsonb_array_elements(import_rows) as item;

  get diagnostics imported_count = row_count;

  return jsonb_build_object(
    'imported_count', imported_count
  );
end;
$$;

grant execute on function public.replace_study_records(jsonb) to authenticated;

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

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  note text
);

alter table public.admin_users enable row level security;

drop policy if exists "Users can view own admin status" on public.admin_users;

create policy "Users can view own admin status"
  on public.admin_users
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.admin_users to authenticated;

create table if not exists public.analytics_events (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null check (length(btrim(event_name)) > 0),
  event_time_ms bigint not null check (event_time_ms > 0),
  local_date date not null,
  session_id text,
  page text,
  source text,
  record_type text check (record_type is null or record_type in ('exercise', 'material', 'summary')),
  record_id text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  app_version text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists analytics_events_user_time_idx
  on public.analytics_events (user_id, event_time_ms desc);

create index if not exists analytics_events_user_local_date_idx
  on public.analytics_events (user_id, local_date desc);

create index if not exists analytics_events_event_name_date_idx
  on public.analytics_events (event_name, local_date desc);

create index if not exists analytics_events_local_date_idx
  on public.analytics_events (local_date desc, event_time_ms desc);

create index if not exists analytics_events_session_id_idx
  on public.analytics_events (session_id)
  where session_id is not null;

create index if not exists analytics_events_record_idx
  on public.analytics_events (record_type, record_id)
  where record_id is not null;

create index if not exists analytics_events_created_at_idx
  on public.analytics_events (created_at desc);

alter table public.analytics_events enable row level security;

drop policy if exists "Users can view own analytics events" on public.analytics_events;
drop policy if exists "Users can insert own analytics events" on public.analytics_events;
drop policy if exists "Users can update own analytics events" on public.analytics_events;

create policy "Users can view own analytics events"
  on public.analytics_events
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own analytics events"
  on public.analytics_events
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update own analytics events"
  on public.analytics_events
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.analytics_events to authenticated;

create table if not exists public.learning_sessions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at_ms bigint not null check (started_at_ms > 0),
  ended_at_ms bigint check (ended_at_ms is null or ended_at_ms >= started_at_ms),
  duration_ms bigint not null default 0 check (duration_ms >= 0),
  active_duration_ms bigint not null default 0 check (active_duration_ms >= 0),
  idle_duration_ms bigint not null default 0 check (idle_duration_ms >= 0),
  page_count integer not null default 0 check (page_count >= 0),
  event_count integer not null default 0 check (event_count >= 0),
  record_count integer not null default 0 check (record_count >= 0),
  completed_record_count integer not null default 0 check (completed_record_count >= 0),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists learning_sessions_user_started_idx
  on public.learning_sessions (user_id, started_at_ms desc);

create index if not exists learning_sessions_started_idx
  on public.learning_sessions (started_at_ms desc);

create index if not exists learning_sessions_created_at_idx
  on public.learning_sessions (created_at desc);

alter table public.learning_sessions enable row level security;

drop policy if exists "Users can view own learning sessions" on public.learning_sessions;
drop policy if exists "Users can insert own learning sessions" on public.learning_sessions;
drop policy if exists "Users can update own learning sessions" on public.learning_sessions;

create policy "Users can view own learning sessions"
  on public.learning_sessions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own learning sessions"
  on public.learning_sessions
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update own learning sessions"
  on public.learning_sessions
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.learning_sessions to authenticated;

create or replace function public.analytics_jsonb_number(source jsonb, field_name text)
returns numeric
language sql
immutable
as $$
  select case
    when source is null or field_name is null or not (source ? field_name) then 0
    when jsonb_typeof(source -> field_name) = 'number' then (source ->> field_name)::numeric
    when jsonb_typeof(source -> field_name) = 'string'
      and btrim(source ->> field_name) ~ '^-?\d+(\.\d+)?$'
      then (source ->> field_name)::numeric
    else 0
  end;
$$;

create or replace function public.analytics_ms_to_utc_date(value_ms bigint)
returns date
language sql
immutable
as $$
  select (to_timestamp(value_ms::double precision / 1000.0) at time zone 'UTC')::date;
$$;

create or replace function public.analytics_display_username(target_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select coalesce(
        nullif(btrim(users.raw_user_meta_data ->> 'display_name'), ''),
        nullif(btrim(users.raw_user_meta_data ->> 'full_name'), ''),
        nullif(btrim(users.raw_user_meta_data ->> 'name'), ''),
        nullif(btrim(users.raw_user_meta_data ->> 'username'), '')
      )
      from auth.users users
      where users.id = target_user_id
    ),
    target_user_id::text
  );
$$;

create index if not exists learning_sessions_started_utc_date_idx
  on public.learning_sessions (public.analytics_ms_to_utc_date(started_at_ms));

create index if not exists learning_sessions_user_started_utc_date_idx
  on public.learning_sessions (user_id, public.analytics_ms_to_utc_date(started_at_ms));

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

create or replace function public.require_admin_user()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.admin_users
    where admin_users.user_id = current_user_id
  ) then
    raise exception 'Admin privileges required' using errcode = '42501';
  end if;

  return current_user_id;
end;
$$;

create or replace function public.get_admin_activity_overview(start_date date default null, end_date date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  from_date date := coalesce(start_date, current_date - 29);
  to_date date := coalesce(end_date, current_date);
  result jsonb;
begin
  perform public.require_admin_user();

  if from_date > to_date then
    raise exception 'start_date must be before or equal to end_date';
  end if;

  with all_users as (
    select distinct user_id from public.study_records
    union
    select user_id from public.admin_users
  ),
  range_records as (
    select *
    from public.study_records
    where record_date between from_date and to_date
  ),
  effective_records as (
    select *
    from range_records
    where deleted_at_ms is null
  ),
  exercise_records as (
    select *
    from effective_records
    where record_type = 'exercise'
  ),
  counts as (
    select
      (select count(*) from all_users) as total_users,
      (select count(distinct user_id) from effective_records) as active_users,
      (select count(*) from effective_records) as total_records,
      (select count(*) from effective_records where record_type = 'exercise') as exercise_records,
      (select count(*) from effective_records where record_type = 'material') as material_records,
      (select count(*) from effective_records where record_type = 'summary') as summary_records,
      (select count(*) from range_records where deleted_at_ms is not null) as deleted_records,
      coalesce((select sum(public.analytics_jsonb_number(data, 'totalQuestions')) from exercise_records), 0) as total_questions,
      coalesce((select sum(public.analytics_jsonb_number(data, 'correctQuestions')) from exercise_records), 0) as correct_questions,
      (select max(greatest(created_at_ms, floor(extract(epoch from updated_at) * 1000)::bigint)) from effective_records) as latest_activity_ms,
      (select count(*) from effective_records where record_type = 'summary' and length(coalesce(data ->> 'content', '')) > 0) as completed_summary_records,
      coalesce((select round(avg(length(coalesce(data ->> 'content', '')))::numeric, 2) from effective_records where record_type = 'summary'), 0) as average_summary_content_length
  )
  select jsonb_build_object(
    'start_date', from_date,
    'end_date', to_date,
    'total_users', total_users,
    'active_users', active_users,
    'silent_users', greatest(total_users - active_users, 0),
    'total_records', total_records,
    'exercise_records', exercise_records,
    'material_records', material_records,
    'summary_records', summary_records,
    'deleted_records', deleted_records,
    'average_records_per_active_user', case when active_users = 0 then 0 else round(total_records::numeric / active_users, 2) end,
    'total_questions', total_questions,
    'correct_questions', correct_questions,
    'average_accuracy', case when total_questions = 0 then 0 else round(correct_questions * 100 / total_questions, 2) end,
    'latest_activity_ms', latest_activity_ms,
    'completed_summary_records', completed_summary_records,
    'average_summary_content_length', average_summary_content_length,
    'record_type_breakdown', coalesce((
      select jsonb_agg(jsonb_build_object(
        'record_type', record_type,
        'record_count', record_count
      ) order by record_type)
      from (
        select record_type, count(*) as record_count
        from effective_records
        group by record_type
      ) type_stats
    ), '[]'::jsonb),
    'exercise_type_breakdown', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', exercise_type,
        'record_count', record_count,
        'total_questions', total_questions,
        'correct_questions', correct_questions,
        'average_accuracy', case when total_questions = 0 then 0 else round(correct_questions * 100 / total_questions, 2) end
      ) order by record_count desc, exercise_type)
      from (
        select
          coalesce(nullif(data ->> 'type', ''), 'unknown') as exercise_type,
          count(*) as record_count,
          coalesce(sum(public.analytics_jsonb_number(data, 'totalQuestions')), 0) as total_questions,
          coalesce(sum(public.analytics_jsonb_number(data, 'correctQuestions')), 0) as correct_questions
        from exercise_records
        group by coalesce(nullif(data ->> 'type', ''), 'unknown')
      ) exercise_stats
    ), '[]'::jsonb),
    'material_category_breakdown', coalesce((
      select jsonb_agg(jsonb_build_object(
        'category', category,
        'record_count', record_count
      ) order by record_count desc, category)
      from (
        select
          coalesce(nullif(data ->> 'category', ''), 'uncategorized') as category,
          count(*) as record_count
        from effective_records
        where record_type = 'material'
        group by coalesce(nullif(data ->> 'category', ''), 'uncategorized')
      ) material_stats
    ), '[]'::jsonb)
  )
  into result
  from counts;

  return result;
end;
$$;

create or replace function public.get_admin_daily_activity(start_date date default null, end_date date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  from_date date := coalesce(start_date, current_date - 29);
  to_date date := coalesce(end_date, current_date);
  result jsonb;
begin
  perform public.require_admin_user();

  if from_date > to_date then
    raise exception 'start_date must be before or equal to end_date';
  end if;

  with days as (
    select generate_series(from_date, to_date, interval '1 day')::date as activity_date
  ),
  day_stats as (
    select
      days.activity_date,
      count(distinct records.user_id) filter (where records.deleted_at_ms is null) as active_users,
      count(records.id) filter (where records.deleted_at_ms is null) as record_count,
      count(records.id) filter (where records.deleted_at_ms is null and records.record_type = 'exercise') as exercise_records,
      count(records.id) filter (where records.deleted_at_ms is null and records.record_type = 'material') as material_records,
      count(records.id) filter (where records.deleted_at_ms is null and records.record_type = 'summary') as summary_records,
      count(records.id) filter (where records.deleted_at_ms is not null) as deleted_records,
      coalesce(sum(public.analytics_jsonb_number(records.data, 'totalQuestions')) filter (where records.deleted_at_ms is null and records.record_type = 'exercise'), 0) as total_questions,
      coalesce(sum(public.analytics_jsonb_number(records.data, 'correctQuestions')) filter (where records.deleted_at_ms is null and records.record_type = 'exercise'), 0) as correct_questions
    from days
    left join public.study_records records
      on records.record_date = days.activity_date
    group by days.activity_date
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', activity_date,
    'active_users', active_users,
    'record_count', record_count,
    'exercise_records', exercise_records,
    'material_records', material_records,
    'summary_records', summary_records,
    'deleted_records', deleted_records,
    'average_records_per_active_user', case when active_users = 0 then 0 else round(record_count::numeric / active_users, 2) end,
    'total_questions', total_questions,
    'correct_questions', correct_questions,
    'average_accuracy', case when total_questions = 0 then 0 else round(correct_questions * 100 / total_questions, 2) end
  ) order by activity_date), '[]'::jsonb)
  into result
  from day_stats;

  return result;
end;
$$;

create or replace function public.get_admin_user_activity(start_date date default null, end_date date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  from_date date := coalesce(start_date, current_date - 29);
  to_date date := coalesce(end_date, current_date);
  result jsonb;
begin
  perform public.require_admin_user();

  if from_date > to_date then
    raise exception 'start_date must be before or equal to end_date';
  end if;

  with all_users as (
    select distinct user_id from public.study_records
    union
    select user_id from public.admin_users
  ),
  range_stats as (
    select
      users.user_id,
      count(records.id) filter (where records.deleted_at_ms is null) as record_count,
      count(records.id) filter (where records.deleted_at_ms is null and records.record_type = 'exercise') as exercise_records,
      count(records.id) filter (where records.deleted_at_ms is null and records.record_type = 'material') as material_records,
      count(records.id) filter (where records.deleted_at_ms is null and records.record_type = 'summary') as summary_records,
      count(records.id) filter (where records.deleted_at_ms is not null) as deleted_records,
      count(distinct records.record_date) filter (where records.deleted_at_ms is null) as active_days,
      coalesce(sum(public.analytics_jsonb_number(records.data, 'totalQuestions')) filter (where records.deleted_at_ms is null and records.record_type = 'exercise'), 0) as total_questions,
      coalesce(sum(public.analytics_jsonb_number(records.data, 'correctQuestions')) filter (where records.deleted_at_ms is null and records.record_type = 'exercise'), 0) as correct_questions,
      count(records.id) filter (where records.deleted_at_ms is null and records.record_type = 'summary' and length(coalesce(records.data ->> 'content', '')) > 0) as completed_summary_records,
      max(greatest(records.created_at_ms, floor(extract(epoch from records.updated_at) * 1000)::bigint)) filter (where records.deleted_at_ms is null) as latest_activity_ms
    from all_users users
    left join public.study_records records
      on records.user_id = users.user_id
      and records.record_date between from_date and to_date
    group by users.user_id
  ),
  lifetime_stats as (
    select
      user_id,
      count(*) filter (where deleted_at_ms is null) as lifetime_record_count,
      max(greatest(created_at_ms, floor(extract(epoch from updated_at) * 1000)::bigint)) filter (where deleted_at_ms is null) as lifetime_latest_activity_ms
    from public.study_records
    group by user_id
  ),
  decorated as (
    select
      range_stats.*,
      coalesce(lifetime_stats.lifetime_record_count, 0) as lifetime_record_count,
      lifetime_stats.lifetime_latest_activity_ms,
      case
        when total_questions = 0 then 0
        else round(correct_questions * 100 / total_questions, 2)
      end as average_accuracy,
      case
        when record_count >= 20 or active_days >= 10 then 'high_activity'
        when record_count > 0 and active_days >= 3 then 'stable_activity'
        when record_count > 0 then 'low_activity'
        when lifetime_stats.lifetime_latest_activity_ms is not null then 'silent'
        else 'no_records'
      end as user_status
    from range_stats
    left join lifetime_stats
      on lifetime_stats.user_id = range_stats.user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', user_id,
    'username', public.analytics_display_username(user_id),
    'status', user_status,
    'latest_activity_ms', coalesce(latest_activity_ms, lifetime_latest_activity_ms),
    'active_days', active_days,
    'record_count', record_count,
    'exercise_records', exercise_records,
    'material_records', material_records,
    'summary_records', summary_records,
    'deleted_records', deleted_records,
    'total_questions', total_questions,
    'correct_questions', correct_questions,
    'average_accuracy', average_accuracy,
    'completed_summary_records', completed_summary_records,
    'lifetime_record_count', lifetime_record_count,
    'risk_tags', to_jsonb(array_remove(array[
      case when record_count = 0 and lifetime_latest_activity_ms is not null and public.analytics_ms_to_utc_date(lifetime_latest_activity_ms) < from_date - 30 then 'long_inactive' end,
      case when exercise_records >= 5 and summary_records = 0 then 'summary_missing' end,
      case when total_questions >= 20 and average_accuracy < 60 then 'low_accuracy' end,
      case when deleted_records >= 5 then 'frequent_delete' end,
      case when total_questions > 0 and correct_questions > total_questions then 'data_anomaly' end
    ]::text[], null))
  ) order by record_count desc, active_days desc, coalesce(latest_activity_ms, lifetime_latest_activity_ms) desc nulls last), '[]'::jsonb)
  into result
  from decorated;

  return result;
end;
$$;

create or replace function public.get_admin_event_overview(start_date date default null, end_date date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  from_date date := coalesce(start_date, current_date - 29);
  to_date date := coalesce(end_date, current_date);
  result jsonb;
begin
  perform public.require_admin_user();

  if from_date > to_date then
    raise exception 'start_date must be before or equal to end_date';
  end if;

  with event_rows as (
    select *
    from public.analytics_events
    where local_date between from_date and to_date
  ),
  counts as (
    select
      count(*) as total_events,
      count(distinct user_id) as active_users,
      count(distinct session_id) filter (where session_id is not null) as session_count,
      count(*) filter (where event_name = 'page_view') as page_views,
      count(*) filter (where event_name = 'record_create') as record_creates,
      count(*) filter (where event_name = 'record_update') as record_updates,
      count(*) filter (where event_name = 'record_delete') as record_deletes,
      count(*) filter (where event_name = 'sync_failed') as sync_failures,
      count(*) filter (where event_name = 'error') as error_events,
      min(event_time_ms) as first_event_time_ms,
      max(event_time_ms) as latest_event_time_ms
    from event_rows
  )
  select jsonb_build_object(
    'start_date', from_date,
    'end_date', to_date,
    'total_events', total_events,
    'active_users', active_users,
    'session_count', session_count,
    'page_views', page_views,
    'record_creates', record_creates,
    'record_updates', record_updates,
    'record_deletes', record_deletes,
    'sync_failures', sync_failures,
    'error_events', error_events,
    'first_event_time_ms', first_event_time_ms,
    'latest_event_time_ms', latest_event_time_ms,
    'event_name_breakdown', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_name', event_name,
        'event_count', event_count,
        'user_count', user_count
      ) order by event_count desc, event_name)
      from (
        select event_name, count(*) as event_count, count(distinct user_id) as user_count
        from event_rows
        group by event_name
      ) event_stats
    ), '[]'::jsonb),
    'page_breakdown', coalesce((
      select jsonb_agg(jsonb_build_object(
        'page', page,
        'event_count', event_count,
        'user_count', user_count
      ) order by event_count desc, page)
      from (
        select coalesce(nullif(page, ''), 'unknown') as page, count(*) as event_count, count(distinct user_id) as user_count
        from event_rows
        group by coalesce(nullif(page, ''), 'unknown')
      ) page_stats
    ), '[]'::jsonb)
  )
  into result
  from counts;

  return result;
end;
$$;

create or replace function public.get_admin_feature_usage(start_date date default null, end_date date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  from_date date := coalesce(start_date, current_date - 29);
  to_date date := coalesce(end_date, current_date);
  result jsonb;
begin
  perform public.require_admin_user();

  if from_date > to_date then
    raise exception 'start_date must be before or equal to end_date';
  end if;

  with event_rows as (
    select *
    from public.analytics_events
    where local_date between from_date and to_date
  )
  select jsonb_build_object(
    'start_date', from_date,
    'end_date', to_date,
    'features', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_name', event_name,
        'event_count', event_count,
        'user_count', user_count,
        'session_count', session_count,
        'latest_event_time_ms', latest_event_time_ms
      ) order by event_count desc, event_name)
      from (
        select
          event_name,
          count(*) as event_count,
          count(distinct user_id) as user_count,
          count(distinct session_id) filter (where session_id is not null) as session_count,
          max(event_time_ms) as latest_event_time_ms
        from event_rows
        where event_name not in ('session_start', 'session_end', 'login', 'logout')
        group by event_name
      ) feature_stats
    ), '[]'::jsonb),
    'pages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'page', page,
        'view_count', view_count,
        'user_count', user_count
      ) order by view_count desc, page)
      from (
        select
          coalesce(nullif(page, ''), 'unknown') as page,
          count(*) as view_count,
          count(distinct user_id) as user_count
        from event_rows
        where event_name = 'page_view'
        group by coalesce(nullif(page, ''), 'unknown')
      ) page_stats
    ), '[]'::jsonb),
    'record_types', coalesce((
      select jsonb_agg(jsonb_build_object(
        'record_type', record_type,
        'event_count', event_count,
        'user_count', user_count
      ) order by event_count desc, record_type)
      from (
        select
          coalesce(record_type, 'unknown') as record_type,
          count(*) as event_count,
          count(distinct user_id) as user_count
        from event_rows
        where record_type is not null
        group by coalesce(record_type, 'unknown')
      ) record_type_stats
    ), '[]'::jsonb)
  )
  into result;

  return result;
end;
$$;

create or replace function public.get_admin_behavior_funnel(start_date date default null, end_date date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  from_date date := coalesce(start_date, current_date - 29);
  to_date date := coalesce(end_date, current_date);
  result jsonb;
begin
  perform public.require_admin_user();

  if from_date > to_date then
    raise exception 'start_date must be before or equal to end_date';
  end if;

  with event_rows as (
    select *
    from public.analytics_events
    where local_date between from_date and to_date
  ),
  steps as (
    select *
    from (values
      (1, 'login', array['login']::text[]),
      (2, 'page_view', array['page_view']::text[]),
      (3, 'exercise_start', array['exercise_start']::text[]),
      (4, 'exercise_submit', array['exercise_submit']::text[]),
      (5, 'record_create', array['record_create']::text[]),
      (6, 'summary_save', array['summary_save']::text[]),
      (7, 'sync_success', array['sync_success']::text[])
    ) as value(step_order, step_name, event_names)
  ),
  step_stats as (
    select
      steps.step_order,
      steps.step_name,
      count(event_rows.id) as event_count,
      count(distinct event_rows.user_id) as user_count,
      count(distinct event_rows.session_id) filter (where event_rows.session_id is not null) as session_count
    from steps
    left join event_rows
      on event_rows.event_name = any(steps.event_names)
    group by steps.step_order, steps.step_name
  )
  select jsonb_build_object(
    'start_date', from_date,
    'end_date', to_date,
    'steps', coalesce(jsonb_agg(jsonb_build_object(
      'step_order', step_order,
      'step_name', step_name,
      'event_count', event_count,
      'user_count', user_count,
      'session_count', session_count
    ) order by step_order), '[]'::jsonb)
  )
  into result
  from step_stats;

  return result;
end;
$$;

create or replace function public.get_admin_error_events(start_date date default null, end_date date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  from_date date := coalesce(start_date, current_date - 29);
  to_date date := coalesce(end_date, current_date);
  result jsonb;
begin
  perform public.require_admin_user();

  if from_date > to_date then
    raise exception 'start_date must be before or equal to end_date';
  end if;

  with error_rows as (
    select *
    from public.analytics_events
    where local_date between from_date and to_date
      and (
        event_name in ('error', 'sync_failed')
        or metadata ? 'error'
        or metadata ? 'errorMessage'
      )
  )
  select jsonb_build_object(
    'start_date', from_date,
    'end_date', to_date,
    'total_errors', (select count(*) from error_rows),
    'affected_users', (select count(distinct user_id) from error_rows),
    'by_event_name', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_name', event_name,
        'event_count', event_count,
        'user_count', user_count
      ) order by event_count desc, event_name)
      from (
        select event_name, count(*) as event_count, count(distinct user_id) as user_count
        from error_rows
        group by event_name
      ) error_stats
    ), '[]'::jsonb),
    'recent_events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'user_id', user_id,
        'username', public.analytics_display_username(user_id),
        'event_name', event_name,
        'event_time_ms', event_time_ms,
        'local_date', local_date,
        'session_id', session_id,
        'page', page,
        'source', source,
        'record_type', record_type,
        'record_id', record_id,
        'metadata', metadata,
        'app_version', app_version,
        'created_at', created_at
      ) order by event_time_ms desc)
      from (
        select *
        from error_rows
        order by event_time_ms desc, created_at desc
        limit 200
      ) recent
    ), '[]'::jsonb)
  )
  into result;

  return result;
end;
$$;

create or replace function public.get_admin_user_event_timeline(user_id uuid, start_date date default null, end_date date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_user_id uuid := $1;
  from_date date := coalesce(start_date, current_date - 29);
  to_date date := coalesce(end_date, current_date);
  result jsonb;
begin
  perform public.require_admin_user();

  if target_user_id is null then
    raise exception 'user_id is required';
  end if;

  if from_date > to_date then
    raise exception 'start_date must be before or equal to end_date';
  end if;

  select jsonb_build_object(
    'user_id', target_user_id,
    'username', public.analytics_display_username(target_user_id),
    'start_date', from_date,
    'end_date', to_date,
    'events', coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'username', public.analytics_display_username(target_user_id),
      'event_name', event_name,
      'event_time_ms', event_time_ms,
      'local_date', local_date,
      'session_id', session_id,
      'page', page,
      'source', source,
      'record_type', record_type,
      'record_id', record_id,
      'metadata', metadata,
      'app_version', app_version,
      'created_at', created_at
    ) order by event_time_ms desc, created_at desc), '[]'::jsonb)
  )
  into result
  from (
    select *
    from public.analytics_events
    where analytics_events.user_id = target_user_id
      and local_date between from_date and to_date
    order by event_time_ms desc, created_at desc
    limit 500
  ) user_events;

  return result;
end;
$$;

create or replace function public.get_admin_session_overview(start_date date default null, end_date date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  from_date date := coalesce(start_date, current_date - 29);
  to_date date := coalesce(end_date, current_date);
  result jsonb;
begin
  perform public.require_admin_user();

  if from_date > to_date then
    raise exception 'start_date must be before or equal to end_date';
  end if;

  with session_rows as (
    select *
    from public.learning_sessions
    where public.analytics_ms_to_utc_date(started_at_ms) between from_date and to_date
  ),
  counts as (
    select
      count(*) as session_count,
      count(distinct user_id) as active_users,
      count(*) filter (where ended_at_ms is not null) as completed_sessions,
      coalesce(sum(duration_ms), 0) as total_duration_ms,
      coalesce(sum(active_duration_ms), 0) as total_active_duration_ms,
      coalesce(sum(idle_duration_ms), 0) as total_idle_duration_ms,
      coalesce(round(avg(duration_ms)::numeric, 2), 0) as average_duration_ms,
      coalesce(round(avg(active_duration_ms)::numeric, 2), 0) as average_active_duration_ms,
      coalesce(round(avg(idle_duration_ms)::numeric, 2), 0) as average_idle_duration_ms,
      coalesce(round(avg(page_count)::numeric, 2), 0) as average_page_count,
      coalesce(round(avg(event_count)::numeric, 2), 0) as average_event_count,
      coalesce(sum(record_count), 0) as record_count,
      coalesce(sum(completed_record_count), 0) as completed_record_count
    from session_rows
  )
  select jsonb_build_object(
    'start_date', from_date,
    'end_date', to_date,
    'session_count', session_count,
    'active_users', active_users,
    'completed_sessions', completed_sessions,
    'completion_rate', case when session_count = 0 then 0 else round(completed_sessions::numeric * 100 / session_count, 2) end,
    'total_duration_ms', total_duration_ms,
    'total_active_duration_ms', total_active_duration_ms,
    'total_idle_duration_ms', total_idle_duration_ms,
    'average_duration_ms', average_duration_ms,
    'average_active_duration_ms', average_active_duration_ms,
    'average_idle_duration_ms', average_idle_duration_ms,
    'average_page_count', average_page_count,
    'average_event_count', average_event_count,
    'record_count', record_count,
    'completed_record_count', completed_record_count,
    'records_per_active_hour', case when total_active_duration_ms = 0 then 0 else round(completed_record_count::numeric / (total_active_duration_ms::numeric / 3600000), 2) end
  )
  into result
  from counts;

  return result;
end;
$$;

create or replace function public.get_admin_session_trend(start_date date default null, end_date date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  from_date date := coalesce(start_date, current_date - 29);
  to_date date := coalesce(end_date, current_date);
  result jsonb;
begin
  perform public.require_admin_user();

  if from_date > to_date then
    raise exception 'start_date must be before or equal to end_date';
  end if;

  with days as (
    select generate_series(from_date, to_date, interval '1 day')::date as session_date
  ),
  session_rows as (
    select
      public.analytics_ms_to_utc_date(started_at_ms) as session_date,
      *
    from public.learning_sessions
    where public.analytics_ms_to_utc_date(started_at_ms) between from_date and to_date
  ),
  day_stats as (
    select
      days.session_date,
      count(session_rows.id) as session_count,
      count(distinct session_rows.user_id) as active_users,
      count(session_rows.id) filter (where session_rows.ended_at_ms is not null) as completed_sessions,
      coalesce(sum(session_rows.duration_ms), 0) as total_duration_ms,
      coalesce(sum(session_rows.active_duration_ms), 0) as total_active_duration_ms,
      coalesce(sum(session_rows.idle_duration_ms), 0) as total_idle_duration_ms,
      coalesce(sum(session_rows.record_count), 0) as record_count,
      coalesce(sum(session_rows.completed_record_count), 0) as completed_record_count
    from days
    left join session_rows
      on session_rows.session_date = days.session_date
    group by days.session_date
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', session_date,
    'session_count', session_count,
    'active_users', active_users,
    'completed_sessions', completed_sessions,
    'completion_rate', case when session_count = 0 then 0 else round(completed_sessions::numeric * 100 / session_count, 2) end,
    'total_duration_ms', total_duration_ms,
    'total_active_duration_ms', total_active_duration_ms,
    'total_idle_duration_ms', total_idle_duration_ms,
    'record_count', record_count,
    'completed_record_count', completed_record_count
  ) order by session_date), '[]'::jsonb)
  into result
  from day_stats;

  return result;
end;
$$;

create or replace function public.get_admin_active_time_heatmap(start_date date default null, end_date date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  from_date date := coalesce(start_date, current_date - 29);
  to_date date := coalesce(end_date, current_date);
  result jsonb;
begin
  perform public.require_admin_user();

  if from_date > to_date then
    raise exception 'start_date must be before or equal to end_date';
  end if;

  with grid as (
    select day_of_week, hour_of_day
    from generate_series(0, 6) as day_series(day_of_week)
    cross join generate_series(0, 23) as hour_series(hour_of_day)
  ),
  session_rows as (
    select
      extract(dow from to_timestamp(started_at_ms::double precision / 1000.0) at time zone 'UTC')::integer as day_of_week,
      extract(hour from to_timestamp(started_at_ms::double precision / 1000.0) at time zone 'UTC')::integer as hour_of_day,
      *
    from public.learning_sessions
    where public.analytics_ms_to_utc_date(started_at_ms) between from_date and to_date
  ),
  heatmap_stats as (
    select
      grid.day_of_week,
      grid.hour_of_day,
      count(session_rows.id) as session_count,
      count(distinct session_rows.user_id) as active_users,
      coalesce(sum(session_rows.active_duration_ms), 0) as total_active_duration_ms
    from grid
    left join session_rows
      on session_rows.day_of_week = grid.day_of_week
      and session_rows.hour_of_day = grid.hour_of_day
    group by grid.day_of_week, grid.hour_of_day
  )
  select jsonb_build_object(
    'start_date', from_date,
    'end_date', to_date,
    'timezone', 'UTC',
    'cells', coalesce(jsonb_agg(jsonb_build_object(
      'day_of_week', day_of_week,
      'hour', hour_of_day,
      'session_count', session_count,
      'active_users', active_users,
      'total_active_duration_ms', total_active_duration_ms
    ) order by day_of_week, hour_of_day), '[]'::jsonb)
  )
  into result
  from heatmap_stats;

  return result;
end;
$$;

create or replace function public.get_admin_user_sessions(user_id uuid, start_date date default null, end_date date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_user_id uuid := $1;
  from_date date := coalesce(start_date, current_date - 29);
  to_date date := coalesce(end_date, current_date);
  result jsonb;
begin
  perform public.require_admin_user();

  if target_user_id is null then
    raise exception 'user_id is required';
  end if;

  if from_date > to_date then
    raise exception 'start_date must be before or equal to end_date';
  end if;

  with user_sessions as (
    select *
    from public.learning_sessions
    where learning_sessions.user_id = target_user_id
      and public.analytics_ms_to_utc_date(started_at_ms) between from_date and to_date
  ),
  summary as (
    select
      count(*) as session_count,
      count(*) filter (where ended_at_ms is not null) as completed_sessions,
      coalesce(sum(duration_ms), 0) as total_duration_ms,
      coalesce(sum(active_duration_ms), 0) as total_active_duration_ms,
      coalesce(sum(idle_duration_ms), 0) as total_idle_duration_ms,
      coalesce(sum(page_count), 0) as page_count,
      coalesce(sum(event_count), 0) as event_count,
      coalesce(sum(record_count), 0) as record_count,
      coalesce(sum(completed_record_count), 0) as completed_record_count
    from user_sessions
  )
  select jsonb_build_object(
    'user_id', target_user_id,
    'username', public.analytics_display_username(target_user_id),
    'start_date', from_date,
    'end_date', to_date,
    'summary', jsonb_build_object(
      'session_count', session_count,
      'completed_sessions', completed_sessions,
      'completion_rate', case when session_count = 0 then 0 else round(completed_sessions::numeric * 100 / session_count, 2) end,
      'total_duration_ms', total_duration_ms,
      'total_active_duration_ms', total_active_duration_ms,
      'total_idle_duration_ms', total_idle_duration_ms,
      'page_count', page_count,
      'event_count', event_count,
      'record_count', record_count,
      'completed_record_count', completed_record_count
    ),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'username', public.analytics_display_username(target_user_id),
        'started_at_ms', started_at_ms,
        'ended_at_ms', ended_at_ms,
        'duration_ms', duration_ms,
        'active_duration_ms', active_duration_ms,
        'idle_duration_ms', idle_duration_ms,
        'page_count', page_count,
        'event_count', event_count,
        'record_count', record_count,
        'completed_record_count', completed_record_count,
        'metadata', metadata,
        'created_at', created_at
      ) order by started_at_ms desc)
      from (
        select *
        from user_sessions
        order by started_at_ms desc
        limit 200
      ) recent_sessions
    ), '[]'::jsonb)
  )
  into result
  from summary;

  return result;
end;
$$;

revoke execute on function public.is_admin_user() from public;
revoke execute on function public.require_admin_user() from public;
revoke execute on function public.analytics_display_username(uuid) from public;
revoke execute on function public.get_admin_activity_overview(date, date) from public;
revoke execute on function public.get_admin_daily_activity(date, date) from public;
revoke execute on function public.get_admin_user_activity(date, date) from public;
revoke execute on function public.get_admin_event_overview(date, date) from public;
revoke execute on function public.get_admin_feature_usage(date, date) from public;
revoke execute on function public.get_admin_behavior_funnel(date, date) from public;
revoke execute on function public.get_admin_error_events(date, date) from public;
revoke execute on function public.get_admin_user_event_timeline(uuid, date, date) from public;
revoke execute on function public.get_admin_session_overview(date, date) from public;
revoke execute on function public.get_admin_session_trend(date, date) from public;
revoke execute on function public.get_admin_active_time_heatmap(date, date) from public;
revoke execute on function public.get_admin_user_sessions(uuid, date, date) from public;

grant execute on function public.is_admin_user() to authenticated;
grant execute on function public.require_admin_user() to authenticated;
grant execute on function public.get_admin_activity_overview(date, date) to authenticated;
grant execute on function public.get_admin_daily_activity(date, date) to authenticated;
grant execute on function public.get_admin_user_activity(date, date) to authenticated;
grant execute on function public.get_admin_event_overview(date, date) to authenticated;
grant execute on function public.get_admin_feature_usage(date, date) to authenticated;
grant execute on function public.get_admin_behavior_funnel(date, date) to authenticated;
grant execute on function public.get_admin_error_events(date, date) to authenticated;
grant execute on function public.get_admin_user_event_timeline(uuid, date, date) to authenticated;
grant execute on function public.get_admin_session_overview(date, date) to authenticated;
grant execute on function public.get_admin_session_trend(date, date) to authenticated;
grant execute on function public.get_admin_active_time_heatmap(date, date) to authenticated;
grant execute on function public.get_admin_user_sessions(uuid, date, date) to authenticated;
