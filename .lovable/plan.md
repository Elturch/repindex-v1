

# Correccion de la composicion IBEX-35 en toda la base de datos

## Problema detectado

La base de datos tiene **5 empresas mal clasificadas** en su campo `ibex_family_code`, lo que provoca que el dashboard y el chat muestren datos incorrectos al filtrar por IBEX-35:

| Empresa | Ticker | Estado actual (DB) | Estado real | Accion |
|---|---|---|---|---|
| Catalana Occidente | GCO.MC | IBEX-35 | IBEX Medium Cap | Degradar a IBEX-MC |
| Solaria Energia | SLR | IBEX-35 | IBEX Medium Cap | Degradar a IBEX-MC |
| Acciona Energia | ANE.MC / ANE | IBEX-MC | IBEX 35 | Promover a IBEX-35 |
| CIE Automotive | CIE | IBEX-MC | IBEX 35 | Promover a IBEX-35 |
| Melia Hotels | MEL | IBEX-MC | IBEX 35 | Promover a IBEX-35 |

Esto afecta a **3 tablas**:
- `repindex_root_issuers` (tabla maestra, 5 registros)
- `rix_trends` (datos historicos, ~282 registros)
- Potencialmente el Vector Store (metadata de documentos)

## Solucion

Ejecutar 6 sentencias SQL (via herramienta de datos) para corregir las 3 tablas de forma atomica:

### 1. Corregir `repindex_root_issuers` (tabla maestra)

```sql
-- Degradar GCO.MC y SLR de IBEX-35 a IBEX-MC
UPDATE repindex_root_issuers 
SET ibex_family_code = 'IBEX-MC', ibex_family_category = 'IBEX Medium Cap'
WHERE ticker IN ('GCO.MC', 'SLR');

-- Promover ANE.MC, CIE, MEL a IBEX-35
UPDATE repindex_root_issuers 
SET ibex_family_code = 'IBEX-35', ibex_family_category = 'IBEX 35'
WHERE ticker IN ('ANE.MC', 'CIE', 'MEL');
```

### 2. Corregir `rix_trends` (datos historicos)

```sql
-- Degradar GCO.MC y SLR
UPDATE rix_trends 
SET ibex_family_code = 'IBEX-MC'
WHERE ticker IN ('GCO.MC', 'SLR') AND ibex_family_code = 'IBEX-35';

-- Promover ANE, ANE.MC, CIE, MEL (ANE aparece sin .MC en trends)
UPDATE rix_trends 
SET ibex_family_code = 'IBEX-35'
WHERE ticker IN ('ANE', 'ANE.MC', 'CIE', 'MEL') AND ibex_family_code = 'IBEX-MC';
```

### 3. Corregir bug en chat-intelligence

El codigo del chat tiene referencias a `'IBEX35'` (sin guion) en lugar de `'IBEX-35'` en las lineas ~1086 y ~2025, lo que hace que los fallbacks de IBEX-35 nunca funcionen. Corregir esas 2 referencias.

### 4. Verificar el resultado

Tras la correccion, la tabla maestra deberia tener exactamente **35 empresas** con `ibex_family_code = 'IBEX-35'` (sale 2 y entran 3, pasando de 35 a 36 -- pero debemos verificar que el total final es correcto segun la composicion real).

## Nota importante

La composicion real puede incluir 36 o 37 miembros dependiendo de la fuente (Markets Insider muestra tambien Mediaset Espana que no esta en nuestro censo). Se verificara el conteo final post-correccion.

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| Base de datos (via SQL) | UPDATE en `repindex_root_issuers` y `rix_trends` |
| `supabase/functions/chat-intelligence/index.ts` | Corregir `'IBEX35'` a `'IBEX-35'` en lineas ~1086 y ~2025 |

