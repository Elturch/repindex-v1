-- Add cotiza_en_bolsa column to repindex_root_issuers table
ALTER TABLE public.repindex_root_issuers 
ADD COLUMN cotiza_en_bolsa boolean NOT NULL DEFAULT true;

-- Add comment to explain the column
COMMENT ON COLUMN public.repindex_root_issuers.cotiza_en_bolsa IS 'Indica si la empresa cotiza actualmente en bolsa española (BME, MAB, etc.)';