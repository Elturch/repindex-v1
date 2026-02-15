
# API Health Dashboard - Panel de Salud de APIs

## Objetivo
Crear un nuevo componente `ApiHealthDashboard` como una nueva tab en el panel Admin que muestre el estado de salud en tiempo real de todas las APIs del sistema, incluyendo resultados recientes de llamadas y estado operativo de cada proveedor.

## Proveedores a monitorizar
- **OpenAI** (o3, gpt-5, gpt-4o, gpt-4.1-mini) - Analisis RIX + Chat
- **Perplexity** (sonar-pro) - Busqueda RIX + Momentum tips
- **Google Gemini** (gemini-2.5-flash, gemini-2.5-pro) - Chat + Busqueda RIX
- **DeepSeek** (deepseek-chat) - Busqueda RIX
- **XAI/Grok** (grok-3) - Busqueda RIX
- **Alibaba/Qwen** (qwen-max) - Busqueda RIX
- **Firecrawl** - Web scraping corporativo

## Componentes del panel

### 1. Tarjetas de estado por proveedor (grid)
Cada tarjeta mostrara:
- Nombre del proveedor + icono
- Estado (OK / Error / Sin datos) con semaforo visual (verde/amarillo/rojo)
- Ultima llamada exitosa (hace cuanto tiempo)
- Numero de llamadas en las ultimas 24h
- Tasa de exito (% de llamadas sin error)
- Latencia promedio (si disponible en metadata)

### 2. Tabla de llamadas recientes
- Ultimas 20 llamadas a todas las APIs
- Columnas: Timestamp, Proveedor, Modelo, Edge Function, Action Type, Tokens, Coste, Ticker (si aplica)
- Indicador visual de exito/error

### 3. Resumen rapido
- Total de llamadas en 24h
- Providers activos vs inactivos
- Ultimo error detectado (si hay)

## Implementacion tecnica

### Archivo nuevo: `src/components/admin/ApiHealthDashboard.tsx`
- Consulta a `api_usage_logs` para obtener las ultimas llamadas por proveedor
- Agrupa por provider para calcular estado de salud
- Usa intervalos de tiempo para determinar si un provider esta "activo" (llamada en ultimas 2h), "inactivo" (mas de 24h), o "sin datos"
- Reutiliza el patron de `admin-api-data` edge function para obtener datos

### Modificacion: `src/pages/Admin.tsx`
- Anadir nueva tab "API Health" con icono `HeartPulse` de lucide-react
- Importar y renderizar `ApiHealthDashboard`
- Posicionar despues de "Gastos API" ya que son conceptos relacionados

### Datos
- Se consulta directamente la tabla `api_usage_logs` via el edge function `admin-api-data` existente (o via query directa si es mas eficiente)
- No requiere nuevas tablas ni migraciones
- Los datos de salud se calculan en el frontend a partir de los logs existentes

### Detalle tecnico del componente
```text
+--------------------------------------------------+
| API Health Status                    [Refresh]    |
+--------------------------------------------------+
| [7 tarjetas en grid 2x4]                        |
|                                                   |
| OpenAI     Perplexity  Gemini    DeepSeek        |
| [OK]       [OK]        [OK]      [OK]            |
| 142 calls  89 calls    67 calls  45 calls        |
|                                                   |
| Grok       Qwen       Firecrawl                  |
| [OK]       [OK]       [OK]                       |
| 38 calls   41 calls   12 calls                   |
+--------------------------------------------------+
| Ultimas llamadas                                  |
| Timestamp | Provider | Model | Function | Status |
+--------------------------------------------------+
```

### Logica de estado
- **Verde (OK)**: Ultima llamada exitosa hace menos de 2 horas
- **Amarillo (Idle)**: Ultima llamada hace mas de 2h pero menos de 24h
- **Rojo (Down)**: Ultima llamada hace mas de 24h o con errores recientes
- **Gris (Sin datos)**: No hay registros para este provider

El componente usara los mismos estilos y patrones del resto del admin (Cards, Badges, Tables de shadcn/ui).
