## SUB-COMMIT C-1 — Regla anti-muletillas (única regla)

### Decisión previa
Sub-commit 1 (orphan `<th>Peso</th>`) se cierra SIN cambios. No se toca `src/lib/technicalSheetHtml.ts`. El glosario queda intacto (Opción B).

### Cambio único en este sub-commit
Archivo: `supabase/functions/chat-intelligence-v2/prompts/narrativeQuality.ts`

Estado actual del prompt tras el revert: reglas 1–17 + 20 (con huecos 18/19 reservados). Para no rellenar huecos ya marcados como reservados, la nueva regla se añade como **regla 21**, inmediatamente después de la 20 ("NOMBRES COMPLETOS DE MÉTRICAS"), al final del string concatenado.

### Texto exacto de la regla 21 a añadir

```
21. PROHIBICIÓN DE MULETILLAS Y CLICHÉS PERIODÍSTICOS: está EXPRESAMENTE PROHIBIDO usar muletillas, clichés periodísticos o frases hechas en cualquier parte del informe (resumen ejecutivo, análisis, recomendaciones, alertas, pies de tabla). Lista no exhaustiva de expresiones VETADAS: "hallazgo clave", "farolillo rojo", "talón de Aquiles", "punta del iceberg", "luces y sombras", "asignatura pendiente", "caballo de batalla", "piedra angular", "pone el foco", "saca pecho", "pasa factura", "marca la diferencia", "da un golpe sobre la mesa", "juega un papel", "no es oro todo lo que reluce", y cualquier metáfora periodística equivalente. En su lugar, usa lenguaje DIRECTO Y DESCRIPTIVO que nombre el hecho concreto: en vez de "farolillo rojo del grupo" escribe "la empresa con menor RIX del grupo (52,3)"; en vez de "talón de Aquiles" escribe "la submétrica más débil"; en vez de "hallazgo clave" escribe "el dato más relevante es" o directamente expón el dato sin preámbulo. Antes de emitir la respuesta final, revisa el texto y sustituye cualquier muletilla por su equivalente descriptivo.
```

### Lo que NO se toca en este sub-commit
- Anglicismos ("snapshot") — siguiente sub-commit.
- Decimales en prosa / redondeo — siguiente sub-commit.
- Adjetivos vacíos ("robusta", "sólido", "compacto") — siguiente sub-commit.
- Inversión de pirámide — siguiente sub-commit.
- Código de tablas, headers, renderers (A.1–B.2 intactos).
- `technicalSheetHtml.ts` (intacto).
- Reglas 1–17 y 20 existentes (intactas, sin reescritura).

### Verificación esperada (la ejecuta Marco)
1. Re-deploy de `chat-intelligence-v2` (la edición del prompt requiere redeploy de la edge function que lo consume).
2. Sanity IBEX → revisar HTML generado: 0 ocurrencias de "hallazgo clave", "farolillo rojo", "talón de Aquiles".
3. Si Sanity pasa, avanzar al sub-commit C-2 (anglicismo "snapshot").

### Entrega al cerrar el sub-commit
Confirmar: archivo modificado (`narrativeQuality.ts`), número de regla añadida (**21**), y que ninguna otra regla fue reescrita.
