-- =============================================================
-- Nexora AI Forge — enquiries table (Supabase / PostgreSQL)
-- -------------------------------------------------------------
-- Run this once in: Supabase Dashboard → SQL Editor → New query
--
-- Writing to this table happens ONLY from the Netlify Function
-- using the SERVICE ROLE key (server-side secret). RLS is
-- enabled with no public policies, so anonymous visitors can
-- never read or write enquiries directly from the browser.
-- =============================================================

create table if not exists public.enquiries (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),

  -- New → Contacted → In Discussion → Converted / Closed
  status       text not null default 'New'
               check (status in ('New', 'Contacted', 'In Discussion', 'Converted', 'Closed')),

  name         text not null,
  email        text not null,
  phone        text,
  company      text,
  service      text not null,
  budget       text,
  message      text not null,
  contact_pref text default 'Email',
  source       text default 'website'
);

-- Block all direct browser access (the server role bypasses RLS).
alter table public.enquiries enable row level security;

create index if not exists enquiries_status_idx on public.enquiries (status);
create index if not exists enquiries_created_at_idx on public.enquiries (created_at desc);

-- Optional: view new leads quickly
-- select * from public.enquiries where status = 'New' order by created_at desc;
