

## Diagnóstico Test 26: "Sector defensa: evolución último mes"

### Causa raíz: Timeout del LLM, no del data fetch

**Los datos existen y se recuperan rápido:**
- 6 tickers: AIR, PSG, CASH, IDR, AMP, EME-PRIV
- 30 rows por ticker en el último mes (180 rows total)
- La query a `rix_runs_v2` completa sin problemas

**El cuello de botella está en la generación del LLM:**
1. El `skillSectorSnapshot` genera un DATAPACK con ~180 rows de `per_model_detail` (6 empresas × 6 modelos × ~5 semanas)
2. Cada row incluye `resumen` (500 chars), `puntos_clave`, `flags`, y los 8 sub-scores
3. El DATAPACK serializado supera fácilmente los 50-80K tokens
4. El LLM tiene un timeout de 120 segundos y `max_tokens: 40000`
5. Con un DATAPACK tan grande, el LLM no alcanza a completar la respuesta antes del timeout

### Solución propuesta

**Optimizar el tamaño del DATAPACK para consultas de grupo canónico + evolución:**

1. **Truncar `per_model_detail` en sector snapshots** (líneas 967-991): Cuando hay >4 empresas, limitar `resumen` a 200 chars y eliminar `puntos_clave` y `flags` de las rows que no son del líder/colista. Esto reduce el payload ~60%.

2. **Limitar `evolucion_sector` a las últimas 4 semanas reales** (ya se hace, pero verificar que no se envían semanas duplicadas por zona horaria).

3. **Reducir `20_res_gpt_bruto` y `21_res_perplex_bruto`** en `per_model_detail`: Estos campos de texto crudo se pasan al LLM pero son enormes. Eliminarlos del DATAPACK serializado y usarlos solo para extracción de fuentes.

### Cambios en código

**Archivo: `supabase/functions/chat-intelligence/index.ts`**

- **Líneas 967-991** (`per_model_detail` construction): Añadir truncado condicional cuando `issuers.length > 4`:
  - `resumen`: max 200 chars (vs 500)
  - `puntos_clave`: omitir para empresas que no son líder/colista
  - `20_res_gpt_bruto`, `21_res_perplex_bruto`: excluir del DATAPACK serializado

- **Línea 6340-6350** (DATAPACK serialization): Asegurar que los campos brutos (`20_res_gpt_bruto`, `21_res_perplex_bruto`) se extraen para fuentes ANTES de serializar, y luego se eliminan del JSON enviado al LLM.

### Resultado esperado

El DATAPACK para "Sector defensa: evolución último mes" pasará de ~70K tokens a ~25K tokens, permitiendo al LLM completar la respuesta dentro de los 120 segundos de timeout.

