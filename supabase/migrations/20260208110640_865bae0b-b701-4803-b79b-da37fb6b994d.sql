-- Nueva columna para clasificar el resultado del scrape
ALTER TABLE corporate_scrape_progress
ADD COLUMN IF NOT EXISTS result_type TEXT DEFAULT NULL;

-- Valores posibles:
-- 'success_with_news' - Encontró y guardó noticias nuevas
-- 'success_no_news' - Scrape OK pero sin noticias nuevas (< 30 días)
-- 'success_corporate_only' - Solo datos corporativos, sin sección de noticias
-- 'error_timeout' - Timeout de Firecrawl (reintentable)
-- 'error_rate_limit' - Rate limit (reintentable)
-- 'error_website_down' - Website caído temporalmente (reintentable)
-- 'error_blocked' - Website bloqueó el scraper (permanente)
-- 'error_no_website' - No tiene website configurado (permanente)
-- 'error_parsing' - Error parseando la respuesta (reintentable)

-- Añadir columna para última fecha de noticias encontradas
ALTER TABLE corporate_scrape_progress
ADD COLUMN IF NOT EXISTS latest_news_date DATE DEFAULT NULL;

-- Añadir columna para conteo de noticias encontradas en este scrape
ALTER TABLE corporate_scrape_progress
ADD COLUMN IF NOT EXISTS news_found_count INTEGER DEFAULT 0;

-- Crear índice para búsquedas eficientes de errores reintentables
CREATE INDEX IF NOT EXISTS idx_corporate_scrape_result_type 
ON corporate_scrape_progress(sweep_id, status, result_type, retry_count);