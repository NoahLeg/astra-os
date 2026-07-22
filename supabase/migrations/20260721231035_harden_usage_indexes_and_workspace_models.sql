begin;

create index if not exists ai_usage_reservations_user_id_idx
  on public.ai_usage_reservations (user_id)
  where user_id is not null;

create index if not exists chatbots_created_by_idx
  on public.chatbots (created_by)
  where created_by is not null;

create index if not exists enterprise_quote_requests_requested_by_idx
  on public.enterprise_quote_requests (requested_by)
  where requested_by is not null;

-- "gpt" was a local placeholder used by earlier versions of the application.
-- Keep existing choices while replacing it with the current default model.
update public.workspaces
set settings = jsonb_set(
  jsonb_set(
    coalesce(settings, '{}'::jsonb),
    '{defaultModelId}',
    to_jsonb(
      case
        when settings ->> 'defaultModelId' = 'gpt' then 'gpt-5.4-mini'
        else coalesce(settings ->> 'defaultModelId', 'gpt-5.4-mini')
      end
    ),
    true
  ),
  '{enabledModelIds}',
  case
    when jsonb_typeof(settings -> 'enabledModelIds') = 'array' then
      coalesce(
        (
          select jsonb_agg(
            case when model_id = 'gpt' then 'gpt-5.4-mini' else model_id end
          )
          from jsonb_array_elements_text(settings -> 'enabledModelIds') as model_id
        ),
        jsonb_build_array('gpt-5.4-mini')
      )
    else jsonb_build_array('gpt-5.4-mini')
  end,
  true
)
where settings ->> 'defaultModelId' = 'gpt'
   or coalesce(settings -> 'enabledModelIds', '[]'::jsonb) ? 'gpt';

commit;
