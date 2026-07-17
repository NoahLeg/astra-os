create table if not exists public.subscription_plans (
  id text primary key,
  name text not null,
  description text not null,
  monthly_price_cents integer not null check (monthly_price_cents >= 0),
  api_limit integer not null check (api_limit > 0),
  max_agents integer not null check (max_agents >= 0),
  features text[] not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.subscription_plans (id, name, description, monthly_price_cents, api_limit, max_agents, features, sort_order)
values
  ('starter', 'Starter', 'Pour structurer les premiers objectifs avec Astra.', 0, 100, 0, array['assistant', 'goals', 'memory'], 1),
  ('pro', 'Pro', 'Pour automatiser le travail d''une petite équipe.', 4900, 2000, 5, array['assistant', 'goals', 'memory', 'agents', 'connectors', 'automations'], 2),
  ('business', 'Business', 'Pour coordonner plusieurs agents et plusieurs utilisateurs.', 14900, 10000, 10, array['assistant', 'goals', 'memory', 'agents', 'connectors', 'automations', 'multi_agent', 'team_admin'], 3)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  monthly_price_cents = excluded.monthly_price_cents,
  api_limit = excluded.api_limit,
  max_agents = excluded.max_agents,
  features = excluded.features,
  sort_order = excluded.sort_order,
  updated_at = now();

create table if not exists public.workspace_subscriptions (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  plan_id text not null references public.subscription_plans(id),
  status text not null default 'active' check (status in ('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'unpaid')),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  api_usage integer not null default 0 check (api_usage >= 0),
  api_usage_reset_at timestamptz not null default (date_trunc('month', now()) + interval '1 month'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.workspace_subscriptions (workspace_id, plan_id, status, current_period_end)
select id, 'business', 'trialing', now() + interval '14 days'
from public.workspaces
on conflict (workspace_id) do nothing;

alter table public.subscription_plans enable row level security;
alter table public.workspace_subscriptions enable row level security;

revoke all on table public.subscription_plans, public.workspace_subscriptions from anon, authenticated;
grant all on table public.subscription_plans, public.workspace_subscriptions to service_role;

comment on table public.workspace_subscriptions is
  'Abonnement, droits et compteur API mensuel de chaque entreprise Astra. Accès réservé aux routes serveur.';

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
  reset_at timestamptz;
  subscription_status text;
  usage_limit integer;
begin
  if p_units < 1 or p_units > 50 then
    raise exception 'INVALID_API_USAGE_UNITS';
  end if;

  select subscription.api_usage, subscription.api_usage_reset_at, subscription.status, plan.api_limit
  into current_usage, reset_at, subscription_status, usage_limit
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

  if current_usage + p_units > usage_limit then
    raise exception 'API_QUOTA_EXCEEDED';
  end if;

  update public.workspace_subscriptions
  set api_usage = current_usage + p_units,
      api_usage_reset_at = reset_at,
      updated_at = now()
  where workspace_id = p_workspace_id;

  return jsonb_build_object(
    'apiUsage', current_usage + p_units,
    'apiLimit', usage_limit,
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
  values (new_workspace_id, 'starter', 'active');

  return new_workspace_id;
end;
$$;

revoke all on function public.create_company_workspace(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_company_workspace(uuid, text, text, text, text) to service_role;
