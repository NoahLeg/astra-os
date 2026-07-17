alter table public.subscription_plans
  add column if not exists max_members integer not null default 1,
  add column if not exists quote_only boolean not null default false;

alter table public.workspace_subscriptions
  add column if not exists member_limit_override integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'subscription_plans_max_members_check') then
    alter table public.subscription_plans
      add constraint subscription_plans_max_members_check check (max_members > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workspace_subscriptions_member_limit_override_check') then
    alter table public.workspace_subscriptions
      add constraint workspace_subscriptions_member_limit_override_check
      check (member_limit_override is null or member_limit_override > 0);
  end if;
end
$$;

update public.subscription_plans
set max_members = case id
  when 'free' then 1
  when 'starter' then 1
  when 'pro' then 3
  when 'business' then 10
  else max_members
end,
quote_only = false,
updated_at = now()
where id in ('free', 'starter', 'pro', 'business');

insert into public.subscription_plans (
  id,
  name,
  description,
  monthly_price_cents,
  api_limit,
  daily_api_limit,
  minute_api_limit,
  max_agents,
  max_members,
  features,
  quote_only,
  sort_order
)
values (
  'enterprise',
  'Entreprise',
  'Pour déployer Astra à l''échelle d''une organisation avec des sièges et quotas contractuels.',
  0,
  50000,
  3000,
  180,
  25,
  50,
  array['assistant', 'goals', 'memory', 'agents', 'connectors', 'automations', 'multi_agent', 'team_admin'],
  true,
  5
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  monthly_price_cents = excluded.monthly_price_cents,
  api_limit = excluded.api_limit,
  daily_api_limit = excluded.daily_api_limit,
  minute_api_limit = excluded.minute_api_limit,
  max_agents = excluded.max_agents,
  max_members = excluded.max_members,
  features = excluded.features,
  quote_only = excluded.quote_only,
  sort_order = excluded.sort_order,
  updated_at = now();

create table if not exists public.enterprise_quote_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  contact_name text not null,
  contact_email text not null,
  company_name text not null,
  seat_count integer not null check (seat_count between 2 and 10000),
  estimated_monthly_calls integer not null check (estimated_monthly_calls between 1000 and 10000000),
  message text,
  status text not null default 'pending' check (status in ('pending', 'contacted', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists enterprise_quote_requests_workspace_created_idx
  on public.enterprise_quote_requests(workspace_id, created_at desc);

alter table public.enterprise_quote_requests enable row level security;
revoke all on table public.enterprise_quote_requests from anon, authenticated;
grant all on table public.enterprise_quote_requests to service_role;

create or replace function public.enforce_workspace_member_limit()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  allowed_members integer;
  active_members integer;
begin
  if new.status <> 'active' then
    return new;
  end if;

  select case
    when plan.id = 'enterprise' then coalesce(subscription.member_limit_override, plan.max_members)
    else plan.max_members
  end
  into allowed_members
  from public.workspace_subscriptions subscription
  join public.subscription_plans plan on plan.id = subscription.plan_id
  where subscription.workspace_id = new.workspace_id;

  if allowed_members is null then
    return new;
  end if;

  select count(*)
  into active_members
  from public.workspace_members member
  where member.workspace_id = new.workspace_id
    and member.status = 'active'
    and member.user_id <> new.user_id;

  if active_members >= allowed_members then
    raise exception 'WORKSPACE_MEMBER_LIMIT_EXCEEDED';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_workspace_member_limit_trigger on public.workspace_members;
create trigger enforce_workspace_member_limit_trigger
before insert or update of status, workspace_id on public.workspace_members
for each row execute function public.enforce_workspace_member_limit();

revoke all on function public.enforce_workspace_member_limit() from public, anon, authenticated;
grant execute on function public.enforce_workspace_member_limit() to service_role;

comment on column public.subscription_plans.max_members is
  'Nombre maximal de membres actifs autorisés dans un espace pour cette offre.';

comment on column public.workspace_subscriptions.member_limit_override is
  'Nombre de sièges négocié pour un contrat Entreprise. Ignoré par les autres offres.';

comment on table public.enterprise_quote_requests is
  'Demandes de devis Entreprise accessibles uniquement depuis les routes serveur et la console Super Admin.';
