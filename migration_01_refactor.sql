-- Migration: Structure Refactoring
-- Created at: 2026-01-23
-- Description: Multi-tenancy, Sales table, Revenue table, Cleanup
BEGIN;
-- 1. Create companies table
CREATE TABLE IF NOT EXISTS companies (
    id bigserial PRIMARY KEY,
    name text NOT NULL DEFAULT 'Minha Empresa',
    created_at timestamp DEFAULT now()
);
-- Insert default company
INSERT INTO companies (id, name)
SELECT 1,
    'Minha Empresa'
WHERE NOT EXISTS (
        SELECT 1
        FROM companies
    );
-- 2. Add company_id to existing tables
-- We handle specific tables to be safe
ALTER TABLE products
ADD COLUMN IF NOT EXISTS company_id bigint REFERENCES companies(id) DEFAULT 1;
ALTER TABLE ingredients
ADD COLUMN IF NOT EXISTS company_id bigint REFERENCES companies(id) DEFAULT 1;
ALTER TABLE product_ingredients
ADD COLUMN IF NOT EXISTS company_id bigint REFERENCES companies(id) DEFAULT 1;
ALTER TABLE fixed_costs
ADD COLUMN IF NOT EXISTS company_id bigint REFERENCES companies(id) DEFAULT 1;
ALTER TABLE business_settings
ADD COLUMN IF NOT EXISTS company_id bigint REFERENCES companies(id) DEFAULT 1;
ALTER TABLE sales_channels
ADD COLUMN IF NOT EXISTS company_id bigint REFERENCES companies(id) DEFAULT 1;
-- product_combos might need it too
ALTER TABLE product_combos
ADD COLUMN IF NOT EXISTS company_id bigint REFERENCES companies(id) DEFAULT 1;
-- 3. Create Sales table
CREATE TABLE IF NOT EXISTS sales (
    id bigserial PRIMARY KEY,
    company_id bigint REFERENCES companies(id) DEFAULT 1,
    product_id bigint REFERENCES products(id) ON DELETE CASCADE,
    quantity integer NOT NULL,
    sale_price numeric NOT NULL,
    sold_at timestamp DEFAULT now()
);
-- 4. Create Monthly Revenue table
CREATE TABLE IF NOT EXISTS monthly_revenue (
    id bigserial PRIMARY KEY,
    company_id bigint REFERENCES companies(id) DEFAULT 1,
    year integer NOT NULL,
    month integer NOT NULL,
    revenue numeric NOT NULL DEFAULT 0,
    created_at timestamp DEFAULT now(),
    UNIQUE(company_id, year, month)
);
-- 5. Migrate Monthly Revenue Data
INSERT INTO monthly_revenue (company_id, year, month, revenue)
SELECT COALESCE(bs.company_id, 1),
    2026,
    -- Defaulting to current year context
    CASE
        key
        WHEN 'jan' THEN 1
        WHEN 'feb' THEN 2
        WHEN 'mar' THEN 3
        WHEN 'apr' THEN 4
        WHEN 'may' THEN 5
        WHEN 'jun' THEN 6
        WHEN 'jul' THEN 7
        WHEN 'aug' THEN 8
        WHEN 'sep' THEN 9
        WHEN 'oct' THEN 10
        WHEN 'nov' THEN 11
        WHEN 'dec' THEN 12
    END,
    (value)::numeric
FROM business_settings bs,
    jsonb_each(bs.monthly_revenue)
WHERE bs.monthly_revenue IS NOT NULL ON CONFLICT (company_id, year, month) DO
UPDATE
SET revenue = EXCLUDED.revenue;
-- 6. Views
-- Drop existing view if exists (might depend on columns we want to drop)
DROP VIEW IF EXISTS product_costs_view;
DROP VIEW IF EXISTS product_profitability;
-- Create product_costs View (CMV)
-- "SUM(pi.quantity * i.cost_per_unit)"
CREATE OR REPLACE VIEW product_costs AS
SELECT p.id,
    p.company_id,
    COALESCE(SUM(pi.quantity * i.cost_per_unit), 0) AS cmv -- Corrected column name
FROM products p
    LEFT JOIN product_ingredients pi ON pi.product_id = p.id
    LEFT JOIN ingredients i ON i.id = pi.ingredient_id
GROUP BY p.id,
    p.company_id;
-- Create product_profitability View
CREATE OR REPLACE VIEW product_profitability AS
SELECT p.id,
    p.company_id,
    p.name,
    p.sale_price,
    pc.cmv,
    (p.sale_price - pc.cmv) AS gross_profit,
    CASE
        WHEN p.sale_price = 0 THEN 0
        ELSE ((p.sale_price - pc.cmv) / p.sale_price) * 100
    END AS margin_percent
FROM products p
    JOIN product_costs pc ON pc.id = p.id;
-- 7. Drop Legacy Columns
ALTER TABLE products DROP COLUMN IF EXISTS cost_price CASCADE;
ALTER TABLE products DROP COLUMN IF EXISTS last_sales_qty CASCADE;
ALTER TABLE products DROP COLUMN IF EXISTS last_sales_total CASCADE;
ALTER TABLE products DROP COLUMN IF EXISTS average_sale_price CASCADE;
ALTER TABLE business_settings DROP COLUMN IF EXISTS monthly_revenue CASCADE;
COMMIT;