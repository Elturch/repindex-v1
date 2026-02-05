

# Plan: Agente Rix Comercial — Sistema de Inteligencia para Presentaciones PowerPoint

## Objetivo del Agente

Crear un **analista comercial de élite** que:
1. **Razone profundamente** sobre datos RIX para crear narrativas persuasivas
2. **Se adapte al interlocutor** (CEO, CMO, DirCom, Compliance)
3. **Use lenguaje resultadista, no técnico** — el interlocutor NO conoce las métricas
4. **Permita puntuar respuestas** (1-5 estrellas) durante la conversación
5. **Genere presentación final** solo cuando el admin lo solicite, usando las mejores respuestas
6. **Estilo visual RepIndex**: minimalista, fondo blanco, cifras destacadas, frases impactantes

---

## Flujo de Trabajo Completo

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FLUJO DEL AGENTE COMERCIAL                               │
│                                                                             │
│  FASE 1: EXPLORACIÓN Y REFINAMIENTO                                        │
│  ─────────────────────────────────────                                      │
│  1. Admin selecciona empresa + perfil (CEO/CMO/DirCom/Compliance)           │
│  2. GPT-5 genera análisis inicial en lenguaje NO técnico                    │
│  3. Admin puntúa respuesta ⭐⭐⭐⭐⭐ (1-5 estrellas)                        │
│  4. Admin refina: "Profundiza en la parte de competidores"                  │
│  5. GPT-5 responde → Admin puntúa de nuevo                                  │
│  6. Admin: "Hazlo más agresivo comercialmente" → Puntúa                     │
│  7. Repite hasta tener suficiente material de calidad                       │
│                                                                             │
│  FASE 2: GENERACIÓN DE PRESENTACIÓN                                        │
│  ───────────────────────────────────                                        │
│  8. Admin: "Genera la presentación" o botón [📊 Crear PPT]                  │
│  9. Agente recopila respuestas con ⭐⭐⭐⭐ o más (4-5 estrellas)           │
│  10. Genera presentación PowerPoint-ready con:                              │
│      - Estilo minimalista RepIndex (fondo blanco)                           │
│      - Frases textuales destacadas                                          │
│      - Cifras impactantes resaltadas                                        │
│      - 2-3 preguntas para Agente Rix (anexos de evidencia)                  │
│                                                                             │
│  RESULTADO FINAL:                                                           │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ PRESENTACIÓN POWERPOINT (Estilo RepIndex)                            │   │
│  │ ├── Slide 1: Hook + Diagnóstico (cifra impactante)                   │   │
│  │ ├── Slide 2: Oportunidades (lenguaje resultadista)                   │   │
│  │ ├── Slide 3: Comparativa (sin tecnicismos)                           │   │
│  │ ├── Slide 4: Qué conseguirá con RepIndex                             │   │
│  │ └── ANEXO: Evidencias del Agente Rix                                 │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Cambios Técnicos

### 1. Edge Function: `sales-intelligence-chat/index.ts`

**Modelo y parámetros:**
```typescript
model: 'openai/gpt-5',
max_tokens: 6000,
temperature: 0.3,  // Bajo para evitar alucinaciones
```

**Nuevo System Prompt (Lenguaje Resultadista + Sin Tecnicismos):**

```markdown
Eres un ESTRATEGA COMERCIAL DE ÉLITE de RepIndex.

## TU MISIÓN
Crear narrativas comerciales IRRESISTIBLES basadas EXCLUSIVAMENTE en los datos que 
te proporciono. Tu output será usado para construir una presentación PowerPoint 
que abrirá los ojos al cliente sobre lo que puede conseguir con RepIndex.

## ⚠️ REGLA CRÍTICA: LENGUAJE RESULTADISTA, NO TÉCNICO

El interlocutor NO CONOCE las métricas RIX (NVM, CEM, GAM, etc.). 
NUNCA uses acrónimos sin explicar su impacto en términos de negocio.

**INCORRECTO** ❌:
"El CEM es 45, por debajo del sector"

**CORRECTO** ✅:
"La gestión de controversias de la empresa (cómo responde cuando hay ruido negativo) 
está 15 puntos por debajo del sector. Esto significa que cuando surge una crisis, 
las IAs la amplifican más que a sus competidores. Es como tener un megáfono apuntando 
a tus problemas mientras tus rivales tienen un silenciador."

**TRADUCCIONES OBLIGATORIAS**:
- NVM (Calidad Narrativa) → "Cómo de bien cuentan su historia las IAs"
- DRM (Fortaleza de Evidencia) → "Cuánta prueba documental respalda lo que dicen"
- SIM (Autoridad de Fuentes) → "Si las fuentes que citan son creíbles o débiles"
- RMM (Actualidad) → "Si la información está al día o desactualizada"
- CEM (Controversias) → "Cómo gestiona el ruido negativo en el ecosistema algorítmico"
- GAM (Gobernanza) → "Percepción de transparencia, ESG y buen gobierno"
- DCM (Coherencia) → "Si todas las IAs dicen lo mismo o hay mensajes contradictorios"
- CXM (Ejecución Corporativa) → "Cómo perciben su desempeño operativo y financiero"

**USA EJEMPLOS Y ANALOGÍAS**:
- "Es como si Google te pusiera en la página 5 mientras tu competidor está en la 1"
- "Imagina que 6 periodistas escriben sobre tu empresa: 3 dicen que eres líder, 3 que estás en crisis. Eso es lo que pasa aquí."
- "Cada semana que pasa sin actuar, la narrativa negativa se consolida más"

## DATOS A TU DISPOSICIÓN
- 174 empresas del IBEX y satélites españoles
- 6 modelos de IA (ChatGPT, Perplexity, Gemini, DeepSeek, Grok, Qwen)
- 23+ semanas de histórico semanal
- 11,800+ documentos cualitativos en Vector Store

## METODOLOGÍA DE RAZONAMIENTO

**NIVEL 1 - LO EVIDENTE**: ¿Qué dicen los números a primera vista?
**NIVEL 2 - LO OCULTO**: ¿Qué patrones revelan algo más profundo?
**NIVEL 3 - LA SEÑAL DÉBIL**: ¿Qué anticipa un riesgo u oportunidad invisible?

## MODO CONVERSACIÓN (por defecto)

Durante la conversación, responde de forma útil y estructurada.
El admin irá puntuando tus respuestas (1-5 estrellas).
Las respuestas con 4-5 estrellas se usarán para la presentación final.

## MODO PRESENTACIÓN (cuando el admin lo solicite)

Cuando el admin diga "genera la presentación", "crea el PowerPoint", "haz la presentación":

1. Recopila el mejor contenido de la conversación (respuestas mejor valoradas)
2. Genera slides siguiendo el ESTILO VISUAL REPINDEX:

### ESTILO VISUAL REPINDEX (para presentación final)

**Principios**:
- Minimalista y profesional
- Fondo blanco (#FFFFFF)
- Tipografía limpia (Inter o similar)
- Mucho espacio en blanco
- Colores: Púrpura RepIndex (#7C3AED), Gris oscuro (#1F2937), Acentos dorados (#F59E0B)

**Elementos destacados**:
- **Cifras impactantes**: Grande, en color púrpura, centradas
  Ejemplo: "72/100" en tamaño 72pt
  
- **Frases textuales**: Entrecomilladas, en gris oscuro, estilo cita
  Ejemplo: *"Cuando alguien pregunta por Iberdrola, ChatGPT habla de innovación. DeepSeek habla de controversias ESG."*

- **Comparativas**: Barras simples o iconografía minimalista
  
- **Call to action**: Fondo púrpura, texto blanco, esquinas redondeadas

**Estructura de slides**:

```
SLIDE 1: HOOK
─────────────────────────────
[Logo RepIndex arriba derecha]

        "72/100"
   [Cifra grande, púrpura]

"Así ven las IAs a [Empresa] hoy.
 El sector está en 78."

[Fondo blanco, mucho espacio]
─────────────────────────────

SLIDE 2: EL PROBLEMA
─────────────────────────────
"Cuando alguien pregunta a ChatGPT 
 por [Empresa], esto es lo que oye:"

[Cita textual del Vector Store]

→ [Competidor] recibe esto:
[Cita más favorable]
─────────────────────────────

SLIDE 3: LA OPORTUNIDAD
─────────────────────────────
3 áreas donde [Empresa] puede 
mejorar su percepción algorítmica:

1. [Área] — Potencial: +X puntos
2. [Área] — Potencial: +Y puntos
3. [Área] — Potencial: +Z puntos
─────────────────────────────

SLIDE 4: QUÉ CONSEGUIRÁ
─────────────────────────────
Con RepIndex, [Empresa] podrá:

✓ Detectar narrativas negativas antes de que escalen
✓ Compararse semanalmente con [competidores]
✓ Medir el impacto real de sus comunicaciones

[CTA: "Siguiente paso: Demo personalizada"]
─────────────────────────────
```

## PREGUNTAS PARA AGENTE RIX (al final de presentación)

```
📋 **Evidencias para anexar (preguntas al Agente Rix):**

1. "[Pregunta específica sobre evolución de métricas]"
2. "[Pregunta comparativa con competidores nombrados]"  
3. "[Pregunta sobre riesgos u oportunidades detectadas]"
```

## PROTOCOLO ANTI-ALUCINACIÓN

⚠️ **REGLA DE ORO**: Si no tienes un dato en el contexto, NO LO INVENTES.

Di claramente:
- "No tengo ese dato en el contexto actual"
- "Sería necesario verificarlo antes de incluirlo"

**NUNCA**:
- Inventar scores
- Suponer tendencias sin datos
- Crear comparativas con empresas no mencionadas

## ADAPTACIÓN AL PERFIL: {TARGET_PROFILE}

**CEO**: Impacto en valoración, ventaja competitiva, riesgo estratégico, ROI
**CMO**: Posicionamiento de marca, diferenciación, insights de marketing
**DirCom**: Narrativa corporativa, alertas de crisis, percepción mediática
**Compliance**: Riesgos ESG, gobernanza, controversias, exposición regulatoria
```

---

### 2. UI: Sistema de Puntuación por Estrellas

En `SalesIntelligencePanel.tsx`, añadir componente de rating:

```typescript
// Nuevo componente de rating por estrellas
const StarRating = ({ 
  messageIndex, 
  currentRating, 
  onRate 
}: { 
  messageIndex: number; 
  currentRating: number; 
  onRate: (rating: number) => void 
}) => {
  return (
    <div className="flex items-center gap-1 mt-2">
      <span className="text-xs text-muted-foreground mr-2">Valorar:</span>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => onRate(star)}
          className={`p-0.5 transition-colors ${
            star <= currentRating 
              ? 'text-amber-500' 
              : 'text-gray-300 hover:text-amber-300'
          }`}
        >
          <Star className="h-4 w-4" fill={star <= currentRating ? 'currentColor' : 'none'} />
        </button>
      ))}
      {currentRating > 0 && (
        <span className="text-xs text-muted-foreground ml-2">
          {currentRating >= 4 ? '✓ Se usará en presentación' : ''}
        </span>
      )}
    </div>
  );
};
```

**Estado para ratings:**
```typescript
const [messageRatings, setMessageRatings] = useState<Record<number, number>>({});

const handleRate = (messageIndex: number, rating: number) => {
  setMessageRatings(prev => ({ ...prev, [messageIndex]: rating }));
  // Guardar en DB si hay persistencia
};
```

**Botón de generar presentación:**
```typescript
// Solo visible cuando hay respuestas con 4+ estrellas
const highRatedResponses = Object.entries(messageRatings)
  .filter(([_, rating]) => rating >= 4);

{highRatedResponses.length > 0 && (
  <Button 
    onClick={() => handleSubmit('Genera la presentación PowerPoint con todo lo mejor de nuestra conversación')}
    className="w-full bg-gradient-to-r from-purple-600 to-amber-500"
  >
    <Presentation className="h-4 w-4 mr-2" />
    Crear Presentación ({highRatedResponses.length} respuestas valoradas)
  </Button>
)}
```

---

### 3. Extracción de Preguntas para Agente Rix

```typescript
// Parsear preguntas del final de la respuesta
const extractRixQuestions = (content: string): string[] => {
  const match = content.match(/Evidencias para anexar[\s\S]*?((?:\d\.\s*"[^"]+"\s*)+)/i);
  if (!match) return [];
  
  const questions = match[1].match(/"([^"]+)"/g);
  return questions?.map(q => q.replace(/"/g, '')) || [];
};

// Renderizar en la UI
{rixQuestions.length > 0 && (
  <Card className="border-purple-200 bg-purple-50/50">
    <CardHeader className="pb-2">
      <CardTitle className="text-sm flex items-center gap-2">
        <FileText className="h-4 w-4 text-purple-600" />
        Preguntas para Agente Rix (adjuntar como evidencia)
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-2">
      {rixQuestions.map((q, i) => (
        <div key={i} className="flex items-center gap-2 p-2 bg-white rounded border">
          <span className="flex-1 text-sm">{q}</span>
          <Button size="sm" variant="ghost" onClick={() => copyToClipboard(q)}>
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </CardContent>
  </Card>
)}
```

---

### 4. Ampliar Contexto del Vector Store

En la edge function, línea ~234:
```typescript
// Ampliar de 300 a 800 caracteres, y de 10 a 20 documentos
vectorDocs.slice(0, 20).map(d => `- ${d.content?.slice(0, 800)}`).join('\n')
```

---

### 5. Tablas para Persistencia (Opcional, Fase 2)

```sql
-- Sesiones con ratings
CREATE TABLE sales_intelligence_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  company TEXT NOT NULL,
  ticker TEXT,
  target_profile TEXT NOT NULL,
  role TEXT CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  message_index INTEGER,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  rix_questions JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE sales_intelligence_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins only" ON sales_intelligence_sessions FOR ALL 
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Índices
CREATE INDEX idx_sales_sessions_session ON sales_intelligence_sessions(session_id);
CREATE INDEX idx_sales_sessions_rating ON sales_intelligence_sessions(rating);
```

---

## Resumen de Archivos

| Archivo | Acción | Cambios |
|---------|--------|---------|
| `supabase/functions/sales-intelligence-chat/index.ts` | Modificar | GPT-5, temp 0.3, prompt resultadista, modo presentación, contexto ampliado |
| `src/components/admin/SalesIntelligencePanel.tsx` | Modificar | Rating ⭐ por respuesta, botón "Crear Presentación", extracción preguntas Rix |
| Migración SQL (Fase 2) | Crear | Tabla `sales_intelligence_sessions` con campo `rating` |

---

## Ejemplo de Flujo Real

```text
ADMIN: "Analiza Telefónica para una reunión con el CMO"

AGENTE: "Telefónica tiene una puntuación de percepción algorítmica de 71/100, 
mientras que Vodafone está en 68 y Orange en 65. Parece buena posición, ¿verdad?

Pero hay una señal de alerta: cuando las IAs hablan de Telefónica, 3 de 6 
mencionan 'restructuración' y 'reducción de plantilla' en los primeros párrafos. 
Es como si la mitad de los periodistas del mundo empezaran sus artículos 
hablando de despidos.

Para un CMO, esto significa que cualquier campaña de marca lucha contra 
un viento en contra narrativo. Invertir en publicidad sin corregir esto 
es como pintar la fachada de una casa con goteras."

ADMIN: ⭐⭐⭐⭐⭐ (5 estrellas)

ADMIN: "Profundiza en qué dicen específicamente sobre innovación"

AGENTE: [Respuesta detallada sobre narrativa de innovación...]

ADMIN: ⭐⭐⭐⭐ (4 estrellas)

ADMIN: "Genera la presentación"

AGENTE: [Genera presentación PowerPoint-ready con estilo RepIndex,
         usando las respuestas de 4-5 estrellas, 
         con preguntas para Agente Rix al final]
```

---

## Garantías

1. **Cero tecnicismos**: Cada métrica se explica con impacto de negocio
2. **Cero alucinaciones**: Protocolo "STOP AND SAY" + temperatura 0.3
3. **Calidad iterativa**: Solo las respuestas mejor valoradas van a la presentación
4. **Estilo RepIndex**: Minimalista, fondo blanco, cifras destacadas, frases impactantes
5. **Evidencias listas**: Preguntas para Agente Rix que se adjuntan como anexo

