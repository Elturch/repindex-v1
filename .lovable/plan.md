

# Pestaña "Snapshots" en Admin — Registro historico de evoluciones de la plataforma

## Contexto

Actualmente existe un `systemChangelog` hardcodeado en `Admin.tsx` (lineas 236-306) con 6 entradas estaticas. El usuario quiere un sistema persistente en base de datos donde cada avance quede registrado con fecha, version, descripcion detallada, y se pueda abrir un modal con todos los detalles tecnicos del snapshot.

## Cambios

### 1. Nueva tabla: `platform_snapshots`

Tabla en Supabase para almacenar cada hito de la plataforma:

```sql
CREATE TABLE public.platform_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  detailed_description text NOT NULL,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  snapshot_type text NOT NULL DEFAULT 'feature',
  tags text[] DEFAULT '{}'::text[],
  metrics_at_snapshot jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE
);

ALTER TABLE public.platform_snapshots ENABLE ROW LEVEL SECURITY;

-- Lectura publica (visible desde admin preview)
CREATE POLICY "Snapshots are publicly readable"
  ON public.platform_snapshots FOR SELECT
  USING (true);

-- Solo service_role puede insertar/actualizar/eliminar
CREATE POLICY "Service role can manage snapshots"
  ON public.platform_snapshots FOR ALL
  USING (true)
  WITH CHECK (true);
```

Campos clave:
- `version`: Semver (3.1.0, 3.2.0...)
- `title`: Titulo corto del hito
- `summary`: Resumen en 1-2 frases
- `detailed_description`: Texto largo en Markdown con toda la explicacion tecnica, decisiones de arquitectura, metricas antes/despues, etc.
- `changes`: Array JSON de strings con los cambios puntuales (como el changelog actual)
- `snapshot_type`: `feature`, `improvement`, `fix`, `architecture`, `methodology`, `milestone`
- `tags`: Etiquetas libres para filtrar (ej: `['RIX', 'pipeline', 'V2']`)
- `metrics_at_snapshot`: JSON con metricas del momento (total empresas, total registros, modelos activos, etc.)

### 2. Semilla de datos iniciales

Migrar el `systemChangelog` existente y anadir todos los hitos relevantes desde el inicio del proyecto. Se insertaran ~15-20 snapshots iniciales cubriendo desde la creacion del indice RIX hasta el rix-press-agent de hoy.

### 3. Nuevo componente: `src/components/admin/PlatformSnapshotsPanel.tsx`

Componente independiente (patron identico a `PipelineAlertsPanel`, `CronMonitorPanel`, etc.):

- **Vista principal**: Tabla/timeline con todas las snapshots ordenadas por fecha descendente
  - Columnas: Fecha, Version, Tipo (badge coloreado), Titulo, Resumen
  - Boton "Abrir Snapshot" en cada fila
- **Modal de detalle** (Dialog): Al pulsar "Abrir Snapshot" se abre un dialog con:
  - Header: version + fecha + tipo badge
  - Descripcion detallada renderizada como Markdown
  - Lista de cambios puntuales
  - Tags como badges
  - Metricas del momento (si las hay) en tarjetas
- **Formulario de nuevo snapshot**: Boton "Nuevo Snapshot" que abre formulario inline para registrar un nuevo hito directamente desde el admin
  - Campos: version, titulo, resumen, descripcion detallada, tipo, tags, cambios
  - Guarda via `admin-api` (usa service_role)
- **Filtros**: Por tipo de snapshot y busqueda por texto

### 4. Actualizar `admin-api` Edge Function

Anadir acciones al proxy admin existente:

- `list_snapshots`: SELECT * FROM platform_snapshots ORDER BY snapshot_date DESC
- `create_snapshot`: INSERT INTO platform_snapshots
- `update_snapshot`: UPDATE platform_snapshots WHERE id = ...
- `delete_snapshot`: DELETE FROM platform_snapshots WHERE id = ...

### 5. Integrar en `src/pages/Admin.tsx`

- Importar `PlatformSnapshotsPanel`
- Anadir nuevo `TabsTrigger` con icono `BookOpen` y texto "Snapshots"
- Anadir `TabsContent` correspondiente
- Eliminar el array `systemChangelog` hardcodeado (ya no se necesita)

## Archivos

| Archivo | Accion |
|---------|--------|
| Migracion SQL | CREAR — tabla `platform_snapshots` + RLS + datos semilla |
| `src/components/admin/PlatformSnapshotsPanel.tsx` | CREAR — componente completo con tabla, modal detalle y formulario |
| `src/pages/Admin.tsx` | EDITAR — anadir tab "Snapshots", importar panel, eliminar `systemChangelog` |
| `supabase/functions/admin-api/index.ts` | EDITAR — anadir acciones CRUD para snapshots |

## Datos semilla (resumen de los ~15-20 snapshots iniciales)

Incluira entradas desde el inicio del proyecto hasta hoy, por ejemplo:
- Creacion del indice RIX y metodologia de 50 metricas
- Primer barrido con 2 modelos (ChatGPT + Perplexity)
- Expansion a 4 modelos (+ Gemini + DeepSeek)
- Vector Store y chat inteligente
- Pipeline V2 con 6 modelos (+ Grok + Qwen)
- Sistema de barrido automatizado con orquestador
- Corporate scraping con Firecrawl
- Sistema de perfiles de usuario con IA
- Marketing inbound automatizado
- Rix Press Agent independiente (hoy)
- Y todos los hitos del `systemChangelog` actual

Cada snapshot tendra su `detailed_description` en Markdown con arquitectura, decisiones, metricas y contexto tecnico completo.

