create index if not exists audit_logs_actor_user_idx
  on public.audit_logs(actor_user_id);

create index if not exists integration_secrets_created_by_idx
  on public.integration_secrets(created_by);
