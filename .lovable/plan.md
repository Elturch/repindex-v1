

## Plan de Stress Test del Agente Rix — Diccionario + Periodos Temporales

### Batería de 16 consultas organizadas por vector de fallo

**Grupo A — Grupos canónicos recientes (diccionario)**
1. `"Ranking de grupos hospitalarios"` — Grupo con exclusiones (GRF, PHM, ROVI excluidos); verifica que no aparezcan farmacéuticas
2. `"Compara las OTAs en el último trimestre"` — Grupo canónico + temporal trimestral
3. `"¿Cómo están las cerveceras?"` — Grupo micro (2 empresas, ambas PRIV)
4. `"Ranking de bodegas últimas 6 semanas"` — Grupo micro + temporal relativo
5. `"Sector defensa: evolución último mes"` — Grupo reciente + temporal mensual

**Grupo B — Marca matriz y propiedad (glossary)**
6. `"Análisis de Zara en el primer trimestre 2026"` — Debe resolver a ITX, no fallar como empresa desconocida
7. `"¿Qué dicen las IAs de Movistar?"` — Debe resolver a TEF
8. `"¿De quién es HLA Hospitales?"` — Entrada tipo `propiedad` en glossary

**Grupo C — Temporales avanzados**
9. `"Top 5 IBEX en el último trimestre"` — Ranking + trimestre relativo (Q1 2026 o Q2 según fecha)
10. `"Evolución del sector banca en las últimas 6 semanas"` — Sector + temporal relativo 6 semanas
11. `"Ranking de las eléctricas en febrero 2026"` — Grupo canónico + mes específico
12. `"¿Cómo ha evolucionado BBVA en el primer semestre 2026?"` — Empresa + semestre
13. `"Farmacéuticas en las últimas 8 semanas"` — Grupo canónico + temporal que puede exceder datos disponibles

**Grupo D — Edge cases y no_disponible**
14. `"Análisis de Abengoa"` — Empresa liquidada (no_disponible); debe dar respuesta explicativa sin intentar buscar datos
15. `"Compara Lidl con Mercadona"` — Una no_disponible + una que sí existe
16. `"Ranking de supermercados último trimestre"` — Grupo canónico con mix de PRIV y públicas + temporal

### Verificaciones por consulta

Para cada respuesta se comprobará:
- **Scores**: 6 puntuaciones individuales visibles, sin mediana ni "RIX Score" único
- **Scope**: que el DataPack y la narrativa cubran TODAS las empresas del grupo/ranking (no solo el líder)
- **Exclusiones**: que los grupos con exclusions (hospitalarios) no incluyan las empresas excluidas
- **Fechas**: que la metodología refleje las fechas REALES del dataset, no las solicitadas
- **Temporal**: que `parseTemporalExpression` genere el rango correcto y que los datos se filtren por ese rango
- **Glossary**: que marcas (Zara→ITX), no_disponible (Abengoa) y propiedad (HLA) se resuelvan correctamente
- **Bibliografía**: URLs solo de empresas en scope

### Implementación técnica

Se ejecutarán las 16 consultas via `supabase--curl_edge_functions` contra `chat-intelligence` con un `conversation_id` único por test. Cada respuesta se parseará buscando:
- Patrones prohibidos: `/mediana|RIX Score.*\d{2}/i`
- Presencia obligatoria de tabla con 6 columnas de modelo
- Fechas de metodología vs rango temporal solicitado
- Empresas mencionadas vs empresas esperadas del grupo canónico

### Entregable

Documento `/mnt/documents/stress_test_rix_agent.md` con resultado de cada test (PASS/FAIL), extracto de la respuesta problemática, y lista de bugs priorizados por severidad.

