-- Förslagskön: AI-genererade konteringsförslag som väntar på godkännande.
-- Källa: banktransaktion utan regelträff eller fil i underlagsinkorgen.
create table suggestion_queue (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('bank_tx', 'inbox_attachment')),
  bank_transaction_id uuid references bank_transactions(id),
  attachment_id uuid references attachments(id),
  suggestion jsonb not null,          -- validerad AiSuggestion
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'dismissed')),
  verification_id uuid references verifications(id),  -- sätts vid godkännande
  created_at timestamptz not null default now()
);

-- En väntande post per källa (dubblettskydd vid omkörning)
create unique index suggestion_queue_bank_tx_pending
  on suggestion_queue (bank_transaction_id) where status = 'pending' and bank_transaction_id is not null;
create unique index suggestion_queue_attachment_pending
  on suggestion_queue (attachment_id) where status = 'pending' and attachment_id is not null;

alter table suggestion_queue enable row level security;
create policy "authenticated full access" on suggestion_queue
  for all to authenticated using (true) with check (true);
