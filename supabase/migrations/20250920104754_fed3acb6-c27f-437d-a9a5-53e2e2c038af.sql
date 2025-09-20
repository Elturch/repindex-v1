-- Add counter column to repindex_root_issuers table for Make.com integration
ALTER TABLE public.repindex_root_issuers 
ADD COLUMN counter SERIAL;