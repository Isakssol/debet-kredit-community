-- Bokföringsrådgivaren: konversationshistorik för chatten
create table advisor_messages (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

alter table advisor_messages enable row level security;
create policy "authenticated full access" on advisor_messages
  for all to authenticated using (true) with check (true);
