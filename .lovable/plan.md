

# Plan: Sistema de Sanificación de Respuestas Bilingüe

## Problema Identificado

Los datos actuales muestran que **34% de las respuestas de Grok son rechazos** (39/114):

| Idioma | Ejemplos de rechazos detectados |
|--------|--------------------------------|
| Inglés | "I'm sorry, but I can't...", "I must decline to generate...", "I cannot provide a report with fabricated..." |
| Español | "Lo siento, no puedo generar informes ficticios...", "Eso violaría mis directrices de proporcionar información precisa..." |

## Solución: Acción `sanitize` Bilingüe

Extender `rix-quality-watchdog` con reglas de validación en ambos idiomas.

### Patrones de Rechazo (Español + Inglés)

```typescript
const REJECTION_PATTERNS = [
  // === INGLÉS ===
  /I('m| am) sorry/i,
  /I must decline/i,
  /I cannot (provide|generate|create|assist)/i,
  /I can('t|not) (assist|generate|provide)/i,
  /I apologize/i,
  /decline (this|the) request/i,
  /violates my guidelines/i,
  /misleading (or|information)/i,
  /fabricat(ed|ing)|fictional report/i,
  /future (time )?period/i,
  /beyond my knowledge/i,
  /invented information/i,
  /no real (data|information)/i,
  
  // === ESPAÑOL ===
  /Lo siento/i,
  /no puedo (generar|proporcionar|crear|asistir)/i,
  /debo declinar/i,
  /violar(ía|a) mis directrices/i,
  /información (ficticia|inventada|engañosa)/i,
  /informes? (ficticios?|especulativos?)/i,
  /eventos? futuros?/i,
  /no existe información/i,
  /proporcionar información precisa/i,
  /no es posible generar/i,
];
```

### Reglas de Validación Completas

```typescript
interface ValidationResult {
  isValid: boolean;
  errorType: 'rejection' | 'too_short' | 'no_structure' | null;
  reason: string | null;
  language?: 'es' | 'en' | 'unknown';
}

function validateResponse(response: string | null): ValidationResult {
  // Sin respuesta
  if (!response || response.trim().length === 0) {
    return { isValid: false, errorType: 'too_short', reason: 'Empty response' };
  }

  // Demasiado corta (< 500 chars = casi seguro inválida)
  if (response.length < 500) {
    return { 
      isValid: false, 
      errorType: 'too_short', 
      reason: `Only ${response.length} chars (min: 500)` 
    };
  }

  // Detectar idioma para patrones
  const isSpanish = /[áéíóúñ¿¡]/i.test(response) || 
                    /\b(del|para|con|que|los|las)\b/i.test(response);

  // Patrones de rechazo (bilingüe)
  for (const pattern of REJECTION_PATTERNS) {
    if (pattern.test(response)) {
      return { 
        isValid: false, 
        errorType: 'rejection', 
        reason: `Matched rejection pattern: ${pattern.toString().slice(0, 30)}...`,
        language: isSpanish ? 'es' : 'en'
      };
    }
  }

  // Respuestas sospechosamente cortas (500-2000 chars) sin estructura
  if (response.length < 2000) {
    const hasStructure = /## (Resumen|Summary|Hechos|Noticias|Context)/i.test(response);
    if (!hasStructure) {
      return { 
        isValid: false, 
        errorType: 'no_structure', 
        reason: 'Short response without expected report structure' 
      };
    }
  }

  return { isValid: true, errorType: null, reason: null };
}
```

## Flujo de Sanificación

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ rix-quality-watchdog (action: sanitize)                                │
│                                                                         │
│  1. ESCANEAR: Leer todas las columnas de respuesta bruta               │
│     - 20_res_gpt_bruto                                                  │
│     - 21_res_perplex_bruto                                             │
│     - 22_res_gemini_bruto                                              │
│     - 23_res_deepseek_bruto                                            │
│     - respuesta_bruto_grok                                             │
│     - respuesta_bruto_qwen                                             │
│                                                                         │
│  2. VALIDAR: Aplicar reglas bilingües a cada respuesta                 │
│     - Detectar rechazos en español e inglés                            │
│     - Detectar respuestas < 500 caracteres                             │
│     - Detectar respuestas sin estructura de informe                    │
│                                                                         │
│  3. REGISTRAR: Insertar en data_quality_reports                        │
│     - status = 'invalid_response'                                      │
│     - error_type = 'rejection' | 'too_short' | 'no_structure'          │
│     - original_error = patrón que lo detectó                           │
│                                                                         │
│  4. RETORNAR: Estadísticas de sanificación                             │
│     - scanned: total de respuestas revisadas                           │
│     - invalidFound: total de inválidas                                 │
│     - byModel: desglose por modelo                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

## Dashboard: Nueva Sección de Calidad

Añadir al `SweepHealthDashboard.tsx` una sección de calidad de respuestas:

```text
┌───────────────────────────────────────────────────────────────────────┐
│ CALIDAD DE RESPUESTAS                                                │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  🟢 1,650 válidas    🟡 39 inválidas    🔴 12 sin datos              │
│                                                                       │
│  Modelos con problemas:                                              │
│  • Grok: 36 rechazos (rechazó analizar "período futuro")            │
│  • DeepSeek: 3 respuestas cortas                                     │
│                                                                       │
│  [ 🔍 Sanificar Ahora ]   [ 🔧 Reparar Inválidas ]                   │
└───────────────────────────────────────────────────────────────────────┘
```

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `supabase/functions/rix-quality-watchdog/index.ts` | Nueva acción `sanitize` con patrones bilingües (español + inglés) |
| `src/components/admin/SweepHealthDashboard.tsx` | Nueva sección "Calidad de Respuestas" con botones de sanificación |

## Resultado Esperado

| Métrica | Antes | Después |
|---------|-------|---------|
| Rechazos detectados | 0 (pasaban desapercibidos) | 39+ de Grok |
| Idiomas soportados | Solo inglés | Español + Inglés |
| Respuestas cortas detectadas | No | Sí (< 500 chars) |
| Acción de reparación | Manual | Automática vía botón |

## Flujo de Uso

1. **Automático**: CRON ejecuta `sanitize` el lunes tras el barrido
2. **Manual**: Admin pulsa "Sanificar Ahora" en el dashboard
3. **Reparación**: El `repair` existente procesa las respuestas marcadas como `invalid_response`

