create table public.rix_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null,
  title text not null,
  question text not null,
  filters jsonb not null,
  summary jsonb,
  created_at timestamptz not null default now()
);

create index rix_reports_user_created_idx
  on public.rix_reports (user_id, created_at desc);

create unique index rix_reports_user_session_uidx
  on public.rix_reports (user_id, session_id);

alter table public.rix_reports enable row level security;

create policy "rix_reports_owner_select" on public.rix_reports
  for select using (auth.uid() = user_id);
create policy "rix_reports_owner_insert" on public.rix_reports
  for insert with check (auth.uid() = user_id);
create policy "rix_reports_owner_update" on public.rix_reports
  for update using (auth.uid() = user_id);
create policy "rix_reports_owner_delete" on public.rix_reports
  for delete using (auth.uid() = user_id);