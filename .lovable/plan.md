
# Plan: Corrección del Error de Liderazgo de Telefónica en Agente Rix

## Diagnóstico Confirmado

El Agente Rix está mencionando incorrectamente a "José María Álvarez-Pallete" como Presidente de Telefónica cuando en realidad ya no lo es (Marc Murtra fue nombrado Presidente en 2025). Este error ocurre tanto en preview como en producción.

### Causas Raíz Identificadas

| Causa | Descripción | Impacto |
|-------|-------------|---------|
| **Scraping vacío** | El `corporate_snapshots` para TEF tiene `ceo_name`, `president_name`, `chairman_name` = NULL | Sin datos verificados |
| **Alucinación del LLM** | Cuando no hay datos del Memento Corporativo, la IA usa conocimiento desactualizado de entrenamiento | Información falsa |
| **Sin bloqueo de vacíos** | El sistema no advierte al LLM que NO debe inventar datos de liderazgo cuando no hay verificados | Permite alucinaciones |

### Por qué NO afectan los cambios no publicados

Los cambios recientes (unificación de dashboards) son solo de frontend. El error ocurre en el edge function `chat-intelligence` que usa la misma base de datos en preview y producción.

---

## Fase 1: Corrección Inmediata del Scraping de Telefónica (30 min)

### 1.1 Diagnosticar el problema del scraper

El scraper de `firecrawl-corporate-scrape` probablemente no está encontrando la página correcta con el equipo directivo de Telefónica.

Verificar:
- URL del sitio de Telefónica para equipo directivo
- Patrones de extracción actuales
- Logs del último scrape de TEF

### 1.2 Actualizar patrones de extracción

Añadir URLs específicas de Telefónica al scraper:
- `https://www.telefonica.com/es/nosotros/consejo-de-administracion/`
- `https://www.telefonica.com/es/nosotros/equipo-directivo/`

### 1.3 Re-ejecutar scraping de Telefónica

Lanzar scraping manual específico para TEF desde el panel de administración.

---

## Fase 2: Refuerzo del "Memento Corporativo" Anti-Alucinaciones (45 min)

### 2.1 Modificar el system prompt en `chat-intelligence`

Cuando `president_name`, `ceo_name`, o `chairman_name` son NULL, añadir instrucción explícita:

```typescript
// En la sección de Memento Corporativo
if (!memento.president_name && !memento.ceo_name && !memento.chairman_name) {
  context += `⚠️ **ADVERTENCIA CRÍTICA**: NO hay datos verificados de liderazgo para ${companyName}.\n`;
  context += `🚫 **PROHIBIDO**: NO menciones nombres de ejecutivos, presidentes o CEOs.\n`;
  context += `✅ **CORRECTO**: Si te preguntan sobre liderazgo, responde: "No dispongo de datos verificados sobre el equipo directivo actual de [Empresa]. Te recomiendo consultar su web corporativa."\n\n`;
}
```

### 2.2 Añadir validación de "no_inventar"

En el system prompt principal, añadir regla estricta:

```
## REGLA ANTI-ALUCINACIÓN DE LIDERAZGO
NUNCA menciones nombres de ejecutivos, CEOs o presidentes de empresas españolas 
SALVO que aparezcan explícitamente en el MEMENTO CORPORATIVO con fecha de verificación.

Si el Memento Corporativo tiene campos vacíos para liderazgo:
- Di: "No dispongo de datos verificados sobre el equipo directivo actual"
- NO uses tu conocimiento de entrenamiento para nombrar ejecutivos
- Los cargos corporativos cambian frecuentemente y tu información puede estar desactualizada
```

---

## Fase 3: Verificación Cruzada con Búsqueda Web (30 min)

### 3.1 Añadir verificación de liderazgo en tiempo real

Si el usuario pregunta sobre liderazgo y el Memento está vacío:
1. El Agente puede sugerir consultar la web corporativa
2. Opcionalmente, hacer una mini-búsqueda web para verificar

### 3.2 Implementar flag de "datos_sensibles"

Marcar ciertos campos como sensibles (CEO, Presidente) que requieren verificación reciente (< 30 días) para ser mencionados con certeza.

---

## Fase 4: Corrección Manual de Datos de Telefónica (10 min)

### 4.1 Insertar datos correctos manualmente

Mientras se arregla el scraper, insertar datos correctos vía SQL:

```sql
UPDATE corporate_snapshots 
SET 
  president_name = 'Marc Murtra',
  ceo_name = 'Ángel Vilá',
  chairman_name = NULL,
  snapshot_date_only = CURRENT_DATE
WHERE ticker = 'TEF' 
  AND snapshot_date_only = (SELECT MAX(snapshot_date_only) FROM corporate_snapshots WHERE ticker = 'TEF');
```

**NOTA**: Confirmar estos nombres con fuentes oficiales antes de ejecutar.

---

## Fase 5: Auditoría de Otras Empresas (20 min)

### 5.1 Identificar otras empresas con liderazgo vacío

```sql
SELECT ticker, ceo_name, president_name, snapshot_date_only
FROM corporate_snapshots 
WHERE snapshot_date_only = (SELECT MAX(snapshot_date_only) FROM corporate_snapshots)
  AND ceo_name IS NULL 
  AND president_name IS NULL;
```

### 5.2 Priorizar re-scraping de empresas IBEX-35

Las empresas del IBEX-35 son las más consultadas y deben tener datos de liderazgo actualizados.

---

## Resumen de Cambios

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/chat-intelligence/index.ts` | Añadir regla anti-alucinación para datos de liderazgo vacíos |
| `supabase/functions/firecrawl-corporate-scrape/index.ts` | Añadir patrones específicos para Telefónica y otras empresas con estructura diferente |
| Base de datos `corporate_snapshots` | Corrección manual de datos de liderazgo para TEF y empresas críticas |

---

## Tiempo Estimado

| Fase | Tiempo |
|------|--------|
| Fase 1: Corrección scraping | 30 min |
| Fase 2: Anti-alucinaciones | 45 min |
| Fase 3: Verificación cruzada | 30 min |
| Fase 4: Corrección manual | 10 min |
| Fase 5: Auditoría | 20 min |
| **Total** | **~2.5 horas** |

---

## Notas Técnicas

- El error afecta a ambos entornos (preview y producción) porque comparten base de datos
- Los cambios no publicados (unificación de dashboard) NO causan este problema
- La prioridad es evitar que el LLM invente datos de liderazgo cuando no tiene verificados
- Una vez corregido, el sistema debe propagar automáticamente los datos correctos al Vector Store
