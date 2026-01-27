# Plan: Guardrails de Competencia Inteligente para Boletines

## ✅ ESTADO: FASE 1 COMPLETADA

### Cambios Implementados (27 enero 2026)

**1. Base de Datos:**
- ✅ Tabla `competitor_relationships` creada con competidores verificados
- ✅ Campo `subsector` añadido a `repindex_root_issuers`
- ✅ Datos semilla para sectores clave: Banca, Energía, Construcción, Telecom
- ✅ RLS configurado (lectura pública, escritura admin)

**2. Edge Function (`chat-intelligence/index.ts`):**
- ✅ Función `getRelevantCompetitors()` con sistema de 5 niveles:
  - TIER 1: Competidores VERIFICADOS de tabla `competitor_relationships`
  - TIER 2: Mismo SUBSECTOR + Misma familia IBEX
  - TIER 3: Mismo SUBSECTOR (cualquier IBEX)
  - TIER 4: Mismo SECTOR + Misma familia IBEX (AND, no OR!)
  - TIER 5: Mismo SECTOR con filtro de subsectores incompatibles
- ✅ Blacklist `KNOWN_NON_COMPETITORS` para falsos positivos conocidos
- ✅ Logging detallado para debugging

**3. Subsectores Configurados:**
| Ticker | Subsector |
|--------|-----------|
| TEF, MAS | Operadores Telecom |
| CLNX | Infraestructura Telecom |
| AMS | Tech Viajes |
| LLYC | Comunicación y PR |
| IDR | Consultoría IT/Defensa |
| SAN, BBVA, CABK, SAB | Banca Comercial |
| IBE, ENG, ELE, NTGY | Utilities Eléctricas |
| ACS, FER, FCC, SCYR | Construcción e Infraestructuras |

---

## Resultado Esperado

| Antes (Error) | Después (Correcto) |
|---------------|-------------------|
| Competidores de Telefónica: Amadeus, BBVA, Iberdrola | Competidores de Telefónica: Cellnex, MásMóvil |
| Mezcla de sectores sin sentido | Solo empresas del mismo subsector |
| Sin validación | Triple validación: Blacklist + BD + Lógica por tiers |

---

## Fases Pendientes

### Fase 2 (Siguiente Sprint)
- [ ] Poblar competidores verificados para todas las empresas IBEX-35
- [ ] Validación con IA como guardrail adicional (opcional)
- [ ] UI de admin para gestionar competidores

### Fase 3 (Futuro)
- [ ] Añadir subsector a las 174 empresas restantes
- [ ] Auto-sugerencia de competidores con validación humana
