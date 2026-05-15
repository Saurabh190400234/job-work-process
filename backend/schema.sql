CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  full_name text DEFAULT '',
  password_hash text NOT NULL,
  is_admin boolean DEFAULT false,
  customer_name text DEFAULT '',
  is_active boolean DEFAULT true,
  page_permissions text[] DEFAULT '{}',
  created_at timestamp DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS customer_name text DEFAULT '';

CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_name text NOT NULL UNIQUE,
  city text DEFAULT '',
  contact text DEFAULT '',
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL UNIQUE,
  city text DEFAULT '',
  contact text DEFAULT '',
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_masters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bpcs_no text NOT NULL,
  vendor_name text NOT NULL,
  shape text NOT NULL,
  grade text NOT NULL,
  size_mm numeric NOT NULL,
  input_weight_kg numeric NOT NULL,
  net_input_weight_kg numeric NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (bpcs_no, vendor_name)
);

CREATE TABLE IF NOT EXISTS raw_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text DEFAULT '',
  shape text DEFAULT '',
  grade text DEFAULT '',
  size_mm numeric,
  stock_kg numeric DEFAULT 0,
  fixed_kg numeric DEFAULT 0,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bos_grns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_invoice text NOT NULL,
  product_id uuid,
  component_code text NOT NULL,
  vendor_name text NOT NULL,
  grn_date date NOT NULL,
  qty_mt numeric NOT NULL,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vendor_end_grns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bos_grn_id uuid,
  lot_no text,
  received_date date NOT NULL,
  received_mt numeric NOT NULL,
  remarks text DEFAULT '',
  created_at timestamp DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE vendor_end_grns DROP CONSTRAINT IF EXISTS vendor_end_grns_bos_grn_id_fkey;
ALTER TABLE vendor_end_grns ADD COLUMN IF NOT EXISTS lot_no text;
UPDATE vendor_end_grns
SET lot_no = bos_grn_id
WHERE lot_no IS NULL
  AND bos_grn_id IS NOT NULL
  AND bos_grn_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
UPDATE vendor_end_grns
SET bos_grn_id = NULL
WHERE bos_grn_id IS NOT NULL
  AND bos_grn_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
ALTER TABLE vendor_end_grns ALTER COLUMN bos_grn_id TYPE uuid USING bos_grn_id::uuid;

CREATE TABLE IF NOT EXISTS job_work_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bos_grn_id uuid,
  lot_no text NOT NULL UNIQUE,
  vendor text NOT NULL,
  component_code text NOT NULL,
  issue_date date NOT NULL,
  raw_issued_kg numeric NOT NULL,
  output_stage text DEFAULT 'finished',
  produced_qty numeric DEFAULT 0,
  scrap_kg numeric DEFAULT 0,
  end_cut_kg numeric DEFAULT 0,
  balance_raw_kg numeric DEFAULT 0,
  receipt_date date,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE job_work_lots ADD COLUMN IF NOT EXISTS bos_grn_id uuid;
ALTER TABLE job_work_lots ADD COLUMN IF NOT EXISTS end_cut_kg numeric DEFAULT 0;

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS full_address text DEFAULT '';
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS pan_card_url text DEFAULT '';
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS aadhar_card_url text DEFAULT '';
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS cancel_cheque_url text DEFAULT '';
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS gst_url text DEFAULT '';
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS other_doc_url text DEFAULT '';

CREATE TABLE IF NOT EXISTS vendor_documents (
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  data bytea NOT NULL,
  updated_at timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (vendor_id, field_name)
);

CREATE TABLE IF NOT EXISTS vendor_productions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_no text,
  component_code text NOT NULL,
  production_date date NOT NULL,
  semi_finished_pieces numeric DEFAULT 0,
  scrap_mt numeric DEFAULT 0,
  remarks text DEFAULT '',
  created_at timestamp DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer text NOT NULL,
  component_code text NOT NULL,
  due_date date NOT NULL,
  required_qty numeric NOT NULL,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer text NOT NULL,
  component_code text NOT NULL,
  sale_date date NOT NULL,
  invoice_no text NOT NULL,
  sold_qty numeric NOT NULL,
  rate_per_piece numeric DEFAULT 0,
  remarks text DEFAULT '',
  created_at timestamp DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO vendor_end_grns (bos_grn_id, lot_no, received_date, received_mt, remarks)
SELECT l.bos_grn_id, l.lot_no, COALESCE(l.receipt_date, l.issue_date),
  l.raw_issued_kg / 1000,
  'Auto-created for existing components-ready lot during flow repair'
FROM job_work_lots l
WHERE l.receipt_date IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM vendor_end_grns v
    WHERE v.lot_no = l.lot_no
  );
