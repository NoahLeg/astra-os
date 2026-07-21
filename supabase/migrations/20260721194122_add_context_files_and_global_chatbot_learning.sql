alter table public.chatbots
  add column if not exists global_learning_enabled boolean not null default false;

create table if not exists public.context_files (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  chatbot_id uuid references public.chatbots(id) on delete cascade,
  created_by uuid not null,
  scope text not null default 'chatbot',
  name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  storage_path text not null unique,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint context_files_scope_check check (scope in ('workspace', 'chatbot')),
  constraint context_files_status_check check (status in ('active', 'blocked')),
  constraint context_files_size_check check (size_bytes > 0 and size_bytes <= 4194304),
  constraint context_files_scope_target_check check (
    (scope = 'workspace' and chatbot_id is null)
    or (scope = 'chatbot' and chatbot_id is not null)
  )
);

create index if not exists context_files_workspace_created_idx
  on public.context_files(workspace_id, created_at desc);
create index if not exists context_files_chatbot_created_idx
  on public.context_files(chatbot_id, created_at desc)
  where chatbot_id is not null;

alter table public.context_files enable row level security;
revoke all on table public.context_files from anon, authenticated;
grant select, insert, update, delete on table public.context_files to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('context-files', 'context-files', false, 4194304)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

comment on table public.context_files is
  'Metadonnees des fichiers multimodaux prives utilises comme contexte par les chatbots.';
comment on column public.chatbots.global_learning_enabled is
  'Enregistre les apprentissages conversationnels dans la memoire globale de l entreprise plutot que dans la memoire propre au chatbot.';
