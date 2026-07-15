update public.workspace_records
set payload = payload || jsonb_build_object(
  'status', 'paused',
  'enabled', false,
  'tasksCompleted', 0,
  'successRate', 0,
  'estimatedCost', 0,
  'lastActivity', 'Jamais'
),
updated_at = now()
where collection = 'agents';
