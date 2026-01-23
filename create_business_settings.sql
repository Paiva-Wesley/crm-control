CREATE TABLE IF NOT EXISTS business_settings (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    desired_profit_percent DECIMAL(10, 2) DEFAULT 15.00,
    platform_tax_rate DECIMAL(10, 2) DEFAULT 18.00,
    monthly_revenue JSONB DEFAULT '{"jan": 33000, "feb": 33000, "mar": 33000, "apr": 33000, "may": 33000, "jun": 33000, "jul": 33000, "aug": 33000, "sep": 33000, "oct": 33000, "nov": 33000, "dec": 33000}'::jsonb
);
INSERT INTO business_settings (desired_profit_percent, platform_tax_rate)
SELECT 15.00,
    18.00
WHERE NOT EXISTS (
        SELECT 1
        FROM business_settings
    );