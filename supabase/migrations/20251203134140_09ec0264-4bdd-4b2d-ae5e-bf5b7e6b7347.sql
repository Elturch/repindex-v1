-- Add data_quality_report column to weekly_news table
ALTER TABLE public.weekly_news 
ADD COLUMN IF NOT EXISTS data_quality_report jsonb DEFAULT NULL;