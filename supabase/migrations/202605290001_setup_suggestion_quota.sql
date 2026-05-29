create table if not exists public.setup_suggestion_usage_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  suggested_count integer not null default 0 check (suggested_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

create or replace function public.consume_setup_suggestion_quota(
  p_user_id uuid,
  p_usage_date date,
  p_quota_limit integer
)
returns table(suggested_count integer, quota_limit integer, allowed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.setup_suggestion_usage_days(user_id, usage_date, suggested_count, updated_at)
  values (p_user_id, p_usage_date, 0, now())
  on conflict (user_id, usage_date) do nothing;

  select ssud.suggested_count
    into v_count
    from public.setup_suggestion_usage_days as ssud
    where ssud.user_id = p_user_id and ssud.usage_date = p_usage_date
    for update;

  if v_count >= p_quota_limit then
    return query select v_count, p_quota_limit, false;
    return;
  end if;

  update public.setup_suggestion_usage_days as ssud
    set suggested_count = ssud.suggested_count + 1,
        updated_at = now()
    where ssud.user_id = p_user_id and ssud.usage_date = p_usage_date
    returning ssud.suggested_count into v_count;

  return query select v_count, p_quota_limit, true;
end;
$$;

alter table public.setup_suggestion_usage_days enable row level security;

drop policy if exists "Users can read own setup suggestion usage" on public.setup_suggestion_usage_days;
create policy "Users can read own setup suggestion usage"
on public.setup_suggestion_usage_days for select
using (auth.uid() = user_id);
