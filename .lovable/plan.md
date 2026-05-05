## Causa raíz

El visor usa una "memoria" en `localStorage` (`src/lib/reports/reportMemory.ts`) para recordar los informes generados. La pregunta sí se persiste en DB (cada informe tiene su `session_id` y los mensajes se guardan en `chat_intelligence_sessions`), pero **el índice de informes** (título, filtros, mapping reportId↔sessionId) vive solo en el navegador. Por eso:

- Al cambiar de dispositivo / navegador / limpiar caché desaparece el listado.
- Aunque la conversación esté en DB, sin ese índice no hay forma de re-localizarla como "informe".

`/informes` y `/visor` ya están detrás de `ProtectedRoute`, así que siempre hay `user_id` disponible — podemos persistir por usuario sin fricción.

## Plan de archivos a tocar

1. **Migración SQL nueva**: crear tabla `rix_reports`.
2. **`src/lib/reports/reportMemory.ts`**: convertir a capa async respaldada por Supabase (mantener mismas firmas/tipos en lo posible).
3. **`src/pages/RixViewer.tsx`**: pasar de lectura síncrona de `localStorage` a hook async (carga inicial + refresh).
4. **`src/pages/RixReports.tsx`**: `addReport` pasa a ser `await` y necesita `user_id` del `AuthContext`.
5. **`src/components/reports/ReportMemoryList.tsx`** (si está en uso): adaptar al nuevo shape async. (Si no se usa, no se toca.)

## Cambios aplicados (a aplicar tras aprobación)

### 1. Tabla `rix_reports`

```sql
create table public.rix_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null,
  title text not null,
  question text not null,
  filters jsonb not null,
  summary jsonb,
  created_at timestamptz not null default now()
);

create index rix_reports_user_created_idx
  on public.rix_reports (user_id, created_at desc);

create unique index rix_reports_user_session_uidx
  on public.rix_reports (user_id, session_id);

alter table public.rix_reports enable row level security;

create policy "owner can read"   on public.rix_reports for select using (auth.uid() = user_id);
create policy "owner can insert" on public.rix_reports for insert with check (auth.uid() = user_id);
create policy "owner can delete" on public.rix_reports for delete using (auth.uid() = user_id);
create policy "owner can update" on public.rix_reports for update using (auth.uid() = user_id);
```

### 2. `reportMemory.ts` (refactor mínimo, mismas funciones)

Reemplazar el backend `localStorage` por Supabase manteniendo nombres:

- `listReports(userId): Promise<ReportMemoryEntry[]>` — `select * order by created_at desc limit 30`.
- `addReport(userId, entry): Promise<ReportMemoryEntry>` — `insert ... returning *`.
- `removeReport(userId, id): Promise<void>` — `delete eq id eq user_id`.
- `clearAll(userId): Promise<void>` — `delete eq user_id`.
- `getReport(userId, id)` — `select single`.
- `getActiveId / setActiveId` — se quedan en `localStorage` (es solo UI state efímero del visor, no merece columna).
- `buildReportTitle` — sin cambios.

El tipo `ReportMemoryEntry` se conserva (id, createdAt como timestamp ms o ISO; mapeamos `created_at` → `createdAt` al leer).

### 3. `RixViewer.tsx`

- Usar `useAuth()` para obtener `user.id`.
- Sustituir `useState(() => listReports())` por `useEffect` async + `useState<ReportMemoryEntry[]>([])` + un `loading` ligero.
- `refresh()` pasa a `async` y vuelve a llamar a `listReports(userId)`.
- `handleRemove` y `handleClearAll` pasan a `async` y refrescan.
- Sin cambios visuales.

### 4. `RixReports.tsx`

- En el `onClick` del botón "Generar informe": `const entry = await addReport(user.id, {...})`.
- Si falla la inserción, mostrar `toast` y NO navegar (evita informes huérfanos en visor).

### 5. `ReportMemoryList.tsx`

- Si sigue en uso: aceptar `reports` por prop (ya lo hace seguramente). Si no se importa en ningún sitio, lo dejamos sin tocar.

## Riesgos / regresiones revisadas

- **Migración local→DB**: los informes que ya estuvieran en `localStorage` no se migran automáticamente (decisión consciente para mantener cambios mínimos). Las conversaciones siguen accesibles vía `MyConversations`. Si quieres, en una segunda iteración añadimos un *one-shot migrate* al cargar el visor.
- **Race con auto-send**: `addReport` ahora es async; `RixReports` ya espera el click → `await` → `navigate`, sin riesgo de doble envío. El `useEffect` de auto-send en `RixViewer` no depende de la lista cargada.
- **RLS**: políticas estrictas por `auth.uid()`; ningún acceso anónimo posible.
- **Unicidad `(user_id, session_id)`**: previene duplicados si el usuario hace doble click.
- **No se toca**: `ChatContext`, `compileQuestion`, `coherenceEngine`, filtros, normalización, `MultiChipSelect`, `LivePreview`, exportadores. Todo el flujo de generación intacto.

## Mejoras opcionales no implementadas

- Migración one-shot `localStorage → DB` la primera vez que el usuario autenticado entra al visor.
- Renombrar informes (`update title`).
- Marcar favoritos / archivar (columnas `is_starred`, `is_archived`).
- Paginación más allá de 30 (hoy límite duro como en localStorage).
- Compartir informe entre usuarios de la misma `company_id`.
