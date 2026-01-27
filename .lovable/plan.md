
# Plan: Sistema de Sugerencias Inteligentes con Efecto "Guau"

## Problema Actual

Las sugerencias del chat son **100% estáticas**: 4 preguntas hardcodeadas por página que nunca cambian. Esto genera:
- Fatiga del usuario al ver siempre lo mismo
- Pérdida de oportunidades de engagement
- Sensación de que el sistema no "conoce" al usuario

## Solución: Sugerencias Dinámicas en 3 Niveles

### Nivel 1: Usuario Nuevo (Sin Historial)
**Sugerencias aleatorias del pool + datos en vivo**

```
┌─────────────────────────────────────────────────────────────────┐
│  💡 Sugerencias para ti                                         │
├─────────────────────────────────────────────────────────────────┤
│  🔥 Renta 4 lidera el ranking con 92 puntos - ¿Por qué destaca?│
│  📊 ¿Qué sectores tienen mejor reputación esta semana?          │
│  ⚡ Compara el sector bancario vs energético                    │
│  🎯 ¿Cuáles son las empresas más volátiles?                    │
└─────────────────────────────────────────────────────────────────┘
```

**Lógica:**
- Pool de ~20 templates por ruta (en vez de 4 fijas)
- Aleatorización en cada carga de página
- Inyección de datos reales: top empresa, sector del momento, etc.

---

### Nivel 2: Usuario con Historial (Personalizado)
**Sugerencias basadas en conversaciones previas**

```
┌─────────────────────────────────────────────────────────────────┐
│  ✨ Basado en tus análisis anteriores                           │
├─────────────────────────────────────────────────────────────────┤
│  📈 Actualización: Telefónica ha subido 3 pts desde tu último  │
│     análisis - ¿Cómo está ahora?                                │
│  🔄 Continúa tu análisis de Iberdrola vs Telefónica             │
│  🆕 Nuevo: BBVA tiene divergencia entre IAs - Analizar         │
│  💼 Preguntaste por el sector energético - Ver novedades       │
└─────────────────────────────────────────────────────────────────┘
```

**Lógica:**
- Extrae empresas mencionadas en historial del usuario
- Compara scores actuales vs momento de última consulta
- Detecta sectores de interés recurrente
- Genera preguntas de "continuación" inteligentes

---

### Nivel 3: Sugerencias "Sorpresa" (Datos en Tiempo Real)
**Descubrimientos automáticos de la semana**

```
┌─────────────────────────────────────────────────────────────────┐
│  🎯 Descubrimientos de esta semana                              │
├─────────────────────────────────────────────────────────────────┤
│  ⚠️ 3 empresas del IBEX35 han caído más de 5 puntos            │
│  🏆 Nueva líder en telecomunicaciones: MASORANGE (84 pts)       │
│  🤖 ChatGPT y DeepSeek discrepan 15 pts sobre Telefónica       │
│  📉 El sector construcción muestra tendencia bajista           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Arquitectura Técnica

### Nuevo Hook: `useSmartSuggestions`

```typescript
interface SmartSuggestion {
  text: string;
  type: 'random' | 'personalized' | 'discovery';
  icon: string;
  priority: number;
  metadata?: {
    company?: string;
    previousScore?: number;
    currentScore?: number;
    source: 'history' | 'live_data' | 'template';
  };
}

function useSmartSuggestions(
  userId: string | null,
  language: string,
  route: string
): {
  suggestions: SmartSuggestion[];
  isLoading: boolean;
  refresh: () => void;
}
```

### Flujo de Generación

```text
┌─────────────────────────────────────────────────────────────────┐
│                    useSmartSuggestions                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. ¿Usuario autenticado?                                       │
│     │                                                           │
│     ├─── NO ──→ [Pool Aleatorio] + [Datos en Vivo]             │
│     │           - Seleccionar 4 de pool de 20                  │
│     │           - Inyectar top empresa, sector destacado       │
│     │                                                           │
│     └─── SÍ ──→ [Historial Usuario] + [Datos en Vivo]          │
│                 │                                               │
│                 ├── Extraer empresas de últimas 10 preguntas   │
│                 ├── Comparar scores actuales vs históricos     │
│                 ├── Detectar sectores de interés               │
│                 └── Generar mix personalizado:                 │
│                     • 2 sugerencias personalizadas             │
│                     • 1 descubrimiento de datos                │
│                     • 1 aleatorio del pool                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `src/hooks/useSmartSuggestions.ts` | **NUEVO** - Hook principal de sugerencias inteligentes |
| `src/hooks/usePageContext.ts` | Expandir pool de templates a 20 por ruta |
| `src/components/chat/ChatMessages.tsx` | Usar nuevo hook, renderizar badges de tipo |
| `src/lib/chatTranslations.ts` | Añadir traducciones para etiquetas de tipo |

---

## Detalles de Implementación

### 1. Nuevo archivo: `src/hooks/useSmartSuggestions.ts`

```typescript
// Estructura principal del hook
export function useSmartSuggestions(
  userId: string | null,
  languageCode: string,
  currentRoute: string
) {
  // 1. Cargar pool de templates expandido
  const templatePool = getExpandedTemplates(languageCode, currentRoute);
  
  // 2. Cargar datos en vivo (top empresas, sectores)
  const { liveData } = useLiveInsights();
  
  // 3. Si hay usuario, cargar historial
  const { userHistory } = useUserHistory(userId);
  
  // 4. Generar mix de sugerencias
  const suggestions = useMemo(() => {
    if (!userId || !userHistory?.length) {
      // Usuario nuevo: aleatorio + datos vivos
      return generateRandomSuggestions(templatePool, liveData, 4);
    }
    
    // Usuario con historial: personalizado
    return generatePersonalizedSuggestions(
      userHistory,
      liveData,
      templatePool,
      4
    );
  }, [userId, userHistory, liveData, templatePool]);
  
  return { suggestions, refresh, isLoading };
}
```

### 2. Funciones de Generación

**Para usuarios nuevos:**
```typescript
function generateRandomSuggestions(pool, liveData, count) {
  // Seleccionar aleatoriamente del pool
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, count);
  
  // Inyectar datos en vivo en templates
  return selected.map(template => ({
    text: injectLiveData(template, liveData),
    type: 'random',
    icon: '💡'
  }));
}

// Template example: "{{topCompany}} lidera con {{topScore}} puntos - ¿Por qué?"
// Output: "Renta 4 lidera con 92 puntos - ¿Por qué?"
```

**Para usuarios con historial:**
```typescript
function generatePersonalizedSuggestions(history, liveData, pool, count) {
  const suggestions = [];
  
  // 1. Extraer empresas mencionadas
  const mentionedCompanies = extractCompaniesFromHistory(history);
  
  // 2. Para cada empresa, comparar score actual vs último análisis
  for (const company of mentionedCompanies.slice(0, 2)) {
    const currentScore = liveData.scores[company.ticker];
    const previousScore = company.lastKnownScore;
    
    if (Math.abs(currentScore - previousScore) >= 3) {
      suggestions.push({
        text: `${company.name} ha ${currentScore > previousScore ? 'subido' : 'bajado'} ${Math.abs(currentScore - previousScore)} pts desde tu último análisis`,
        type: 'personalized',
        icon: currentScore > previousScore ? '📈' : '📉',
        metadata: { company: company.name, previousScore, currentScore }
      });
    }
  }
  
  // 3. Añadir descubrimiento de datos
  if (liveData.topDivergence) {
    suggestions.push({
      text: `Las IAs discrepan ${liveData.topDivergence.diff} pts sobre ${liveData.topDivergence.company}`,
      type: 'discovery',
      icon: '🤖'
    });
  }
  
  // 4. Completar con aleatorios
  const remaining = count - suggestions.length;
  suggestions.push(...generateRandomSuggestions(pool, liveData, remaining));
  
  return suggestions;
}
```

### 3. Pool de Templates Expandido (20 por ruta)

```typescript
// En usePageContext.ts - expandir de 4 a 20 templates
'/chat': {
  name: 'Agente Rix',
  suggestions: [
    // Templates estáticos (variedad)
    '¿Cuáles son las 5 empresas con mejor RIX Score?',
    '¿Qué empresas del IBEX35 lideran esta semana?',
    'Compara el sector bancario vs energético',
    '¿Qué empresas han sido más volátiles?',
    // ... más templates
    
    // Templates con placeholders para datos vivos
    '{{topCompany}} lidera el ranking - ¿Por qué destaca?',
    '{{topSector}} es el sector mejor valorado - Analizar',
    '{{bottomCompany}} tiene el score más bajo - ¿Qué pasa?',
    '{{divergenceCompany}} genera discrepancia entre IAs',
    // ... más templates dinámicos
  ]
}
```

### 4. Componente Visual Actualizado

```tsx
// En ChatMessages.tsx
<div className="grid grid-cols-1 gap-2 w-full">
  <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-2">
    {tr.suggestions}
    {hasPersonalized && (
      <Badge variant="secondary" className="text-[10px]">
        ✨ Personalizadas
      </Badge>
    )}
  </p>
  {suggestions.map((suggestion, idx) => (
    <Button
      key={idx}
      variant="outline"
      className="justify-start text-left h-auto py-3 px-4 hover:bg-accent group"
      onClick={() => onStarterPrompt(suggestion.text)}
    >
      <span className="mr-2">{suggestion.icon}</span>
      <span className="text-sm">{suggestion.text}</span>
      {suggestion.type === 'personalized' && (
        <Badge variant="outline" className="ml-auto text-[9px] opacity-60">
          Basado en tu historial
        </Badge>
      )}
    </Button>
  ))}
</div>
```

---

## Traducciones Necesarias

```typescript
// En chatTranslations.ts
personalizedSuggestions: string;  // "Basado en tu historial"
discoverySuggestions: string;     // "Descubrimiento"
refreshSuggestions: string;       // "Ver otras sugerencias"
```

---

## Efecto Visual "Guau"

### Animación de Entrada
```css
/* Sugerencias aparecen con stagger animation */
.suggestion-item {
  animation: slideInUp 0.3s ease-out;
  animation-fill-mode: both;
}
.suggestion-item:nth-child(1) { animation-delay: 0.05s; }
.suggestion-item:nth-child(2) { animation-delay: 0.1s; }
.suggestion-item:nth-child(3) { animation-delay: 0.15s; }
.suggestion-item:nth-child(4) { animation-delay: 0.2s; }
```

### Botón de Refresh
```tsx
<Button 
  variant="ghost" 
  size="sm" 
  onClick={refresh}
  className="text-xs text-muted-foreground"
>
  <RefreshCw className="h-3 w-3 mr-1" />
  Ver otras sugerencias
</Button>
```

---

## Resultado Esperado

### Usuario Nuevo
```
┌─────────────────────────────────────────────────────────────────┐
│  💡 Sugerencias                           [🔄 Ver otras]        │
├─────────────────────────────────────────────────────────────────┤
│  🏆 Renta 4 lidera con 92 pts - ¿Por qué destaca?              │
│  ⚡ El sector energético tiene 5 empresas en top 10            │
│  🤖 ¿Cómo evalúan las IAs al sector bancario?                  │
│  📊 Compara empresas cotizadas vs no cotizadas                 │
└─────────────────────────────────────────────────────────────────┘

[Cada recarga muestra 4 diferentes del pool de 20]
```

### Usuario con Historial (efecto "Guau")
```
┌─────────────────────────────────────────────────────────────────┐
│  ✨ Sugerencias personalizadas            [🔄 Ver otras]        │
├─────────────────────────────────────────────────────────────────┤
│  📈 Telefónica +5 pts desde tu análisis del 24/01 ─ Historial  │
│  🔄 Continúa: Iberdrola vs sector energético       ─ Historial  │
│  🤖 Nuevo: ChatGPT y Gemini discrepan sobre BBVA   ─ En vivo   │
│  💡 ¿Qué empresas small cap destacan esta semana?              │
└─────────────────────────────────────────────────────────────────┘

[El usuario ve que el sistema "recuerda" sus análisis]
```

---

## Tiempo Estimado

| Tarea | Tiempo |
|-------|--------|
| Crear `useSmartSuggestions.ts` | 25 min |
| Expandir pool de templates | 15 min |
| Actualizar `ChatMessages.tsx` | 15 min |
| Añadir traducciones | 5 min |
| Testing y ajustes | 10 min |
| **Total** | **~70 minutos** |

---

## Notas Técnicas

### Queries Necesarias para Personalización

```sql
-- Empresas mencionadas por el usuario
SELECT DISTINCT 
  company,
  MAX(created_at) as last_mentioned
FROM chat_intelligence_sessions
WHERE user_id = $1 AND role = 'user' AND company IS NOT NULL
GROUP BY company
ORDER BY last_mentioned DESC
LIMIT 5;

-- Datos en vivo para templates
SELECT 
  "03_target_name" as company,
  "05_ticker" as ticker,
  "09_rix_score" as score
FROM rix_runs
WHERE "09_rix_score" IS NOT NULL
ORDER BY batch_execution_date DESC, "09_rix_score" DESC
LIMIT 10;
```

### Caché y Performance
- Las sugerencias se generan una vez por carga de página
- El botón "refresh" regenera sin nueva llamada a DB (usa datos ya cargados)
- Datos de historial se cachean en memoria durante la sesión
