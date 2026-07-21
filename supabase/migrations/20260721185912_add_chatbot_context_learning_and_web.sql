alter table public.chatbots
  add column if not exists learning_enabled boolean not null default true,
  add column if not exists web_enabled boolean not null default false;

alter table public.chatbot_messages
  add column if not exists citations jsonb not null default '[]'::jsonb;

alter table public.chatbot_messages
  add constraint chatbot_messages_citations_array_check
  check (jsonb_typeof(citations) = 'array') not valid;

alter table public.chatbot_messages
  validate constraint chatbot_messages_citations_array_check;

comment on column public.chatbots.memory_enabled is
  'Autorise l injection de la memoire entreprise et des connaissances propres au chatbot.';
comment on column public.chatbots.learning_enabled is
  'Autorise l extraction de faits durables depuis les conversations lorsque la memoire est active.';
comment on column public.chatbots.web_enabled is
  'Autorise le modele a utiliser l outil OpenAI web_search pour obtenir des informations actuelles.';
comment on column public.chatbot_messages.citations is
  'Sources web affichees avec la reponse. Chaque element contient au minimum une URL et un titre.';
