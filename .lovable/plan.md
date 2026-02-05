
# Plan: Corregir Flujo Conversacional del Agente Comercial

## Problemas Detectados

| Problema | Causa | Impacto |
|----------|-------|---------|
| No hay opción de repreguntar | Falta campo de texto libre para follow-up | El admin no puede hacer preguntas personalizadas |
| Respuestas telegráficas | GPT-5 sin temperature + mensajes duplicados en el historial | Texto incoherente, sin verbos, mal argumentado |

## Solución

### 1. UI: Añadir Campo de Texto para Repreguntar

En `SalesIntelligencePanel.tsx`, añadir un input de texto después de la conversación:

```typescript
// Nuevo estado para follow-up libre
const [followUpInput, setFollowUpInput] = useState('');

// En la sección de "Acciones rápidas" (línea ~682)
{messages.some(m => m.role === 'assistant') && !isLoading && (
  <div className="mt-4 pt-4 border-t space-y-3">
    {/* Campo de texto para repreguntar */}
    <div className="flex gap-2">
      <Input
        value={followUpInput}
        onChange={(e) => setFollowUpInput(e.target.value)}
        placeholder="Escribe una pregunta o indicación..."
        onKeyDown={(e) => {
          if (e.key === 'Enter' && followUpInput.trim()) {
            handleFollowUp(followUpInput);
            setFollowUpInput('');
          }
        }}
      />
      <Button 
        onClick={() => {
          if (followUpInput.trim()) {
            handleFollowUp(followUpInput);
            setFollowUpInput('');
          }
        }}
        disabled={!followUpInput.trim()}
      >
        Enviar
      </Button>
    </div>
    
    {/* Sugerencias rápidas existentes */}
    <Label className="text-xs text-muted-foreground">O elige una acción rápida:</Label>
    <div className="flex flex-wrap gap-2">
      {/* ... botones existentes ... */}
    </div>
  </div>
)}
```

### 2. Edge Function: Corregir Construcción de Mensajes

En `sales-intelligence-chat/index.ts`, el problema está en las líneas 388-397. El último mensaje del historial se duplica:

**Código actual (INCORRECTO):**
```typescript
const messages = [
  { role: 'system', content: systemPrompt },
  { role: 'user', content: `CONTEXTO:\n\n${contextBlocks}` },
  ...conversation_history,  // Incluye todos los mensajes
  { 
    role: 'user', 
    content: conversation_history.length === 0 
      ? `Genera análisis inicial...`
      : conversation_history[conversation_history.length - 1]?.content  // ¡DUPLICADO!
  },
];
```

**Código corregido:**
```typescript
const messages = [
  { role: 'system', content: systemPrompt },
  { role: 'user', content: `CONTEXTO DE DATOS:\n\n${contextBlocks}` },
];

// Solo añadir historial si existe, sin duplicar
if (conversation_history.length === 0) {
  messages.push({ 
    role: 'user', 
    content: `Genera un análisis comercial inicial para ${issuerName}, dirigido a su ${profileLabels[target_profile]}. Recuerda: lenguaje resultadista, sin acrónimos, con ejemplos y analogías.`
  });
} else {
  // Añadir historial completo (ya incluye el último mensaje)
  messages.push(...conversation_history);
}
```

### 3. Cambiar a Modelo con Mejor Redacción

GPT-5 no permite `temperature` personalizado. Opciones:

**Opción A**: Usar `google/gemini-2.5-pro` que permite temperature y tiene excelente redacción en español

**Opción B**: Reforzar el prompt con instrucciones explícitas de redacción

Propongo **Opción A** + refuerzo de prompt:

```typescript
// Modelo alternativo con temperature
body: JSON.stringify({
  model: 'google/gemini-2.5-pro',
  messages,
  max_tokens: 6000,
  temperature: 0.4,  // Bajo para coherencia
  stream: true,
}),
```

Y añadir al system prompt:
```markdown
## ESTILO DE REDACCIÓN OBLIGATORIO

Escribe en español ejecutivo impecable:
- Frases completas con sujeto, verbo y predicado
- Párrafos bien desarrollados (mínimo 3-4 oraciones)
- Argumentación clara con conectores (por tanto, sin embargo, además)
- Evitar estilo telegráfico o bullet points sin contexto
- Cada idea debe estar completamente desarrollada antes de pasar a la siguiente
```

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `supabase/functions/sales-intelligence-chat/index.ts` | Corregir duplicación de mensajes, cambiar modelo a gemini-2.5-pro, añadir instrucciones de redacción |
| `src/components/admin/SalesIntelligencePanel.tsx` | Añadir campo de texto libre para repreguntas |

## Resultado Esperado

1. El admin podrá escribir preguntas personalizadas después de cada respuesta
2. Las respuestas tendrán redacción fluida con frases completas y argumentación coherente
3. El historial de conversación funcionará correctamente sin duplicar mensajes
