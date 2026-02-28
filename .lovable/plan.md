

# Añadir perspectiva "Asuntos Públicos" al Agente Rix

## Resumen

Crear un nuevo rol de enriquecimiento "Asuntos Públicos" que traduzca los datos reputacionales de RepIndex en inteligencia accionable para directores de Relaciones Institucionales y Public Affairs, usando la estructura de 6 bloques proporcionada.

## Cambios

### Archivo: `src/lib/chatRoles.ts`

**1. Ampliar el tipo `category`**

Añadir `"asuntos_publicos"` al union type del interfaz `ChatRole` y al objeto `ROLE_CATEGORIES`:

```
asuntos_publicos: "Asuntos Publicos"
```

**2. Añadir el rol al array `CHAT_ROLES`**

Nuevo elemento con:
- `id`: `"asuntos_publicos"`
- `emoji`: `"🏛️"`
- `name`: `"Asuntos Publicos"`
- `shortDescription`: `"Exposicion institucional, licencia social, radar regulatorio"`
- `category`: `"asuntos_publicos"`
- `prompt`: El prompt completo con las 6 secciones proporcionadas por el usuario, integradas con las reglas de lenguaje de metricas (`METRIC_LANGUAGE_RULES`):

  1. **MAPA DE EXPOSICION INSTITUCIONAL** -- Percepcion de Gobierno como proxy de confianza institucional; Gestion de Controversias como proxy de riesgo de escrutinio publico; lectura de lo que dicen los modelos en contexto regulatorio/politico.
  2. **LICENCIA SOCIAL PARA OPERAR** -- Cruce de metricas para evaluar capital reputacional; Coherencia Informativa como detector de gaps de opacidad; vulnerabilidades ante comparecencias, comisiones o iniciativas legislativas.
  3. **RADAR REGULATORIO** -- Patrones en datos que sugieran riesgo de atencion regulatoria; controversias activas que podrian escalar al ambito politico; benchmark de escrutinio competitivo.
  4. **BENCHMARK INSTITUCIONAL** -- Ranking sectorial por solidez de gobernanza percibida; vulnerabilidad ante cambios regulatorios; oportunidades de posicionamiento proactivo ante la administracion.
  5. **STAKEHOLDER MAP POLITICO** -- Identificacion de stakeholders institucionales (regulador, supervisores, gobierno, parlamento); narrativa preventiva para cada uno.
  6. **PLAN DE ACCION INSTITUCIONAL** -- Acciones proactivas (posicionamiento, comparecencias, informes sectoriales); acciones defensivas (preparacion ante escrutinio, argumentarios); priorizacion por urgencia e impacto.

  Formato: Orientado a deliverables de relaciones institucionales. Fichas de accion, mapas de stakeholders, no ensayos teoricos.
  Tono: Estrategico-institucional, como un consultor senior de asuntos publicos informando al Director de RRII.

**3. Incluir en `getFeaturedRoles()`**

Añadir `"asuntos_publicos"` al array `featuredIds` para que aparezca en la barra de enriquecimiento principal.

## Sin cambios adicionales

`RoleEnrichmentBar` y `SessionConfigPanel` ya iteran dinamicamente sobre `CHAT_ROLES`, `ROLE_CATEGORIES` y `getFeaturedRoles()`. El nuevo rol aparecera automaticamente en todos los selectores y menus sin tocar ningun otro archivo.

## Impacto

- 1 archivo modificado: `src/lib/chatRoles.ts`
- Sin cambios en backend, edge functions ni base de datos
- El rol se inyecta en el flujo existente de enriquecimiento, disponible inmediatamente en la interfaz

