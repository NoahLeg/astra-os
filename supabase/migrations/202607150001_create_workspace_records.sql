create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_members_user_id_idx on public.workspace_members(user_id);

create table if not exists public.workspace_records (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  collection text not null,
  id text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, collection, id)
);

create index if not exists workspace_records_workspace_idx on public.workspace_records(workspace_id, collection);

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_records enable row level security;

revoke all on table public.profiles, public.workspaces, public.workspace_members, public.workspace_records from anon, authenticated;
grant all on table public.profiles, public.workspaces, public.workspace_members, public.workspace_records to service_role;

comment on table public.workspace_records is
  'Données Astra isolées par entreprise. Accès réservé aux routes serveur authentifiées.';

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
  on conflict (id) do update set email = excluded.email, full_name = excluded.full_name, updated_at = now();

  insert into public.workspaces (name, slug)
  values (p_company_name, p_slug)
  returning id into new_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, p_user_id, 'owner');

  return new_workspace_id;
end;
$$;

revoke all on function public.create_company_workspace(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_company_workspace(uuid, text, text, text, text) to service_role;

create table if not exists public.integration_secrets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  label text not null,
  base_url text,
  encrypted_value text not null,
  encryption_iv text not null,
  auth_tag text not null,
  secret_hint text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, label)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists integration_secrets_workspace_idx on public.integration_secrets(workspace_id);
create index if not exists audit_logs_workspace_idx on public.audit_logs(workspace_id, created_at desc);

alter table public.integration_secrets enable row level security;
alter table public.audit_logs enable row level security;
revoke all on table public.integration_secrets, public.audit_logs from anon, authenticated;
grant all on table public.integration_secrets, public.audit_logs to service_role;
