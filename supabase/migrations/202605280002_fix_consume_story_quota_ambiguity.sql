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
    from public.story_usage_days as sud
    where sud.user_id = p_user_id and sud.usage_date = p_usage_date
    for update;

  if v_count >= p_quota_limit then
    return query select v_count, p_quota_limit, false;
    return;
  end if;

  update public.story_usage_days as sud
    set created_count = sud.created_count + 1,
        updated_at = now()
    where sud.user_id = p_user_id and sud.usage_date = p_usage_date
    returning sud.created_count into v_count;

  return query select v_count, p_quota_limit, true;
end;
$$;
