alter table public.profiles
add column if not exists preferences jsonb not null default jsonb_build_object(
  'theme', 'dark',
  'accentColor', 'indigo',
  'density', 'comfortable',
  'reducedMotion', false,
  'landingPage', '/'
);

alter table public.subscription_plans
add column if not exists daily_api_limit integer not null default 10,
add column if not exists minute_api_limit integer not null default 3;

insert into public.subscription_plans (
  id,
  name,
  description,
  monthly_price_cents,
  api_limit,
  daily_api_limit,
  minute_api_limit,
  max_agents,
  features,
  sort_order
)
values (
  'free',
  'Free',
  'Pour découvrir Astra et structurer quelques objectifs.',
  0,
  50,
  10,
  3,
  0,
  array['assistant', 'goals', 'memory'],
  1
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  monthly_price_cents = excluded.monthly_price_cents,
  api_limit = excluded.api_limit,
  daily_api_limit = excluded.daily_api_limit,
  minute_api_limit = excluded.minute_api_limit,
  max_agents = excluded.max_agents,
  features = excluded.features,
  sort_order = excluded.sort_order,
  updated_at = now();

update public.workspace_subscriptions
set plan_id = 'free', updated_at = now()
where plan_id = 'starter';

insert into public.subscription_plans (
  id,
  name,
  description,
  monthly_price_cents,
  api_limit,
  daily_api_limit,
  minute_api_limit,
  max_agents,
  features,
  sort_order
)
values
  ('starter', 'Starter', 'Pour automatiser ses premiers processus sans surdimensionner son budget.', 1900, 500, 50, 10, 2, array['assistant', 'goals', 'memory', 'agents', 'connectors', 'automations'], 2),
  ('pro', 'Pro', 'Pour automatiser le travail d''une petite équipe.', 4900, 2000, 150, 30, 5, array['assistant', 'goals', 'memory', 'agents', 'connectors', 'automations'], 3),
  ('business', 'Business', 'Pour coordonner plusieurs agents et plusieurs utilisateurs.', 14900, 8000, 500, 60, 10, array['assistant', 'goals', 'memory', 'agents', 'connectors', 'automations', 'multi_agent', 'team_admin'], 4)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  monthly_price_cents = excluded.monthly_price_cents,
  api_limit = excluded.api_limit,
  daily_api_limit = excluded.daily_api_limit,
  minute_api_limit = excluded.minute_api_limit,
  max_agents = excluded.max_agents,
  features = excluded.features,
  sort_order = excluded.sort_order,
  updated_at = now();

alter table public.workspace_subscriptions
add column if not exists api_usage_daily integer not null default 0,
add column if not exists api_usage_day date not null default current_date,
add column if not exists api_usage_minute integer not null default 0,
add column if not exists api_usage_minute_started_at timestamptz not null default date_trunc('minute', now());

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'subscription_plans_daily_api_limit_check') then
    alter table public.subscription_plans add constraint subscription_plans_daily_api_limit_check check (daily_api_limit > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'subscription_plans_minute_api_limit_check') then
    alter table public.subscription_plans add constraint subscription_plans_minute_api_limit_check check (minute_api_limit > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workspace_subscriptions_api_usage_daily_check') then
    alter table public.workspace_subscriptions add constraint workspace_subscriptions_api_usage_daily_check check (api_usage_daily >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workspace_subscriptions_api_usage_minute_check') then
    alter table public.workspace_subscriptions add constraint workspace_subscriptions_api_usage_minute_check check (api_usage_minute >= 0);
  end if;
end;
$$;

create or replace function public.consume_workspace_api_usage(
  p_workspace_id uuid,
  p_units integer default 1
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_usage integer;
  current_daily_usage integer;
  current_minute_usage integer;
  reset_at timestamptz;
  usage_day date;
  minute_started_at timestamptz;
  subscription_status text;
  usage_limit integer;
  daily_limit integer;
  minute_limit integer;
begin
  if p_units < 1 or p_units > 50 then
    raise exception 'INVALID_API_USAGE_UNITS';
  end if;

  select
    subscription.api_usage,
    subscription.api_usage_daily,
    subscription.api_usage_minute,
    subscription.api_usage_reset_at,
    subscription.api_usage_day,
    subscription.api_usage_minute_started_at,
    subscription.status,
    plan.api_limit,
    plan.daily_api_limit,
    plan.minute_api_limit
  into
    current_usage,
    current_daily_usage,
    current_minute_usage,
    reset_at,
    usage_day,
    minute_started_at,
    subscription_status,
    usage_limit,
    daily_limit,
    minute_limit
  from public.workspace_subscriptions subscription
  join public.subscription_plans plan on plan.id = subscription.plan_id
  where subscription.workspace_id = p_workspace_id
  for update of subscription;

  if not found then
    raise exception 'SUBSCRIPTION_NOT_FOUND';
  end if;

  if subscription_status not in ('active', 'trialing') then
    raise exception 'SUBSCRIPTION_INACTIVE';
  end if;

  if reset_at <= now() then
    current_usage := 0;
    reset_at := date_trunc('month', now()) + interval '1 month';
  end if;

  if usage_day <> current_date then
    current_daily_usage := 0;
    usage_day := current_date;
  end if;

  if minute_started_at < date_trunc('minute', now()) then
    current_minute_usage := 0;
    minute_started_at := date_trunc('minute', now());
  end if;

  if current_usage + p_units > usage_limit then
    raise exception 'API_QUOTA_EXCEEDED';
  end if;

  if current_daily_usage + p_units > daily_limit then
    raise exception 'API_DAILY_QUOTA_EXCEEDED';
  end if;

  if current_minute_usage + p_units > minute_limit then
    raise exception 'API_RATE_LIMIT_EXCEEDED';
  end if;

  update public.workspace_subscriptions
  set api_usage = current_usage + p_units,
      api_usage_reset_at = reset_at,
      api_usage_daily = current_daily_usage + p_units,
      api_usage_day = usage_day,
      api_usage_minute = current_minute_usage + p_units,
      api_usage_minute_started_at = minute_started_at,
      updated_at = now()
  where workspace_id = p_workspace_id;

  return jsonb_build_object(
    'apiUsage', current_usage + p_units,
    'apiLimit', usage_limit,
    'dailyApiUsage', current_daily_usage + p_units,
    'dailyApiLimit', daily_limit,
    'minuteApiLimit', minute_limit,
    'usageResetAt', reset_at
  );
end;
$$;

revoke all on function public.consume_workspace_api_usage(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_workspace_api_usage(uuid, integer) to service_role;

create or replace function public.create_company_workspace(
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_company_name text,
  p_slug text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_workspace_id uuid;
  new_workspace_id uuid;
begin
  select workspace_id into existing_workspace_id
  from public.workspace_members
  where user_id = p_user_id
  order by created_at
  limit 1;

  if existing_workspace_id is not null then
    return existing_workspace_id;
  end if;

  insert into public.profiles (id, email, full_name)
  values (p_user_id, p_email, p_full_name)
  on conflict (id) do update
    set email = excluded.email, full_name = excluded.full_name, updated_at = now();

  insert into public.workspaces (name, slug)
  values (p_company_name, p_slug)
  returning id into new_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role, access_level, status)
  values (new_workspace_id, p_user_id, 'owner', 'admin', 'active');

  insert into public.workspace_subscriptions (workspace_id, plan_id, status)
  values (new_workspace_id, 'free', 'active');

  return new_workspace_id;
end;
$$;

revoke all on function public.create_company_workspace(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_company_workspace(uuid, text, text, text, text) to service_role;

comment on column public.profiles.preferences is
  'Préférences d’interface non sensibles propres à l’utilisateur.';

comment on column public.subscription_plans.daily_api_limit is
  'Plafond quotidien empêchant de consommer le quota mensuel en rafale.';

comment on column public.subscription_plans.minute_api_limit is
  'Plafond glissant par minute appliqué atomiquement par la fonction de consommation.';
