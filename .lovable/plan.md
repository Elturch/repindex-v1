

# Corrección IBEX 35: Acciona Energía y Catalana Occidente

## Resumen del Cotejo

Se han comparado las 35 empresas de la imagen oficial con las 35 empresas marcadas como IBEX-35 en la base de datos. **33 de 35 coinciden perfectamente**. Los 2 errores detectados son:

| Empresa | Ticker | Estado actual en DB | Estado correcto (imagen) |
|---------|--------|--------------------|-----------------------|
| Acciona Energía | ANE.MC | IBEX-MC | IBEX-35 |
| Catalana Occidente | GCO.MC | IBEX-35 | IBEX-MC |

## Registros afectados

| Tabla | Ticker | ibex_family_code actual | Corrección | Filas |
|-------|--------|------------------------|------------|-------|
| `repindex_root_issuers` | ANE.MC | IBEX-MC | IBEX-35 | 1 |
| `repindex_root_issuers` | GCO.MC | IBEX-35 | IBEX-MC | 1 |
| `rix_trends` | ANE.MC | IBEX-MC | IBEX-35 | 12 |
| `rix_trends` | ANE | IBEX-35 | Ya correcto | 57 (sin cambio) |
| `rix_trends` | GCO.MC | IBEX-35 | IBEX-MC | 12 |
| `rix_trends` | CAT | MC-OTHER | IBEX-MC | 64 |

## SQL a ejecutar

### Paso 1: Tabla maestra

```sql
-- Acciona Energía: IBEX-MC → IBEX-35
UPDATE repindex_root_issuers 
SET ibex_family_code = 'IBEX-35',
    ibex_family_category = 'IBEX 35',
    ibex_status = 'active_now'
WHERE ticker = 'ANE.MC';

-- Catalana Occidente: IBEX-35 → IBEX-MC
UPDATE repindex_root_issuers 
SET ibex_family_code = 'IBEX-MC',
    ibex_family_category = 'IBEX Medium Cap'
WHERE ticker = 'GCO.MC';
```

### Paso 2: Datos historicos en rix_trends

```sql
-- Acciona Energía (ticker ANE.MC)
UPDATE rix_trends 
SET ibex_family_code = 'IBEX-35'
WHERE ticker = 'ANE.MC';

-- Catalana Occidente (ambos tickers historicos)
UPDATE rix_trends 
SET ibex_family_code = 'IBEX-MC'
WHERE ticker IN ('GCO.MC', 'CAT');
```

### Paso 3: Verificacion

```sql
SELECT COUNT(DISTINCT ticker) as ibex35_count 
FROM repindex_root_issuers 
WHERE ibex_family_code = 'IBEX-35';
-- Esperado: 35
```

## Archivos a modificar

Ninguno. Correcciones puramente de datos via SQL.

## Resultado esperado

- IBEX-35 tendra exactamente 35 empresas correctas segun la lista oficial
- Acciona Energia aparecera en rankings y filtros IBEX-35
- Catalana Occidente se mostrara como IBEX Medium Cap
- Datos historicos en rix_trends quedaran corregidos retroactivamente
- Total de filas modificadas: ~90

