

# Plan: Sistema de Guardado para Agente Comercial

## Contexto Actual

| Componente | Estado Actual |
|------------|---------------|
| `user_conversations` | Solo para chat público (Agente Rix usuario) |
| `SalesIntelligencePanel` | Sin persistencia - todo en memoria local |
| PPTXs generados | Se descargan pero no se registran |

## Arquitectura Propuesta

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                    PERSISTENCIA AGENTE COMERCIAL                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────────┐       ┌──────────────────────┐               │
│  │ sales_conversations  │       │ sales_pptx_exports   │               │
│  ├──────────────────────┤       ├──────────────────────┤               │
│  │ id                   │──────►│ id                   │               │
│  │ admin_user_id        │       │ conversation_id      │               │
│  │ company_name         │       │ admin_user_id        │               │
│  │ ticker               │       │ company_name         │               │
│  │ target_profile       │       │ slides_count         │               │
│  │ messages (jsonb)     │       │ slide_designs (jsonb)│               │
│  │ ratings (jsonb)      │       │ file_name            │               │
│  │ rix_questions (arr)  │       │ created_at           │               │
│  │ metadata (jsonb)     │       └──────────────────────┘               │
│  │ custom_context       │                                               │
│  │ is_starred           │                                               │
│  │ created_at           │                                               │
│  │ updated_at           │                                               │
│  └──────────────────────┘                                               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Nuevas Tablas de Base de Datos

### 1. `sales_conversations` - Conversaciones del Agente Comercial

```sql
CREATE TABLE sales_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id),
  company_name TEXT NOT NULL,
  ticker TEXT,
  target_profile TEXT NOT NULL DEFAULT 'ceo',
  custom_context TEXT,
  messages JSONB NOT NULL DEFAULT '[]',
  message_ratings JSONB NOT NULL DEFAULT '{}',
  rix_questions TEXT[] DEFAULT '{}',
  metadata JSONB,
  is_starred BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Políticas RLS: Solo admins pueden acceder
ALTER TABLE sales_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage sales conversations"
  ON sales_conversations FOR ALL
  USING (has_role(auth.uid(), 'admin'));
```

### 2. `sales_pptx_exports` - Registro de PPTXs Generados

```sql
CREATE TABLE sales_pptx_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES sales_conversations(id) ON DELETE SET NULL,
  admin_user_id UUID NOT NULL REFERENCES auth.users(id),
  company_name TEXT NOT NULL,
  target_profile TEXT NOT NULL,
  slides_count INTEGER NOT NULL DEFAULT 0,
  slide_designs JSONB NOT NULL DEFAULT '[]',
  high_rated_content TEXT[] DEFAULT '{}',
  file_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Políticas RLS: Solo admins
ALTER TABLE sales_pptx_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage pptx exports"
  ON sales_pptx_exports FOR ALL
  USING (has_role(auth.uid(), 'admin'));
```

---

## Cambios en UI - SalesIntelligencePanel

### Funcionalidades Nuevas

1. **Autoguardado de conversación**
   - Se crea un registro al iniciar análisis
   - Se actualiza automáticamente con cada mensaje nuevo

2. **Lista de conversaciones guardadas**
   - Dropdown o sidebar con historial
   - Filtro por empresa, fecha, destacadas

3. **Cargar conversación existente**
   - Restaurar mensajes, ratings, y contexto

4. **Marcar como destacada**
   - Botón de estrella en el header

5. **Historial de PPTXs**
   - Lista de presentaciones generadas
   - Posibilidad de regenerar con los mismos diseños

---

## Flujo de Guardado

```text
1. Usuario selecciona empresa → Se crea sales_conversation (status: draft)
2. Cada respuesta del agente → UPDATE messages JSONB
3. Usuario valora respuesta → UPDATE message_ratings JSONB
4. Usuario genera PPTX → INSERT sales_pptx_exports + UPDATE conversation
5. Usuario cierra → Conversación persistida automáticamente
```

---

## Archivos a Crear/Modificar

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `migrations/` | **CREAR** | SQL para nuevas tablas `sales_conversations` y `sales_pptx_exports` |
| `src/hooks/useSalesConversations.ts` | **CREAR** | Hook para CRUD de conversaciones comerciales |
| `src/components/admin/SalesConversationsList.tsx` | **CREAR** | Componente de lista de conversaciones guardadas |
| `src/components/admin/SalesIntelligencePanel.tsx` | **MODIFICAR** | Integrar autoguardado y selector de conversaciones |

---

## Detalles de Implementación

### Hook `useSalesConversations`

```typescript
// src/hooks/useSalesConversations.ts
export const useSalesConversations = () => {
  // Lista de conversaciones
  const { data: conversations, refetch } = useQuery({...});
  
  // Crear nueva conversación
  const createConversation = async (company: string, profile: string) => {...};
  
  // Actualizar mensajes
  const updateMessages = async (id: string, messages: Message[], ratings: Record<number, number>) => {...};
  
  // Cargar conversación existente
  const loadConversation = async (id: string) => {...};
  
  // Registrar exportación PPTX
  const logPPTXExport = async (conversationId: string, slideDesigns: SlideDesign[], fileName: string) => {...};
  
  return { conversations, createConversation, updateMessages, loadConversation, logPPTXExport };
};
```

### Selector de Conversaciones en Panel

- Añadir dropdown en el header del panel
- Opción "Nueva conversación" + lista de recientes
- Badge con conteo de PPTXs generados por conversación

---

## Beneficios

1. **Continuidad**: Retomar conversaciones comerciales donde se dejaron
2. **Historial**: Ver qué empresas se han analizado y con qué resultados
3. **Métricas**: Saber cuántos PPTXs se han generado por empresa
4. **Reutilización**: Regenerar presentaciones con diseños guardados
5. **Auditoría**: Registro completo de la actividad comercial del agente

