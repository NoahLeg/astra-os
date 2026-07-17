alter table public.profiles
  add column if not exists job_title text not null default '',
  add column if not exists phone text not null default '',
  add column if not exists timezone text not null default 'Europe/Paris';

alter table public.workspaces
  add column if not exists settings jsonb not null default '{
    "locale": "fr",
    "compactMode": false,
    "enabledModelIds": ["gpt"],
    "defaultModelId": "gpt",
    "defaultAutonomy": 2,
    "telemetryEnabled": false,
    "allowMemoryLearning": true,
    "memoryEnabled": true,
    "memoryApprovalRequired": true,
    "auditLogging": true,
    "sessionTimeoutMinutes": 480,
    "monthlyBudget": 100,
    "budgetAlertPercent": 80,
    "blockOnBudgetLimit": true,
    "notificationEmail": true,
    "notificationApprovals": true,
    "notificationErrors": true,
    "weeklyDigest": true,
    "dataRetentionDays": 365,
    "exportFormat": "json"
  }'::jsonb;

alter table public.workspace_members
  add column if not exists access_level text,
  add column if not exists status text not null default 'active',
  add column if not exists invited_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

update public.workspace_members
set access_level = case
  when role in ('owner', 'admin') then 'admin'
  when role = 'member' then 'operator'
  else 'viewer'
end
where access_level is null;

alter table public.workspace_members
  alter column access_level set default 'viewer',
  alter column access_level set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workspace_members_access_level_check') then
    alter table public.workspace_members add constraint workspace_members_access_level_check check (access_level in ('viewer', 'operator', 'admin'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workspace_members_status_check') then
    alter table public.workspace_members add constraint workspace_members_status_check check (status in ('active', 'suspended'));
  end if;
end
$$;

create index if not exists workspace_members_access_idx on public.workspace_members(user_id, status, access_level);

revoke all on table public.profiles, public.workspaces, public.workspace_members from anon, authenticated;
grant all on table public.profiles, public.workspaces, public.workspace_members to service_role;
