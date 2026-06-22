create table if not exists public.user_llm_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'other' check (provider in ('c', 's', 'other')),
  base_url text not null default 'https://api.openai.com/v1',
  model text not null default 'gpt-4o-mini',
  api_key_ciphertext text,
  temperature double precision not null default 0.8 check (temperature between 0 and 2),
  max_tokens integer not null default 8192 check (max_tokens between 256 and 32768),
  updated_at timestamptz not null default now()
);

alter table public.user_llm_settings enable row level security;

-- Settings are accessed only through authenticated API routes backed by the
-- Supabase service role. No anon/authenticated policy is created, so browser
-- clients cannot read ciphertext directly even for their own row.
