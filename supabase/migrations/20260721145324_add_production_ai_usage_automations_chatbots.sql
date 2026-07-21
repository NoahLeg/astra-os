alter table public.subscription_plans
  add column if not exists monthly_token_limit bigint not null default 100000,
  add column if not exists daily_token_limit bigint not null default 25000;

alter table public.workspace_subscriptions
  add column if not exists input_tokens_used bigint not null default 0,
  add column if not exists cached_input_tokens_used bigint not null default 0,
  add column if not exists output_tokens_used bigint not null default 0,
  add column if not exists total_tokens_used bigint not null default 0,
  add column if not exists daily_total_tokens_used bigint not null default 0,
  add column if not exists total_cost_nano_usd bigint not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'subscription_plans_monthly_token_limit_check') then
    alter table public.subscription_plans
      add constraint subscription_plans_monthly_token_limit_check check (monthly_token_limit > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'subscription_plans_daily_token_limit_check') then
    alter table public.subscription_plans
      add constraint subscription_plans_daily_token_limit_check check (daily_token_limit > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workspace_subscriptions_token_usage_check') then
    alter table public.workspace_subscriptions
      add constraint workspace_subscriptions_token_usage_check check (
        input_tokens_used >= 0
        and cached_input_tokens_used >= 0
        and output_tokens_used >= 0
        and total_tokens_used >= 0
        and daily_total_tokens_used >= 0
        and total_cost_nano_usd >= 0
      );
  end if;
end
$$;

update public.subscription_plans
set
  monthly_token_limit = case id
    when 'free' then 100000
    when 'starter' then 1000000
    when 'pro' then 5000000
    when 'business' then 20000000
    when 'enterprise' then 100000000
    else monthly_token_limit
  end,
  daily_token_limit = case id
    when 'free' then 25000
    when 'starter' then 150000
    when 'pro' then 500000
    when 'business' then 2000000
    when 'enterprise' then 10000000
    else daily_token_limit
  end,
  features = case
    when id in ('free', 'starter', 'pro', 'business', 'enterprise')
      then array(select distinct feature from unnest(features || array['chatbots']) as feature)
    else features
  end,
  updated_at = now();

alter table if exists public.enterprise_quote_requests
  drop constraint if exists enterprise_quote_requests_estimated_monthly_calls_check;
alter table if exists public.enterprise_quote_requests
  add constraint enterprise_quote_requests_estimated_monthly_calls_check
  check (estimated_monthly_calls between 100000 and 10000000000);
alter table if exists public.enterprise_quote_requests
  add column if not exists estimated_monthly_tokens bigint;
update public.enterprise_quote_requests
set estimated_monthly_tokens = estimated_monthly_calls
where estimated_monthly_tokens is null;
alter table if exists public.enterprise_quote_requests
  alter column estimated_monthly_tokens set not null;
alter table if exists public.enterprise_quote_requests
  drop constraint if exists enterprise_quote_requests_estimated_monthly_tokens_check;
alter table if exists public.enterprise_quote_requests
  add constraint enterprise_quote_requests_estimated_monthly_tokens_check
  check (estimated_monthly_tokens between 100000 and 10000000000);

create table if not exists public.model_pricing (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  model_pattern text not null,
  display_name text not null,
  input_nano_usd_per_million bigint not null,
  cached_input_nano_usd_per_million bigint,
  output_nano_usd_per_million bigint not null,
  long_context_threshold_tokens bigint,
  long_context_input_multiplier numeric(8,4) not null default 1,
  long_context_output_multiplier numeric(8,4) not null default 1,
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  source_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, model_pattern, effective_from),
  check (input_nano_usd_per_million >= 0),
  check (cached_input_nano_usd_per_million is null or cached_input_nano_usd_per_million >= 0),
  check (output_nano_usd_per_million >= 0),
  check (long_context_threshold_tokens is null or long_context_threshold_tokens > 0),
  check (long_context_input_multiplier >= 1),
  check (long_context_output_multiplier >= 1)
);

create index if not exists model_pricing_lookup_idx
  on public.model_pricing(provider, model_pattern, effective_from desc)
  where active = true;

insert into public.model_pricing (
  provider,
  model_pattern,
  display_name,
  input_nano_usd_per_million,
  cached_input_nano_usd_per_million,
  output_nano_usd_per_million,
  long_context_threshold_tokens,
  long_context_input_multiplier,
  long_context_output_multiplier,
  effective_from,
  source_url
)
values
  ('openai', 'gpt-5.4-mini', 'GPT-5.4 mini', 750000000, 75000000, 4500000000, null, 1, 1, '2026-01-01T00:00:00Z', 'https://openai.com/api/pricing/'),
  ('openai', 'gpt-5.4-nano', 'GPT-5.4 nano', 200000000, 20000000, 1250000000, null, 1, 1, '2026-01-01T00:00:00Z', 'https://openai.com/api/pricing/'),
  ('openai', 'gpt-5.4', 'GPT-5.4', 2500000000, 250000000, 15000000000, 272000, 2, 1.5, '2026-01-01T00:00:00Z', 'https://openai.com/api/pricing/'),
  ('openai', 'gpt-5.4-pro', 'GPT-5.4 Pro', 30000000000, null, 180000000000, 272000, 2, 1.5, '2026-01-01T00:00:00Z', 'https://openai.com/api/pricing/'),
  ('openai', 'gpt-5.5', 'GPT-5.5', 5000000000, 500000000, 30000000000, 272000, 2, 1.5, '2026-01-01T00:00:00Z', 'https://openai.com/api/pricing/')
on conflict (provider, model_pattern, effective_from) do update set
  display_name = excluded.display_name,
  input_nano_usd_per_million = excluded.input_nano_usd_per_million,
  cached_input_nano_usd_per_million = excluded.cached_input_nano_usd_per_million,
  output_nano_usd_per_million = excluded.output_nano_usd_per_million,
  long_context_threshold_tokens = excluded.long_context_threshold_tokens,
  long_context_input_multiplier = excluded.long_context_input_multiplier,
  long_context_output_multiplier = excluded.long_context_output_multiplier,
  source_url = excluded.source_url,
  active = true,
  updated_at = now();

create table if not exists public.ai_usage_events (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  feature text not null,
  provider text not null,
  model text not null,
  provider_request_id text,
  input_tokens bigint not null default 0,
  cached_input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  reasoning_tokens bigint not null default 0,
  total_tokens bigint not null default 0,
  input_cost_nano_usd bigint,
  cached_input_cost_nano_usd bigint,
  output_cost_nano_usd bigint,
  total_cost_nano_usd bigint,
  pricing_status text not null default 'unpriced' check (pricing_status in ('exact', 'unpriced')),
  status text not null default 'completed' check (status in ('completed', 'failed')),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (input_tokens >= 0),
  check (cached_input_tokens >= 0 and cached_input_tokens <= input_tokens),
  check (output_tokens >= 0),
  check (reasoning_tokens >= 0 and reasoning_tokens <= output_tokens),
  check (total_tokens >= 0),
  check (total_cost_nano_usd is null or total_cost_nano_usd >= 0)
);

create index if not exists ai_usage_events_workspace_created_idx
  on public.ai_usage_events(workspace_id, created_at desc);
create index if not exists ai_usage_events_user_created_idx
  on public.ai_usage_events(user_id, created_at desc);
create index if not exists ai_usage_events_model_created_idx
  on public.ai_usage_events(model, created_at desc);

create table if not exists public.ai_usage_reservations (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  feature text not null,
  provider text not null,
  model text not null,
  reserved_tokens bigint not null check (reserved_tokens between 1 and 250000),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  released_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_reservations_active_idx
  on public.ai_usage_reservations(workspace_id, expires_at)
  where released_at is null;

create table if not exists public.chatbots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  name text not null check (char_length(name) between 1 and 100),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text not null default '',
  provider text not null default 'openai',
  model text not null default 'gpt-5.4-mini',
  system_prompt text not null default '',
  memory_enabled boolean not null default true,
  is_system boolean not null default false,
  status text not null default 'active' check (status in ('active', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create table if not exists public.chatbot_knowledge (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  chatbot_id uuid not null references public.chatbots(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  content text not null check (char_length(content) between 1 and 100000),
  source text not null default 'Saisie utilisateur',
  blocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chatbot_conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  chatbot_id uuid not null references public.chatbots(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  title text not null default 'Nouvelle conversation',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chatbot_messages (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.chatbot_conversations(id) on delete cascade,
  usage_event_id uuid references public.ai_usage_events(id) on delete set null,
  role text not null check (role in ('system', 'user', 'assistant')),
  content text not null check (char_length(content) between 1 and 200000),
  status text not null default 'completed' check (status in ('pending', 'completed', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists chatbots_workspace_updated_idx
  on public.chatbots(workspace_id, updated_at desc);
create index if not exists chatbot_knowledge_chatbot_updated_idx
  on public.chatbot_knowledge(chatbot_id, updated_at desc);
create index if not exists chatbot_knowledge_workspace_idx
  on public.chatbot_knowledge(workspace_id);
create index if not exists chatbot_conversations_chatbot_last_idx
  on public.chatbot_conversations(chatbot_id, last_message_at desc);
create index if not exists chatbot_conversations_workspace_idx
  on public.chatbot_conversations(workspace_id);
create index if not exists chatbot_conversations_user_idx
  on public.chatbot_conversations(user_id);
create index if not exists chatbot_messages_conversation_created_idx
  on public.chatbot_messages(conversation_id, created_at asc);
create index if not exists chatbot_messages_workspace_idx
  on public.chatbot_messages(workspace_id);
create index if not exists chatbot_messages_usage_event_idx
  on public.chatbot_messages(usage_event_id);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  automation_id text not null,
  initiated_by uuid references auth.users(id) on delete set null,
  trigger_type text not null check (trigger_type in ('manual', 'schedule', 'webhook')),
  idempotency_key text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled')),
  attempt integer not null default 1 check (attempt between 1 and 10),
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error_code text,
  error_message text,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  total_tokens bigint not null default 0,
  total_cost_nano_usd bigint not null default 0,
  approval_id text,
  action_node_id text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, automation_id, idempotency_key)
);

create table if not exists public.automation_run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.automation_runs(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  node_id text not null,
  node_type text not null check (node_type in ('trigger', 'condition', 'agent', 'action', 'approval', 'result')),
  position integer not null check (position >= 0),
  status text not null default 'pending' check (status in ('pending', 'running', 'waiting_approval', 'completed', 'skipped', 'failed')),
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, node_id)
);

create table if not exists public.tool_execution_claims (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  approval_id text not null,
  tool text not null,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  response jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, approval_id)
);

create index if not exists automation_runs_workspace_created_idx
  on public.automation_runs(workspace_id, created_at desc);
create index if not exists automation_runs_automation_created_idx
  on public.automation_runs(workspace_id, automation_id, created_at desc);
create index if not exists automation_runs_status_created_idx
  on public.automation_runs(status, created_at)
  where status in ('pending', 'running');
create index if not exists automation_runs_initiated_by_idx
  on public.automation_runs(initiated_by);
create unique index if not exists automation_runs_approval_idx
  on public.automation_runs(workspace_id, approval_id)
  where approval_id is not null;
create index if not exists automation_run_steps_run_position_idx
  on public.automation_run_steps(run_id, position);
create index if not exists automation_run_steps_workspace_idx
  on public.automation_run_steps(workspace_id);
create index if not exists tool_execution_claims_workspace_created_idx
  on public.tool_execution_claims(workspace_id, created_at desc);

alter table public.model_pricing enable row level security;
alter table public.ai_usage_events enable row level security;
alter table public.ai_usage_reservations enable row level security;
alter table public.chatbots enable row level security;
alter table public.chatbot_knowledge enable row level security;
alter table public.chatbot_conversations enable row level security;
alter table public.chatbot_messages enable row level security;
alter table public.automation_runs enable row level security;
alter table public.automation_run_steps enable row level security;
alter table public.tool_execution_claims enable row level security;

revoke all on table
  public.model_pricing,
  public.ai_usage_events,
  public.ai_usage_reservations,
  public.chatbots,
  public.chatbot_knowledge,
  public.chatbot_conversations,
  public.chatbot_messages,
  public.automation_runs,
  public.automation_run_steps,
  public.tool_execution_claims
from anon, authenticated;

grant all on table
  public.model_pricing,
  public.ai_usage_events,
  public.ai_usage_reservations,
  public.chatbots,
  public.chatbot_knowledge,
  public.chatbot_conversations,
  public.chatbot_messages,
  public.automation_runs,
  public.automation_run_steps,
  public.tool_execution_claims
to service_role;

drop function if exists public.authorize_workspace_ai_request(uuid, integer);

create or replace function public.authorize_workspace_ai_request(
  p_id uuid,
  p_workspace_id uuid,
  p_user_id uuid,
  p_feature text,
  p_provider text,
  p_model text,
  p_reserved_tokens bigint,
  p_requests integer default 1
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  subscription_row public.workspace_subscriptions%rowtype;
  plan_row public.subscription_plans%rowtype;
  monthly_usage bigint;
  daily_usage bigint;
  minute_usage integer;
  active_reserved_tokens bigint;
  monthly_cost_nano_usd bigint;
  monthly_budget_nano_usd bigint := 0;
  block_on_budget boolean := false;
  reset_at timestamptz;
  usage_day date;
  minute_started_at timestamptz;
begin
  if p_requests < 1 or p_requests > 50 or p_reserved_tokens < 1 or p_reserved_tokens > 250000 then
    raise exception 'INVALID_AI_REQUEST_COUNT';
  end if;

  select subscription.* into subscription_row
  from public.workspace_subscriptions subscription
  where subscription.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'SUBSCRIPTION_NOT_FOUND';
  end if;

  select * into plan_row
  from public.subscription_plans
  where id = subscription_row.plan_id;

  if subscription_row.status not in ('active', 'trialing') then
    raise exception 'SUBSCRIPTION_INACTIVE';
  end if;

  monthly_usage := subscription_row.total_tokens_used;
  daily_usage := subscription_row.daily_total_tokens_used;
  minute_usage := subscription_row.api_usage_minute;
  monthly_cost_nano_usd := subscription_row.total_cost_nano_usd;
  reset_at := subscription_row.api_usage_reset_at;
  usage_day := subscription_row.api_usage_day;
  minute_started_at := subscription_row.api_usage_minute_started_at;

  if reset_at <= now() then
    monthly_usage := 0;
    monthly_cost_nano_usd := 0;
    reset_at := date_trunc('month', now()) + interval '1 month';
  end if;
  if usage_day <> current_date then
    daily_usage := 0;
    usage_day := current_date;
  end if;
  if minute_started_at < date_trunc('minute', now()) then
    minute_usage := 0;
    minute_started_at := date_trunc('minute', now());
  end if;

  update public.ai_usage_reservations
  set released_at = now()
  where workspace_id = p_workspace_id
    and released_at is null
    and expires_at <= now();

  select coalesce(sum(reserved_tokens), 0) into active_reserved_tokens
  from public.ai_usage_reservations
  where workspace_id = p_workspace_id
    and released_at is null
    and expires_at > now();

  select
    coalesce(
      case
        when settings ->> 'monthlyBudget' ~ '^[0-9]+([.][0-9]+)?$'
          then round((settings ->> 'monthlyBudget')::numeric * 1000000000)::bigint
        else 0
      end,
      0
    ),
    case
      when lower(settings ->> 'blockOnBudgetLimit') in ('true', 'false')
        then (settings ->> 'blockOnBudgetLimit')::boolean
      else false
    end
  into monthly_budget_nano_usd, block_on_budget
  from public.workspaces
  where id = p_workspace_id;

  if block_on_budget and monthly_budget_nano_usd > 0 and monthly_cost_nano_usd >= monthly_budget_nano_usd then
    raise exception 'BUDGET_LIMIT_EXCEEDED';
  end if;

  if monthly_usage + active_reserved_tokens + p_reserved_tokens > plan_row.monthly_token_limit then
    raise exception 'TOKEN_QUOTA_EXCEEDED';
  end if;
  if daily_usage + active_reserved_tokens + p_reserved_tokens > plan_row.daily_token_limit then
    raise exception 'TOKEN_DAILY_QUOTA_EXCEEDED';
  end if;
  if minute_usage + p_requests > plan_row.minute_api_limit then
    raise exception 'API_RATE_LIMIT_EXCEEDED';
  end if;

  insert into public.ai_usage_reservations (
    id, workspace_id, user_id, feature, provider, model, reserved_tokens
  ) values (
    p_id, p_workspace_id, p_user_id, p_feature, p_provider, p_model, p_reserved_tokens
  );

  update public.workspace_subscriptions
  set
    input_tokens_used = case when api_usage_reset_at <= now() then 0 else input_tokens_used end,
    cached_input_tokens_used = case when api_usage_reset_at <= now() then 0 else cached_input_tokens_used end,
    output_tokens_used = case when api_usage_reset_at <= now() then 0 else output_tokens_used end,
    total_tokens_used = monthly_usage,
    daily_total_tokens_used = daily_usage,
    total_cost_nano_usd = case when api_usage_reset_at <= now() then 0 else total_cost_nano_usd end,
    api_usage_reset_at = reset_at,
    api_usage_day = usage_day,
    api_usage_minute = minute_usage + p_requests,
    api_usage_minute_started_at = minute_started_at,
    updated_at = now()
  where workspace_id = p_workspace_id;

  return jsonb_build_object(
    'totalTokensUsed', monthly_usage,
    'monthlyTokenLimit', plan_row.monthly_token_limit,
    'dailyTokensUsed', daily_usage,
    'dailyTokenLimit', plan_row.daily_token_limit,
    'reservedTokens', active_reserved_tokens + p_reserved_tokens,
    'totalCostNanoUsd', monthly_cost_nano_usd,
    'monthlyBudgetNanoUsd', monthly_budget_nano_usd,
    'minuteRequestLimit', plan_row.minute_api_limit,
    'usageResetAt', reset_at
  );
end;
$$;

revoke all on function public.authorize_workspace_ai_request(uuid, uuid, uuid, text, text, text, bigint, integer) from public, anon, authenticated;
grant execute on function public.authorize_workspace_ai_request(uuid, uuid, uuid, text, text, text, bigint, integer) to service_role;

create or replace function public.release_workspace_ai_reservation(
  p_id uuid,
  p_workspace_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ai_usage_reservations
  set released_at = coalesce(released_at, now())
  where id = p_id and workspace_id = p_workspace_id;
end;
$$;

revoke all on function public.release_workspace_ai_reservation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_workspace_ai_reservation(uuid, uuid) to service_role;

create or replace function public.record_workspace_ai_usage(
  p_id uuid,
  p_workspace_id uuid,
  p_user_id uuid,
  p_feature text,
  p_provider text,
  p_model text,
  p_provider_request_id text,
  p_input_tokens bigint,
  p_cached_input_tokens bigint,
  p_output_tokens bigint,
  p_reasoning_tokens bigint,
  p_total_tokens bigint,
  p_input_cost_nano_usd bigint,
  p_cached_input_cost_nano_usd bigint,
  p_output_cost_nano_usd bigint,
  p_total_cost_nano_usd bigint,
  p_pricing_status text,
  p_metadata jsonb default '{}'::jsonb
) returns public.ai_usage_events
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_event public.ai_usage_events%rowtype;
  inserted_event public.ai_usage_events%rowtype;
  reset_month boolean;
  reset_day boolean;
begin
  select * into existing_event from public.ai_usage_events where id = p_id;
  if found then
    return existing_event;
  end if;

  if p_input_tokens < 0 or p_cached_input_tokens < 0 or p_output_tokens < 0 or p_total_tokens < 0 then
    raise exception 'INVALID_TOKEN_USAGE';
  end if;
  if p_cached_input_tokens > p_input_tokens or p_reasoning_tokens > p_output_tokens then
    raise exception 'INVALID_TOKEN_DETAILS';
  end if;
  if p_pricing_status not in ('exact', 'unpriced') then
    raise exception 'INVALID_PRICING_STATUS';
  end if;

  select api_usage_reset_at <= now(), api_usage_day <> current_date
  into reset_month, reset_day
  from public.workspace_subscriptions
  where workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'SUBSCRIPTION_NOT_FOUND';
  end if;

  select * into existing_event from public.ai_usage_events where id = p_id;
  if found then
    return existing_event;
  end if;

  update public.ai_usage_reservations
  set released_at = coalesce(released_at, now())
  where id = p_id and workspace_id = p_workspace_id;

  insert into public.ai_usage_events (
    id, workspace_id, user_id, feature, provider, model, provider_request_id,
    input_tokens, cached_input_tokens, output_tokens, reasoning_tokens, total_tokens,
    input_cost_nano_usd, cached_input_cost_nano_usd, output_cost_nano_usd,
    total_cost_nano_usd, pricing_status, metadata
  ) values (
    p_id, p_workspace_id, p_user_id, p_feature, p_provider, p_model, p_provider_request_id,
    p_input_tokens, p_cached_input_tokens, p_output_tokens, p_reasoning_tokens, p_total_tokens,
    p_input_cost_nano_usd, p_cached_input_cost_nano_usd, p_output_cost_nano_usd,
    p_total_cost_nano_usd, p_pricing_status, coalesce(p_metadata, '{}'::jsonb)
  ) returning * into inserted_event;

  update public.workspace_subscriptions
  set
    input_tokens_used = (case when reset_month then 0 else input_tokens_used end) + p_input_tokens,
    cached_input_tokens_used = (case when reset_month then 0 else cached_input_tokens_used end) + p_cached_input_tokens,
    output_tokens_used = (case when reset_month then 0 else output_tokens_used end) + p_output_tokens,
    total_tokens_used = (case when reset_month then 0 else total_tokens_used end) + p_total_tokens,
    daily_total_tokens_used = (case when reset_day then 0 else daily_total_tokens_used end) + p_total_tokens,
    total_cost_nano_usd = (case when reset_month then 0 else total_cost_nano_usd end) + coalesce(p_total_cost_nano_usd, 0),
    api_usage_reset_at = case when reset_month then date_trunc('month', now()) + interval '1 month' else api_usage_reset_at end,
    api_usage_day = case when reset_day then current_date else api_usage_day end,
    updated_at = now()
  where workspace_id = p_workspace_id;

  return inserted_event;
end;
$$;

revoke all on function public.record_workspace_ai_usage(
  uuid, uuid, uuid, text, text, text, text, bigint, bigint, bigint, bigint, bigint,
  bigint, bigint, bigint, bigint, text, jsonb
) from public, anon, authenticated;
grant execute on function public.record_workspace_ai_usage(
  uuid, uuid, uuid, text, text, text, text, bigint, bigint, bigint, bigint, bigint,
  bigint, bigint, bigint, bigint, text, jsonb
) to service_role;

comment on table public.ai_usage_events is
  'Journal immuable des tokens réellement retournés par les fournisseurs et de leur coût calculé avec un tarif versionné.';
comment on table public.chatbot_messages is
  'Historique persistant des conversations. Les messages utilisateur sont enregistrés avant l’appel au modèle.';
comment on table public.automation_runs is
  'Exécutions idempotentes et auditables des automatisations Astra.';
