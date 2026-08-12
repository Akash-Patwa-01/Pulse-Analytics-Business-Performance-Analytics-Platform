-- Pulse Analytics PostgreSQL schema for Supabase
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  period_start date not null,
  period_end date not null,
  leads numeric not null default 0 check (leads >= 0),
  calls numeric not null default 0 check (calls >= 0),
  website_visits numeric not null default 0 check (website_visits >= 0),
  revenue numeric(14,2) not null default 0 check (revenue >= 0),
  conversions numeric not null default 0 check (conversions >= 0),
  conversion_rate numeric(8,3) not null default 0 check (conversion_rate >= 0),
  previous_period_start date,
  previous_period_end date,
  created_at timestamptz not null default now()
);

create table if not exists public.report_rows (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  period text not null check (period in ('current','previous')),
  report_date date not null,
  leads numeric not null default 0 check (leads >= 0),
  calls numeric not null default 0 check (calls >= 0),
  website_visits numeric not null default 0 check (website_visits >= 0),
  revenue numeric(14,2) not null default 0 check (revenue >= 0),
  conversions numeric not null default 0 check (conversions >= 0),
  created_at timestamptz not null default now()
);

create index if not exists reports_user_id_idx on public.reports(user_id);
create index if not exists report_rows_user_id_idx on public.report_rows(user_id);
create index if not exists report_rows_report_id_idx on public.report_rows(report_id);

alter table public.profiles enable row level security;
alter table public.reports enable row level security;
alter table public.report_rows enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "reports_select_own" on public.reports;
create policy "reports_select_own" on public.reports
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own" on public.reports
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "reports_update_own" on public.reports;
create policy "reports_update_own" on public.reports
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "reports_delete_own" on public.reports;
create policy "reports_delete_own" on public.reports
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "report_rows_select_own" on public.report_rows;
create policy "report_rows_select_own" on public.report_rows
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "report_rows_insert_own" on public.report_rows;
create policy "report_rows_insert_own" on public.report_rows
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "report_rows_delete_own" on public.report_rows;
create policy "report_rows_delete_own" on public.report_rows
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Automatically create a profile row after signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do update
    set full_name = excluded.full_name,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Keep profile updated_at current.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();
