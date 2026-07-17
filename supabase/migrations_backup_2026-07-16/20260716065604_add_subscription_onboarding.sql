alter table public.workspace_subscriptions
add column if not exists onboarding_completed_at timestamptz;

update public.workspace_subscriptions
set onboarding_completed_at = coalesce(onboarding_completed_at, created_at, now())
where onboarding_completed_at is null;

create index if not exists workspace_subscriptions_plan_id_idx
on public.workspace_subscriptions(plan_id);

comment on column public.workspace_subscriptions.onboarding_completed_at is
  'Date à laquelle un administrateur a choisi explicitement une offre gratuite ou payante.';
