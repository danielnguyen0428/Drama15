-- Promote every account to the Pro tier during the open beta and make Pro the
-- default for new registrations.
--
-- 1. Existing accounts: lift anyone still on the free tier up to pro. Premium
--    accounts are left untouched so we never downgrade a higher tier.
-- 2. New accounts: change the column default from 'free' to 'pro' so future
--    inserts land on Pro even if the application layer omits the tier.

update public.user_profiles
  set tier = 'pro',
      updated_at = now()
  where tier = 'free';

alter table public.user_profiles
  alter column tier set default 'pro';
