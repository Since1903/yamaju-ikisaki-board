create extension if not exists pgcrypto;

create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null unique,
  name text not null,
  department_id uuid references departments(id),
  role_name text,
  email text,
  microsoft_user_id text,
  kintone_user_code text,
  bugyo_employee_code text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists current_status (
  employee_id uuid primary key references employees(id) on delete cascade,
  status_code text not null default 'IN_OFFICE',
  destination text,
  purpose text,
  return_at timestamptz,
  phone_available boolean not null default true,
  direct_go boolean not null default false,
  direct_return boolean not null default false,
  note text,
  source_type text not null default 'MANUAL',
  source_id text,
  manual_override_until timestamptz,
  updated_by uuid references employees(id),
  updated_at timestamptz not null default now()
);

create table if not exists schedules (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status_code text not null,
  title text,
  destination text,
  purpose text,
  source_type text not null,
  source_id text,
  source_updated_at timestamptz,
  priority integer not null default 0,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_type, source_id)
);

create table if not exists status_history (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  changed_at timestamptz not null default now(),
  before_status jsonb,
  after_status jsonb not null,
  source_type text not null,
  source_id text,
  changed_by uuid references employees(id)
);

create table if not exists integration_settings (
  id uuid primary key default gen_random_uuid(),
  integration_type text not null unique,
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_schedules_employee_time on schedules(employee_id,start_at,end_at);
create index if not exists idx_history_employee_changed on status_history(employee_id,changed_at desc);
