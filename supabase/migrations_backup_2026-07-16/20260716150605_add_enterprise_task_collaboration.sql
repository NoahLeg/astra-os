update public.subscription_plans
set features = array_append(features, 'collaboration'),
    updated_at = now()
where id = 'enterprise'
  and not ('collaboration' = any(features));

create table if not exists public.task_collaborators (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null check (entity_type = 'goal'),
  entity_id text not null,
  task_id text not null,
  user_id uuid not null,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, entity_type, entity_id, task_id, user_id),
  foreign key (workspace_id, user_id)
    references public.workspace_members(workspace_id, user_id)
    on delete cascade
);

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null check (entity_type = 'goal'),
  entity_id text not null,
  task_id text not null,
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null,
  author_email text not null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_collaborators_member_idx
  on public.task_collaborators(workspace_id, user_id);

create index if not exists task_comments_lookup_idx
  on public.task_comments(workspace_id, entity_type, entity_id, task_id, created_at);

alter table public.task_collaborators enable row level security;
alter table public.task_comments enable row level security;

revoke all on table public.task_collaborators, public.task_comments from anon, authenticated;
grant all on table public.task_collaborators, public.task_comments to service_role;

comment on table public.task_collaborators is
  'Co-affectations des taches Entreprise. Acces reserve aux routes serveur authentifiees.';

comment on table public.task_comments is
  'Fil de discussion par tache Entreprise. Acces reserve aux routes serveur authentifiees.';
