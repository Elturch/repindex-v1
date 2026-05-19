## Problema

En el bloque **"7. Recomendaciones estratégicas accionables"** el agente recortó a 5 entidades (HOS, HLA, HMH, VIA, VIT) y dejó fuera a **Quirónsalud (#6)**, justo la que estaba en peor situación relativa. La regla actual del prompt dice *"MÍNIMO 5"* y el LLM la interpreta como tope superior + orden por ranking descendente.

## Causa raíz

`supabase/functions/chat-intelligence-v2/prompts/rankingMode.ts` (líneas 63-70):

```
## 7. Recomendaciones estratégicas accionables (MÍNIMO 5, ESPECÍFICAS POR EMPRESA)
Genera AL MENOS 5 recomendaciones que cumplan TODOS los criterios:
...
Distribuye las recomendaciones cubriendo idealmente todas las empresas del alcance, no solo el líder.
```

"Mínimo 5" + "idealmente todas" → el modelo se queda en 5. No hay regla dura de cobertura total ni de orden por debilidad.

## Cambio propuesto (1 archivo, solo prompt)

Editar `supabase/functions/chat-intelligence-v2/prompts/rankingMode.ts` en el bloque de la sección 7:

1. Cambiar el título a **"UNA POR CADA EMPRESA DEL ALCANCE"**.
2. Sustituir *"AL MENOS 5"* por una regla dura: **una recomendación obligatoria por cada empresa del ranking**, sin techo (si hay 6 → 6; si hay 10 → 10).
3. Forzar el **orden por peor situación reputacional primero** (las más débiles encabezan la sección, porque son las que más lo necesitan).
4. Añadir prohibición explícita: *"si una entidad aparece en el ranking de la sección 2, DEBE tener su propia recomendación en la sección 7"*, y *"no agrupes varias empresas en una sola recomendación"*.

Mantengo intactos los criterios (a)-(e) ya existentes (cuantificación, fuente real, prioridad, accionabilidad, anti-fabricación).

## Fuera de alcance

- No tocar `recommendations.ts` (esa skill es para perfil individual, no para ranking).
- No tocar `companyAnalysis.ts`, `sectorRanking.ts` ni la lógica de orquestación.
- No tocar UI, edge functions ni base de datos.

## Verificación

Regenerar el mismo informe (grupos privados de salud, 6 empresas, ventana 18-abr → 17-may) y confirmar que la sección 7 contiene **6 recomendaciones**, una por empresa, ordenadas de peor a mejor RIX, con Quirónsalud incluida.
