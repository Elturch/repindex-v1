

# Plan: Limpiar datos duplicados de Acciona Energia y tickers huerfanos

## Problema confirmado

Acciona Energia tiene **12 registros** en `rix_runs_v2` para la semana actual cuando deberia tener solo 6:

| Ticker | ChatGPT | Deepseek | Gemini | Grok | Perplexity | Qwen | Estado |
|--------|---------|----------|--------|------|------------|------|--------|
| `ANE` | 69 | 48 | 58 | 51 | 59 | 55 | DUPLICADO (borrar) |
| `ANE.MC` | 46 | 56 | 66 | 60 | 59 | 63 | CANONICO (mantener) |

El ticker canonico en `repindex_root_issuers` es `ANE.MC`. Los registros con ticker `ANE` son residuos de un barrido anterior y deben eliminarse.

Cuando el pipeline SQL-to-Narrative genera un JOIN con la tabla maestra, ambos conjuntos coinciden (porque `ANE` + `.MC` = `ANE.MC`), asi que el LLM recibe dos filas para la misma empresa con scores distintos y cita el incorrecto (69 en vez de 46).

Ademas hay 3 tickers huerfanos adicionales que no causan duplicados pero ensucian los datos:
- `APPS` (Applus Services) -- el ticker canonico es `AS`
- `CAT` (Catalana Occidente) -- el ticker canonico es `GCO.MC`
- `CEP.MC` (Cepsa) -- no existe en la tabla maestra

## Solucion

### Paso 1 -- Eliminar los 6 registros duplicados de ANE (sin .MC)

Borrar de `rix_runs_v2` los registros con `05_ticker = 'ANE'` para el periodo actual. Esto deja solo los 6 registros correctos con ticker `ANE.MC` (ChatGPT=46, que es el score real).

### Paso 2 -- Actualizar la SQL de generacion para prevenir futuros duplicados

Modificar el prompt de generacion SQL en `chat-intelligence/index.ts` para que el JOIN priorice el ticker canonico de `repindex_root_issuers` y excluya registros que no esten en la tabla maestra. Esto se logra cambiando la instruccion del SQL schema prompt para incluir:

```text
IMPORTANTE: Solo incluir registros cuyo ticker exista en repindex_root_issuers.
Usar siempre: JOIN repindex_root_issuers i ON i.ticker = r."05_ticker" 
              OR i.ticker = r."05_ticker" || '.MC'
Y anadir: WHERE NOT EXISTS (
  SELECT 1 FROM rix_runs_v2 r2 
  WHERE r2."05_ticker" = r."05_ticker" || '.MC' 
  AND r2."06_period_from" = r."06_period_from"
  AND r2."02_model_name" = r."02_model_name"
)
```

Esto asegura que si existen registros con `ANE` y `ANE.MC` para la misma semana y modelo, solo se usa el canonico (`ANE.MC`).

### Paso 3 -- Limpiar tickers huerfanos historicos (opcional pero recomendado)

Eliminar los registros de `APPS`, `CAT` y `CEP.MC` del periodo actual ya que no corresponden a tickers validos en la tabla maestra.

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/chat-intelligence/index.ts` | Actualizar el SQL schema prompt para incluir regla de deduplicacion por ticker canonico |
| Operacion de datos (no archivo) | DELETE de registros con ticker `ANE` del periodo `2026-02-01` |
| Operacion de datos (no archivo) | DELETE de registros huerfanos `APPS`, `CAT`, `CEP.MC` del periodo `2026-02-01` |

## Resultado esperado

- Acciona Energia: solo 6 registros (ANE.MC), ChatGPT = 46 (correcto)
- Sin duplicados que confundan al LLM
- Tickers huerfanos eliminados del periodo actual
- El pipeline SQL-to-Narrative protegido contra futuros duplicados por la regla de deduplicacion en el prompt

