-- Rådgivaren: konversationer med historik. Befintliga meddelanden flyttas
-- in i en första konversation så inget går förlorat.
create table advisor_conversations (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Ny konversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table advisor_conversations enable row level security;
create policy "authenticated full access" on advisor_conversations
  for all to authenticated using (true) with check (true);

alter table advisor_messages
  add column conversation_id uuid references advisor_conversations(id) on delete cascade;

-- Backfill: lägg alla gamla meddelanden i en konversation
do $$
declare conv_id uuid;
begin
  if exists (select 1 from advisor_messages where conversation_id is null) then
    insert into advisor_conversations (title) values ('Tidigare konversation') returning id into conv_id;
    update advisor_messages set conversation_id = conv_id where conversation_id is null;
  end if;
end $$;

alter table advisor_messages alter column conversation_id set not null;
create index on advisor_messages (conversation_id, created_at);
create index on advisor_conversations (updated_at desc);
