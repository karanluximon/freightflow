-- FreightFlow Database Schema
-- Run this in your Supabase SQL editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- SHIPMENTS table
create table shipments (
  id uuid primary key default uuid_generate_v4(),
  file_number text unique not null, -- e.g. IMP-2025-001
  status text not null default 'New File' check (status in ('New File','Docs Pending','Customs','Delivery','Complete','On Hold')),

  -- Shipment details
  awb text,
  house_awb text,
  agent text,
  origin text,
  supplier text not null,
  flight_vessel text,
  packages int,
  weight_kg numeric,
  arrival_date date,

  -- Client / consignee
  client_name text not null,
  client_email text,
  delivery_address text,
  eori_number text,
  vat_number text,
  contact_name text,
  contact_phone text,
  consignee_confirmed boolean default false,
  consignee_confirmed_at timestamptz,

  -- Internal
  notes text,
  quotation text,
  debours text,

  -- Checklist (stored as jsonb for flexibility)
  checklist jsonb default '{
    "invoice": false,
    "packing_list": false,
    "awb_received": false,
    "mandate": false,
    "consignee_ok": false,
    "customs_done": false,
    "delivery_scheduled": false,
    "invoice_sent": false,
    "payment_received": false
  }'::jsonb,

  -- Tokens for public consignee form
  consignee_token uuid default uuid_generate_v4(),

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- DOCUMENTS table (track uploaded docs per shipment)
create table documents (
  id uuid primary key default uuid_generate_v4(),
  shipment_id uuid references shipments(id) on delete cascade,
  doc_type text not null check (doc_type in ('invoice','packing_list','awb','mandate','other')),
  file_name text not null,
  file_url text not null,
  uploaded_at timestamptz default now()
);

-- EMAIL LOG table
create table email_log (
  id uuid primary key default uuid_generate_v4(),
  shipment_id uuid references shipments(id) on delete cascade,
  recipient text not null,
  subject text not null,
  template text,
  sent_at timestamptz default now(),
  status text default 'sent'
);

-- COMMENTS / ACTIVITY LOG
create table activity_log (
  id uuid primary key default uuid_generate_v4(),
  shipment_id uuid references shipments(id) on delete cascade,
  action text not null,
  detail text,
  created_at timestamptz default now()
);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger shipments_updated_at
  before update on shipments
  for each row execute function update_updated_at();

-- Auto-generate file number
create or replace function generate_file_number()
returns trigger as $$
declare
  year_part text;
  seq_num int;
  new_file_number text;
begin
  year_part := to_char(now(), 'YYYY');
  select count(*) + 1 into seq_num
  from shipments
  where file_number like 'IMP-' || year_part || '-%';
  new_file_number := 'IMP-' || year_part || '-' || lpad(seq_num::text, 3, '0');
  new.file_number := new_file_number;
  return new;
end;
$$ language plpgsql;

create trigger set_file_number
  before insert on shipments
  for each row
  when (new.file_number is null or new.file_number = '')
  execute function generate_file_number();

-- Row Level Security (enable for production)
alter table shipments enable row level security;
alter table documents enable row level security;
alter table email_log enable row level security;
alter table activity_log enable row level security;

-- For now: allow all authenticated users (tighten per team/org later)
create policy "Authenticated users can do everything on shipments"
  on shipments for all using (auth.role() = 'authenticated');

create policy "Authenticated users can do everything on documents"
  on documents for all using (auth.role() = 'authenticated');

create policy "Authenticated users can do everything on email_log"
  on email_log for all using (auth.role() = 'authenticated');

create policy "Authenticated users can do everything on activity_log"
  on activity_log for all using (auth.role() = 'authenticated');

-- PUBLIC access for consignee token lookup (no auth needed for the public form)
create policy "Public can read shipment by token"
  on shipments for select using (true);

create policy "Public can update consignee fields by token"
  on shipments for update using (true)
  with check (true);

-- Seed some sample data
insert into shipments (file_number, status, awb, agent, origin, supplier, client_name, client_email, packages, weight_kg, arrival_date, notes, checklist) values
('IMP-2025-001', 'Customs', '112-75724246', 'DTW', 'CHINE', 'MOON SHANGHAI INTERNATIONAL', 'NOZADIS', 'nozadis@example.com', 52, 480, '2025-04-28', 'Regular client - 2nd shipment', '{"invoice":true,"packing_list":true,"awb_received":true,"mandate":true,"consignee_ok":true,"customs_done":false,"delivery_scheduled":false,"invoice_sent":false,"payment_received":false}'),
('IMP-2025-002', 'Docs Pending', '047-3116-5595', 'EASY SHIPPING', 'CHINE', 'VALLOUREC SOLUCOES', 'VALLOUREC FR', 'imports@vallourec.fr', 1, 198, '2025-04-29', '', '{"invoice":true,"packing_list":false,"awb_received":true,"mandate":false,"consignee_ok":false,"customs_done":false,"delivery_scheduled":false,"invoice_sent":false,"payment_received":false}'),
('IMP-2025-003', 'New File', '999-0603-6726', 'BSI', 'CHINE', 'DONGGUAN BUILTER', 'OXYSIGN', 'contact@oxysign.fr', 12, 9091, null, 'Relance mandat 22/04', '{"invoice":false,"packing_list":false,"awb_received":true,"mandate":false,"consignee_ok":false,"customs_done":false,"delivery_scheduled":false,"invoice_sent":false,"payment_received":false}');
