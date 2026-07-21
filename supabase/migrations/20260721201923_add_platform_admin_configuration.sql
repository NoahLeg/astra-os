create table if not exists public.platform_secrets (
  id uuid primary key default gen_random_uuid(),
  namespace text not null,
  key text not null,
  encrypted_value text not null,
  encryption_iv text not null,
  auth_tag text not null,
  secret_hint text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (namespace, key),
  check (length(namespace) between 2 and 120),
  check (length(key) between 2 and 80)
);

alter table public.model_pricing
  add column if not exists margin_basis_points integer not null default 0;

create table if not exists public.platform_ai_providers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  kind text not null,
  base_url text,
  status text not null default 'inactive',
  notes text not null default '',
  last_used_at timestamptz,
  last_verified_at timestamptz,
  last_verification_status text not null default 'never',
  last_error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind in ('openai', 'anthropic', 'openai_compatible')),
  check (status in ('active', 'inactive')),
  check (last_verification_status in ('never', 'valid', 'invalid'))
);

create table if not exists public.platform_ai_models (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.platform_ai_providers(id) on delete cascade,
  model_id text not null,
  display_name text not null,
  description text not null default '',
  enabled boolean not null default true,
  user_visible boolean not null default true,
  is_default boolean not null default false,
  premium boolean not null default false,
  context_window_tokens bigint,
  max_output_tokens bigint,
  request_token_limit bigint,
  capabilities text[] not null default array['text']::text[],
  input_nano_usd_per_million bigint not null default 0,
  cached_input_nano_usd_per_million bigint,
  output_nano_usd_per_million bigint not null default 0,
  margin_basis_points integer not null default 0,
  sort_order integer not null default 0,
  source text not null default 'manual',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, model_id),
  check (context_window_tokens is null or context_window_tokens > 0),
  check (max_output_tokens is null or max_output_tokens > 0),
  check (request_token_limit is null or request_token_limit > 0),
  check (input_nano_usd_per_million >= 0),
  check (cached_input_nano_usd_per_million is null or cached_input_nano_usd_per_million >= 0),
  check (output_nano_usd_per_million >= 0),
  check (margin_basis_points between 0 and 100000)
);

create unique index if not exists platform_ai_models_one_default_idx
  on public.platform_ai_models(is_default) where is_default = true;
create index if not exists platform_ai_models_provider_idx
  on public.platform_ai_models(provider_id, enabled, user_visible, sort_order);

create table if not exists public.platform_oauth_integrations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  provider text not null,
  name text not null,
  client_id text not null default '',
  authorization_url text not null default '',
  token_url text not null default '',
  redirect_uri text not null default '',
  scopes text[] not null default '{}',
  status text not null default 'inactive',
  configuration jsonb not null default '{}'::jsonb,
  last_verified_at timestamptz,
  last_verification_status text not null default 'never',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('active', 'inactive')),
  check (last_verification_status in ('never', 'valid', 'invalid'))
);

create table if not exists public.platform_payment_configurations (
  provider text primary key,
  mode text not null default 'test',
  status text not null default 'inactive',
  publishable_key text not null default '',
  configuration jsonb not null default '{}'::jsonb,
  last_verified_at timestamptz,
  last_verification_status text not null default 'never',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (provider in ('stripe')),
  check (mode in ('test', 'production')),
  check (status in ('active', 'inactive')),
  check (last_verification_status in ('never', 'valid', 'invalid'))
);

alter table public.subscription_plans
  add column if not exists annual_price_cents integer not null default 0,
  add column if not exists currency text not null default 'eur',
  add column if not exists max_automations integer not null default 0,
  add column if not exists storage_limit_mb bigint not null default 100,
  add column if not exists context_limit_tokens bigint not null default 32000,
  add column if not exists max_models integer not null default 1,
  add column if not exists premium_models boolean not null default false,
  add column if not exists connectors_enabled boolean not null default false,
  add column if not exists tools_enabled boolean not null default false,
  add column if not exists badges text[] not null default '{}',
  add column if not exists included_features text[] not null default '{}',
  add column if not exists exclusive_features text[] not null default '{}',
  add column if not exists limits jsonb not null default '{}'::jsonb,
  add column if not exists highlighted boolean not null default false,
  add column if not exists active boolean not null default true,
  add column if not exists stripe_monthly_price_id text,
  add column if not exists stripe_annual_price_id text;

insert into public.platform_ai_providers (slug, name, kind, base_url, status, notes)
values
  ('openai', 'OpenAI', 'openai', 'https://api.openai.com/v1', 'inactive', 'Clé globale de secours. Une clé propre à une entreprise reste prioritaire.'),
  ('anthropic', 'Anthropic', 'anthropic', 'https://api.anthropic.com', 'inactive', 'Fournisseur Claude via l’API Messages.')
on conflict (slug) do nothing;

insert into public.platform_ai_models (
  provider_id, model_id, display_name, enabled, user_visible, is_default,
  input_nano_usd_per_million, cached_input_nano_usd_per_million,
  output_nano_usd_per_million, source, sort_order
)
select provider.id, pricing.model_pattern, pricing.display_name, pricing.active, true,
  pricing.model_pattern = 'gpt-5.4-mini', pricing.input_nano_usd_per_million,
  pricing.cached_input_nano_usd_per_million, pricing.output_nano_usd_per_million,
  'migration', row_number() over (order by pricing.display_name)::integer
from public.model_pricing pricing
join public.platform_ai_providers provider on provider.slug = pricing.provider
where pricing.active = true
  and pricing.effective_until is null
on conflict (provider_id, model_id) do nothing;

insert into public.platform_oauth_integrations (
  slug, provider, name, authorization_url, token_url, scopes, status, configuration
)
values
  ('google-workspace', 'google', 'Google Workspace', 'https://accounts.google.com/o/oauth2/v2/auth', 'https://oauth2.googleapis.com/token', array['openid','email','profile','https://www.googleapis.com/auth/gmail.modify','https://www.googleapis.com/auth/calendar','https://www.googleapis.com/auth/drive.file'], 'inactive', '{"services":["Gmail","Calendar","Drive","Docs","Sheets"]}'::jsonb),
  ('microsoft', 'microsoft', 'Microsoft 365', 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', 'https://login.microsoftonline.com/common/oauth2/v2.0/token', array['openid','email','offline_access','Mail.ReadWrite','Calendars.ReadWrite','Files.ReadWrite'], 'inactive', '{}'::jsonb),
  ('github', 'github', 'GitHub', 'https://github.com/login/oauth/authorize', 'https://github.com/login/oauth/access_token', array['read:user','user:email','repo'], 'inactive', '{}'::jsonb),
  ('slack', 'slack', 'Slack', 'https://slack.com/oauth/v2/authorize', 'https://slack.com/api/oauth.v2.access', array['channels:read','chat:write','users:read'], 'inactive', '{}'::jsonb),
  ('notion', 'notion', 'Notion', 'https://api.notion.com/v1/oauth/authorize', 'https://api.notion.com/v1/oauth/token', '{}'::text[], 'inactive', '{}'::jsonb),
  ('discord', 'discord', 'Discord', 'https://discord.com/oauth2/authorize', 'https://discord.com/api/oauth2/token', array['identify','email','guilds'], 'inactive', '{}'::jsonb),
  ('dropbox', 'dropbox', 'Dropbox', 'https://www.dropbox.com/oauth2/authorize', 'https://api.dropboxapi.com/oauth2/token', '{}'::text[], 'inactive', '{}'::jsonb)
on conflict (slug) do nothing;

insert into public.platform_payment_configurations (provider, mode, status)
values ('stripe', 'test', 'inactive')
on conflict (provider) do nothing;

update public.subscription_plans set
  annual_price_cents = case when monthly_price_cents > 0 then monthly_price_cents * 10 else 0 end,
  max_automations = case id when 'free' then 1 when 'starter' then 5 when 'pro' then 25 when 'business' then 100 else 1000 end,
  storage_limit_mb = case id when 'free' then 100 when 'starter' then 1000 when 'pro' then 5000 when 'business' then 25000 else 100000 end,
  context_limit_tokens = case id when 'free' then 32000 when 'starter' then 64000 when 'pro' then 128000 when 'business' then 256000 else 1000000 end,
  max_models = case id when 'free' then 1 when 'starter' then 2 when 'pro' then 5 when 'business' then 20 else 100 end,
  premium_models = id in ('pro','business','enterprise'),
  connectors_enabled = id in ('pro','business','enterprise'),
  tools_enabled = id in ('pro','business','enterprise'),
  included_features = features,
  active = true,
  updated_at = now();

alter table public.platform_secrets enable row level security;
alter table public.platform_ai_providers enable row level security;
alter table public.platform_ai_models enable row level security;
alter table public.platform_oauth_integrations enable row level security;
alter table public.platform_payment_configurations enable row level security;

revoke all on table public.platform_secrets, public.platform_ai_providers,
  public.platform_ai_models, public.platform_oauth_integrations,
  public.platform_payment_configurations from anon, authenticated;
grant all on table public.platform_secrets, public.platform_ai_providers,
  public.platform_ai_models, public.platform_oauth_integrations,
  public.platform_payment_configurations to service_role;

comment on table public.platform_secrets is 'Secrets globaux chiffrés AES-256-GCM. Jamais exposés au navigateur.';
comment on table public.platform_ai_models is 'Catalogue dynamique des modèles, tarifs et marges administrés sans redéploiement.';
comment on table public.platform_oauth_integrations is 'Configuration des clients OAuth de la plateforme. Les secrets sont stockés séparément dans platform_secrets.';
