-- Fix security warning: set search_path on trigger function
CREATE OR REPLACE FUNCTION public.update_sales_conversation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;