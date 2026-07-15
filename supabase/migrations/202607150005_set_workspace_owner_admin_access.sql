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

  return new_workspace_id;
end;
$$;

revoke all on function public.create_company_workspace(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_company_workspace(uuid, text, text, text, text) to service_role;
