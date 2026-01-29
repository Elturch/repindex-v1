-- Añadir columna verified_competitors a repindex_root_issuers
-- Almacena array JSON de tickers de competidores directos verificados manualmente
-- Si está vacío, el sistema usará fallback por categoría/subsector

ALTER TABLE repindex_root_issuers 
ADD COLUMN verified_competitors jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN repindex_root_issuers.verified_competitors IS 
'Lista de tickers de competidores directos verificados manualmente. Formato: ["SAN", "CABK", "SAB"]. Si está vacío, se usan competidores por categoría con declaración explícita.';

-- Crear índice GIN para consultas eficientes en el array JSON
CREATE INDEX idx_repindex_verified_competitors ON repindex_root_issuers USING GIN (verified_competitors jsonb_path_ops);