
# Plan: Agente Rix Comercial (Admin-Only Sales Intelligence Chat)

## Objetivo

Crear un agente de chat especializado, accesible **exclusivamente desde el panel de administración** (`/admin`), diseñado para:

1. **Destilar información** del Vector Store (11,800+ documentos indexados) sobre empresas
2. **Crear narrativas comerciales persuasivas** adaptadas al perfil del destinatario (CEO, CMO, DirCom, Compliance)
3. **Sin sesgo metodológico** - acceso directo a los datos sin las capas de enriquecimiento de roles
4. **Generar presentaciones de venta** listas para usar en reuniones comerciales

---

## Arquitectura Propuesta

```text
┌─────────────────────────────────────────────────────────────────────┐
│                        /admin (Panel Admin)                         │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │              Nueva Pestaña: "Agente Rix Comercial"              ││
│  │  ┌─────────────────────────────────────────────────────────────┐││
│  │  │  [Input] Empresa objetivo: _______________                  │││
│  │  │  [Selector] Destinatario: CEO | CMO | DirCom | Compliance   │││
│  │  │  [Input] Contexto comercial (opcional): _______________     │││
│  │  │  [Button] Generar Propuesta Comercial                       │││
│  │  └─────────────────────────────────────────────────────────────┘││
│  │                                                                  ││
│  │  ┌─────────────────────────────────────────────────────────────┐││
│  │  │  Chat Thread (similar a FloatingChat pero full-width)       │││
│  │  │  - Mensajes usuario / asistente                             │││
│  │  │  - Markdown rendering con diseño ejecutivo                  │││
│  │  │  - Botón "Copiar como HTML" / "Descargar PDF"               │││
│  │  └─────────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
         supabase/functions/sales-intelligence-chat/index.ts
                                   │
                     ┌─────────────┴─────────────┐
                     ▼                           ▼
          Vector Store (documents)     rix_runs_v2 / rix_runs
          - match_documents RPC        - Datos estructurados RIX
          - 11,800+ docs indexados     - Métricas, scores, tendencias
```

---

## Componentes a Crear

### 1. Nueva Edge Function: `sales-intelligence-chat`

**Ubicación**: `supabase/functions/sales-intelligence-chat/index.ts`

**Funcionalidad**:
- Recibe: `company_name`, `target_profile` (CEO/CMO/DirCom/Compliance), `custom_context`, `conversation_history`
- Ejecuta búsqueda híbrida:
  - **Vector Search**: `match_documents` con embedding de la empresa (top 50 docs)
  - **Datos estructurados**: Últimas 4 semanas de `rix_runs_v2` + `rix_runs`
  - **Competidores verificados**: Desde `repindex_root_issuers.verified_competitors`
  - **Noticias corporativas**: Últimas de `corporate_news`
- Genera respuesta con Gemini 3 Pro (modelo de máxima calidad) usando prompt especializado para ventas
- Streaming SSE para respuesta en tiempo real

**Prompt del Sistema (Sales Intelligence)**:
```
Eres el ESTRATEGA COMERCIAL SENIOR de RepIndex.

Tu misión es crear PROPUESTAS COMERCIALES IRRESISTIBLES basadas en datos 
reales de percepción algorítmica. Tienes acceso exclusivo a:

1. DATOS RIX: Scores de reputación de 6 IAs (ChatGPT, Perplexity, Gemini, 
   DeepSeek, Grok, Qwen) actualizados semanalmente
2. VECTOR STORE: 11,800+ documentos con análisis cualitativos de IAs
3. COMPETIDORES VERIFICADOS: Comparativas del sector

PERFIL DEL DESTINATARIO: {target_profile}
- CEO: Impacto en valoración, ventaja competitiva, riesgo reputacional
- CMO: Posicionamiento de marca, CXM, diferenciación
- DirCom: Gestión de narrativa, alertas de crisis, percepción mediática
- Compliance: Riesgos ESG, gobernanza (GAM), controversias (CEM)

ESTRUCTURA DE LA PROPUESTA COMERCIAL:
1. **Hook de Apertura** (30 segundos): El dato más impactante
2. **Diagnóstico Personalizado**: Situación actual basada en datos reales
3. **Oportunidades Detectadas**: Qué puede mejorar y cómo lo sabemos
4. **Comparativa Competitiva**: Dónde está vs líderes del sector
5. **Propuesta de Valor RepIndex**: Qué ofrecemos específicamente
6. **Call to Action**: Siguiente paso concreto

REGLAS:
- USA SOLO datos del contexto proporcionado - CERO invención
- Incluye CIFRAS ESPECÍFICAS (scores, porcentajes, tendencias)
- Adapta el LENGUAJE al perfil del destinatario
- Genera contenido listo para copiar/pegar en email o presentación
```

### 2. Nuevo Componente Admin: `SalesIntelligencePanel.tsx`

**Ubicación**: `src/components/admin/SalesIntelligencePanel.tsx`

**Características UI**:
- Input de empresa con autocompletado (usa `repindex_root_issuers`)
- Selector de perfil destinatario (CEO, CMO, DirCom, Compliance)
- Campo opcional de contexto comercial ("reunión el jueves", "renovación de contrato", etc.)
- Chat thread con mensajes streaming
- Historial de conversación persistente (para refinar propuestas)
- Botones de acción:
  - "Copiar como Markdown"
  - "Copiar como HTML" (con estilos ejecutivos)
  - "Nueva Conversación"

**Diseño Visual**:
- Card con header distintivo (gradiente púrpura/dorado para diferenciarlo)
- Badge "Solo Admin" visible
- Indicador de fuentes usadas (Vector Store docs, RIX records)
- Metodología visible (transparencia sobre qué datos se usaron)

### 3. Integración en Admin.tsx

**Cambios en** `src/pages/Admin.tsx`:
- Nueva pestaña en el TabsList: "Agente Comercial" con icono `Sparkles` o `Target`
- Importar y renderizar `SalesIntelligencePanel`
- Solo visible en Preview (no en producción publicada) - ya garantizado por la arquitectura actual de /admin

### 4. Configuración Edge Function

**Actualizar** `supabase/config.toml`:
```toml
[functions.sales-intelligence-chat]
verify_jwt = false
```

---

## Flujo de Uso

1. **Admin accede a /admin** → Pestaña "Agente Comercial"
2. **Escribe**: "Telefónica" → Selecciona: "CEO" → Click "Generar"
3. **Sistema ejecuta**:
   - Embedding de "Telefónica reputación análisis comercial"
   - `match_documents` con embedding (top 50)
   - Fetch de últimas 4 semanas de RIX (6 modelos)
   - Fetch de competidores verificados (Vodafone, Orange, MasMovil)
4. **LLM genera** propuesta comercial estructurada en streaming
5. **Admin puede**:
   - Refinar: "Hazlo más agresivo comercialmente"
   - Copiar: "Dame esto en formato email"
   - Exportar: Copiar HTML ejecutivo

---

## Diferencias con Agente Rix Estándar

| Aspecto | Agente Rix (usuarios) | Agente Rix Comercial (admin) |
|---------|----------------------|------------------------------|
| **Acceso** | Usuarios autenticados | Solo panel Admin |
| **Propósito** | Informar sobre reputación | Vender servicios RepIndex |
| **Sesgo** | Roles profesionales (CEO, periodista...) | Cero sesgo, datos puros |
| **Output** | Informes analíticos | Propuestas comerciales |
| **Tono** | Neutral/informativo | Persuasivo/comercial |
| **Prompt** | Metodología RIX detallada | Estrategia de ventas |

---

## Detalles Técnicos

### Edge Function: Estructura del Request

```typescript
interface SalesIntelligenceRequest {
  company_name: string;           // "Telefónica"
  target_profile: 'ceo' | 'cmo' | 'dircom' | 'compliance';
  custom_context?: string;        // "Reunión el jueves, quieren renovar"
  conversation_history?: Array<{  // Para refinamiento
    role: 'user' | 'assistant';
    content: string;
  }>;
}
```

### Edge Function: Respuesta SSE

```typescript
// Eventos SSE
{ type: 'start', metadata: { company, vectorDocsUsed, rixRecords, competitors } }
{ type: 'chunk', text: '...' }
{ type: 'done', suggestedActions: ['Refinar tono', 'Formato email', 'Añadir competidor'] }
```

### Componente React: Estado

```typescript
interface SalesIntelligenceState {
  companyInput: string;
  selectedProfile: 'ceo' | 'cmo' | 'dircom' | 'compliance';
  customContext: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  isLoading: boolean;
  metadata: {
    vectorDocsUsed: number;
    rixRecordsUsed: number;
    competitorsFound: string[];
  } | null;
}
```

---

## Archivos a Crear/Modificar

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `supabase/functions/sales-intelligence-chat/index.ts` | Crear | Edge Function con lógica RAG + prompt comercial |
| `src/components/admin/SalesIntelligencePanel.tsx` | Crear | Componente de chat para admin |
| `src/pages/Admin.tsx` | Modificar | Añadir pestaña "Agente Comercial" |
| `supabase/config.toml` | Modificar | Registrar nueva función |

---

## Consideraciones de Seguridad

1. **Solo accesible desde Admin**: La ruta /admin ya está protegida y solo funciona en Preview
2. **Sin persistencia de propuestas**: Las conversaciones son efímeras (no se guardan en DB)
3. **Allowlist de dominios**: La Edge Function heredará la verificación de origen de admin-api
4. **Sin exposición pública**: La función no tiene rutas públicas

---

## Prompt Comercial Detallado

El prompt del sistema incluirá:

1. **Contexto de negocio RepIndex**: Qué vendemos, pricing tiers, propuesta de valor
2. **Adaptación por perfil**: Lenguaje específico para cada C-level
3. **Uso de datos reales**: Instrucciones para citar scores, métricas y tendencias
4. **Estructura persuasiva**: AIDA (Atención, Interés, Deseo, Acción)
5. **Objeciones previstas**: Respuestas a "¿por qué necesito esto?"

---

## Resultado Esperado

Un admin podrá:
1. Escribir "Iberdrola" + seleccionar "CEO"
2. Obtener en 15-20 segundos una propuesta comercial completa con:
   - "Iberdrola tiene un RIX de 72.3, 8 puntos por debajo del líder del sector Endesa (80.1)"
   - "Su métrica más débil es CEM (58) indicando exposición a controversias ESG"
   - "Recomendamos monitoreo semanal + alertas de crisis por 2.500€/mes"
3. Copiar y pegar en un email o presentación
4. Refinar: "Hazlo más corto para un email de 3 párrafos"

