-- Add frais prélèvement column to pricing configs
ALTER TABLE pricing_configs
ADD COLUMN frais_prelevement Decimal(10, 2) NOT NULL DEFAULT 0.00;
