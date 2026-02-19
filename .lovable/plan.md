
# Añadir Rol: Experto Pericial de Reputación

## Por qué requiere un tratamiento especial

Todos los roles existentes adaptan el *tono* del informe estándar (ejecutivo, periodístico, financiero…). El perfil pericial es estructuralmente distinto: **prohíbe recomendaciones estratégicas** (el Pilar 3 actual las exige obligatoriamente), usa tercera persona forense, y tiene un estándar de evidencia propio (cadena de custodia, antes/después, no causalidad, solo correlación).

Si se añade como un rol normal con un prompt insertado entre Pilar 1 y Pilar 2, el sistema forzará igualmente el Pilar 3 con "Activaciones inmediatas" y "Tácticas operativas" — justo lo que el perito no puede incluir en un dictamen.

**Solución**: El rol se registra en el catálogo front-end, pero en el edge function se detecta por `roleId === 'perito_reputacional'` y se usa un system prompt completamente distinto, diseñado desde cero para producir documentos periciales, no informes ejecutivos.

---

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/lib/chatRoles.ts` | Nueva categoría `pericial` + nuevo rol `perito_reputacional` |
| `supabase/functions/chat-intelligence/index.ts` | Rama especial en `handleEnrichRequest` para el rol pericial |

---

## Cambio 1 — `src/lib/chatRoles.ts`

### Nueva categoría
```ts
export const ROLE_CATEGORIES = {
  ...
  pericial: 'Peritaje y Legal',
} as const;
```

### Nuevo rol
```ts
{
  id: 'perito_reputacional',
  emoji: '🔏',
  name: 'Experto Pericial de Reputación',
  shortDescription: 'Dictámenes periciales, valor probatorio, rigor forense',
  category: 'pericial',
  prompt: `[ver abajo]`,
}
```

El campo `prompt` del rol describe en términos ejecutivos el tipo de documento que se quiere. El edge function lo ignorará en favor del system prompt forense dedicado, pero queda como documentación del rol.

---

## Cambio 2 — `supabase/functions/chat-intelligence/index.ts` — rama pericial

En `handleEnrichRequest` (línea ~2254), antes del system prompt estándar, se añade:

```ts
if (roleId === 'perito_reputacional') {
  return await handlePericialEnrichRequest(
    roleName, originalQuestion, originalResponse,
    sessionId, logPrefix, supabaseClient, userId
  );
}
```

La nueva función `handlePericialEnrichRequest` construye un system prompt con esta estructura forense:

---

### Estructura del informe pericial generado

```
DICTAMEN PERICIAL DE REPUTACIÓN CORPORATIVA
Elaborado con metodología RepIndex — Universidad Complutense de Madrid

1. IDENTIFICACIÓN DEL OBJETO DE ANÁLISIS
   Entidad analizada · periodo · modelos consultados · fecha de extracción

2. METODOLOGÍA Y CADENA DE CUSTODIA
   Descripción del sistema RepIndex · qué mide cada modelo · 
   cómo se recogen los datos · fecha y hora de recogida

3. CONSTATACIÓN DE HECHOS MEDIBLES
   Tabla de métricas con puntuación, fecha, modelo concreto, semáforo.
   Solo métricas con dato disponible. "No se dispone de evidencia suficiente" 
   cuando aplique.

4. ANÁLISIS POR MÉTRICA PRIORIZADA
   — Coherencia Informativa: ¿coinciden los modelos en los datos básicos?
   — Fortaleza de Evidencia: ¿las afirmaciones tienen respaldo verificable?
   — Gestión de Controversias: ¿hay narrativas de riesgo activas?
   — Calidad de la Narrativa: ¿con qué atributos se describe la empresa?

5. DIVERGENCIAS ENTRE MODELOS
   Tabla modelo × métrica cuando los valores se separan > 10 puntos.
   Se documenta modelo + afirmación exacta detectada + fecha.

6. EVOLUCIÓN TEMPORAL (si hay datos)
   Estado previo al evento → estado posterior.
   Deltas concretos con fecha. Sin afirmar causalidad; solo 
   "se observa una correlación temporal entre X e Y".

7. CONCLUSIONES PERICIALES
   Solo lo que los datos permiten sostener.
   Si los datos no respaldan una conclusión, se declara explícitamente.
   Base cuantitativa para valoración económica por perito especializado.

8. FUENTES Y TRAZABILIDAD
   Modelos consultados · versión metodológica · documentación de soporte.
```

### Reglas del system prompt pericial

- Tercera persona siempre. Verbos: "se constata", "se observa", "los datos evidencian", "resulta acreditado", "no se dispone de evidencia suficiente para".
- Prohibido: valoraciones subjetivas, recomendaciones estratégicas, lenguaje comercial, "creemos", "sugerimos".
- Cada afirmación: dato + modelo concreto + fecha de recogida.
- Divergencias documentadas modelo por modelo, nunca promediadas.
- No cuantificación económica del daño, sí base cuantitativa (puntos perdidos, posiciones, deltas).
- Referenciar metodología RepIndex y validación UCM como marco de credibilidad.
- Mínimo 2.000 palabras para garantizar cobertura documental suficiente.

---

## Lo que NO cambia

- El resto de roles existentes: sin tocar.
- La lógica de datos, SQL, Vector Store, streaming, anti-alucinación.
- El formato estándar del Embudo Narrativo para todos los demás roles.
- El botón "Descargar informe" funciona igualmente con el output pericial.

---

## Despliegue

Tras los cambios en código, se despliega el edge function `chat-intelligence`.
