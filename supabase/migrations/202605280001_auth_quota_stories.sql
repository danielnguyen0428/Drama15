create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  tier text not null default 'free' check (tier in ('free', 'pro', 'premium')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stories (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  config jsonb not null,
  request jsonb,
  story_payload jsonb,
  relationship_graph jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists stories_user_updated_idx on public.stories(user_id, updated_at desc);

create table if not exists public.story_usage_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  created_count integer not null default 0 check (created_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

create or replace function public.consume_story_quota(
  p_user_id uuid,
  p_usage_date date,
  p_quota_limit integer
)
returns table(created_count integer, quota_limit integer, allowed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.story_usage_days(user_id, usage_date, created_count, updated_at)
  values (p_user_id, p_usage_date, 0, now())
  on conflict (user_id, usage_date) do nothing;

  select sud.created_count
    into v_count
    from public.story_usage_days sud
    where sud.user_id = p_user_id and sud.usage_date = p_usage_date
    for update;

  if v_count >= p_quota_limit then
    return query select v_count, p_quota_limit, false;
    return;
  end if;

  update public.story_usage_days
    set created_count = created_count + 1,
        updated_at = now()
    where user_id = p_user_id and usage_date = p_usage_date
    returning story_usage_days.created_count into v_count;

  return query select v_count, p_quota_limit, true;
end;
$$;

alter table public.user_profiles enable row level security;
alter table public.stories enable row level security;
alter table public.story_usage_days enable row level security;

drop policy if exists "Users can read own profile" on public.user_profiles;
create policy "Users can read own profile"
on public.user_profiles for select
using (auth.uid() = id);

drop policy if exists "Users can read own stories" on public.stories;
create policy "Users can read own stories"
on public.stories for select
using (auth.uid() = user_id);

drop policy if exists "Users can read own usage" on public.story_usage_days;
create policy "Users can read own usage"
on public.story_usage_days for select
using (auth.uid() = user_id);
