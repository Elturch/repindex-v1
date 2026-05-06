## Normalización de subsectores con respaldo en base de datos (v2)

### Objetivo
Cada empresa de `repindex_root_issuers` tendrá un `subsector` granular y persistido en BD. Los filtros del informe (sector → subsector → empresa) trabajarán en cascada, de forma que "Grupos Hospitalarios" devuelva exactamente las 7 empresas hospitalarias y "Cerveceras" devuelva solo cerveceras.

### Diagnóstico
- 27 sectores actuales, solo 9 con subsector parcial.
- Sectores críticos sin subsector: Salud (16), Construcción e Infraestructuras (26), Energía (15), Materias Primas (10), Otros Sectores (40).
- Duplicados/cajón desastre: "Construcción" suelto, "Petróleo y Energía", "Telecomunicaciones" suelto, "Otros Sectores".

### Taxonomía propuesta (ajustada según feedback)

```text
Salud y Farmacéutico
  ├── Farmacéuticas              → Almirall, Faes Farma, Laboratorios Rovi, Reig Jofre
  ├── Biotecnología              → Oryzon Genomics, PharmaMar, Atrys Health
  ├── Hemoderivados              → Grifols
  ├── Grupos Hospitalarios       → HM Hospitales, Quirónsalud, Vithas, Grupo Hospitalario HLA,
                                    Grupo Hospiten, Viamed Salud, Ribera Salud
  └── Servicios Médicos Especializados → Clínica Baviera

Banca y Servicios Financieros
  ├── Banca Comercial            → Santander, BBVA, CaixaBank, Sabadell, Bankinter, Unicaja
  └── Banca de Inversión / Gestión → Alantra Partners, Renta 4 Banco

Seguros (sector independiente, conservado)
  ├── Aseguradoras Generalistas  → Mapfre, Catalana Occidente, Mutua Madrileña
  ├── Aseguradoras Directas      → Línea Directa Aseguradora
  └── Aseguradoras de Salud      → Sanitas

Construcción e Infraestructuras  (absorbe sector "Construcción")
  ├── Constructoras              → ACS, Ferrovial, Sacyr, FCC, OHLA, Grupo Empresarial San José,
                                    Grupo Azvi, Acciona, Clerhp Estructuras
  ├── Concesionarias de Infraestructura → Abertis
  ├── Ingeniería y Servicios Industriales → Técnicas Reunidas, Elecnor
  ├── Material Ferroviario       → CAF, Talgo
  ├── Promotoras Residenciales   → AEDAS Homes, Neinor Homes, Metrovacesa, Realia Business,
                                    Renta Corporación, Montebalito, Inmobiliaria del Sur
  ├── SOCIMIs / Patrimonialistas → Merlin Properties, Inmobiliaria Colonial, Lar España,
                                    Castellana Properties, Árima Real Estate, All Iron RE,
                                    Uro Property Holdings, CEVASA, Libertas 7
  ├── Inmobiliarias Diversificadas → Nyesa Valores, Urbas
  └── PropTech                   → Idealista

Energía y Gas  (absorbe "Petróleo y Energía")
  ├── Utilities Eléctricas       → Iberdrola, Endesa, Naturgy
  ├── Transmisión y Distribución → Redeia, Enagás
  ├── Oil & Gas                  → Repsol, Moeve
  ├── Logística Energética       → Exolum
  ├── Renovables                 → Acciona Energía, Solaria, Grenergy, Audax, Ecoener,
                                    EiDF Solar, Enerside, Holaluz, Soltec, Berkeley Energía
  └── Biomasa y Celulosa         → Ence Energía y Celulosa

Materias Primas y Siderurgia
  ├── Acero Inoxidable           → Acerinox
  ├── Siderurgia Integral        → ArcelorMittal
  ├── Tubos de Acero             → Tubacex, Tubos Reunidos
  ├── Química                    → Ercros
  ├── Papel y Celulosa           → Iberpapel, Miquel y Costas
  ├── Envases                    → Vidrala, Viscofan
  └── Componentes Metálicos      → Lingotes Especiales

Telecomunicaciones y Tecnología  (absorbe "Telecomunicaciones")
  ├── Operadores Telecom         → Telefónica, Grupo MASORANGE
  ├── Telecom Alternativos       → Parlem Telecom
  ├── Infraestructura Telecom    → Cellnex
  ├── Tech Viajes                → Amadeus IT
  ├── Consultoría IT / Defensa   → Indra
  ├── Big Tech                   → Google, Amazon, Meta
  ├── Comunicación y PR          → LLYC
  ├── Software y Servicios IT    → Altia, Izertis, Making Science, Seresco, Gigas Hosting,
                                    Agile Content, Netex Learning, Substrate AI, Robot S.A.
  ├── EdTech                     → Proeduca Altus
  └── Media Digital              → Fever, Squirrel Media, Secuoya Content Group

Hoteles y Turismo
  ├── Hoteles                    → Meliá Hotels
  ├── OTAs / Marketplaces Viaje  → Booking.com, Airbnb, eDreams ODIGEO
  ├── Aerolíneas                 → IAG
  └── Aeropuertos                → Aena

Alimentación y Bebidas
  ├── Cerveceras                 → Damm, Mahou San Miguel
  ├── Bebidas Espumosas          → Freixenet
  ├── Refrescos                  → Coca-Cola Europacific Partners
  ├── Vinos                      → Bodegas Bilbaínas, Bodegas Riojanas
  ├── Cárnicas                   → Campofrío
  ├── Pesca                      → Nueva Pescanova, Pescanova (Nueva Pescanova)
  ├── Aceite                     → Deoleo
  ├── Holdings Alimentarios      → Agrolimen, Ebro Foods
  └── Nutrición                  → Naturhouse

Consumo y Distribución (fusiona "Distribución" + "Moda y Distribución")
  ├── Retail Moda                → Inditex, Adolfo Domínguez
  ├── Gran Distribución          → Mercadona, Eroski, El Corte Inglés, DIA
  ├── Cosmética y Perfumería     → Puig Brands
  └── Material Sanitario Retail  → Prim

Consultoría y Auditoría
  └── Big Four / Consultoría     → Deloitte, PwC, EY, KPMG, Accenture

Defensa e Ingeniería
  ├── Defensa                    → Escribano EM&E, Airbus
  └── Ingeniería Avanzada / Robótica → Airtificial

Automoción
  └── Componentes Auto           → Gestamp, CIE Automotive, Grupo Antolín

Logística y Transporte (fusiona "Logística" + "Transporte")
  ├── Logística Postal           → Correos
  ├── Distribución Tabacos       → Logista
  └── Transporte Ferroviario     → Renfe

Industria
  ├── Materiales de Construcción → Cosentino
  ├── Equipos Piscinas           → Fluidra
  ├── Maquinaria                 → Nicolás Correa, Duro Felguera, GAM, Azkoyen
  ├── Componentes Industriales   → Global Dominion, Ezentis
  └── Textil Técnico             → Nextil

Medios y Comunicación  (nuevo, sale de "Otros Sectores")
  ├── TV / Audiovisual           → Atresmedia, MFE-MediaForEurope
  └── Prensa                     → PRISA, Vocento

Seguridad
  └── Seguridad Privada          → Prosegur, Prosegur Cash

Restauración
  └── Comida Rápida              → Telepizza Brands  (consolidar duplicado)

Servicios B2B
  └── Inspección y Certificación → Applus Services
```

### Consolidación de sectores
1. Eliminar sector "Construcción" → fusionar en "Construcción e Infraestructuras".
2. Eliminar "Petróleo y Energía" → fusionar en "Energía y Gas".
3. Eliminar "Telecomunicaciones" suelto → fusionar en "Telecomunicaciones y Tecnología".
4. Mantener "Seguros" como sector propio (incluye Mapfre, Catalana Occidente, Mutua Madrileña, Línea Directa, Sanitas).
5. Renombrar "Alimentación" → "Alimentación y Bebidas" (incluye cerveceras, vinos, refrescos).
6. Fusionar "Distribución" + "Moda y Distribución" → "Consumo y Distribución".
7. Fusionar "Logística" + "Transporte" → "Logística y Transporte".
8. Vaciar "Otros Sectores" reasignando 40 empresas.
9. Airbus pasa a "Defensa e Ingeniería"; Airtificial también va aquí en "Ingeniería Avanzada / Robótica".

### Cambios técnicos

**1. Migración SQL** (`supabase/migrations/{ts}_normalize_subsectors.sql`)
   - Una sola transacción con ~140 `UPDATE repindex_root_issuers SET sector_category = ?, subsector = ? WHERE ticker = ?`.
   - Tabla auxiliar opcional `repindex_subsector_taxonomy(sector_category, subsector, description)` como source-of-truth.
   - `COMMENT ON COLUMN` documentando la taxonomía.

**2. Hook nuevo `src/hooks/useSubsectors.ts`**
   - `SELECT DISTINCT sector_category, subsector FROM repindex_root_issuers WHERE subsector IS NOT NULL ORDER BY sector_category, subsector`.
   - Devuelve mapa `{ [sector]: string[] }` para alimentar el combo en cascada.

**3. `src/components/reports/FilterPanel.tsx`**
   - Bloque nuevo "Subsector" tras "Sector". Opciones filtradas por `state.sector.value`.
   - `tickerOptions` y `sectorOptions` aplican también el filtro `subsector`.
   - Mantiene la regla previa: `universe` filtra solo cuando `origin === "user-set"`.

**4. `src/lib/reports/coherenceEngine.ts`**
   - Añadir reglas:
     - **R-sub-1**: si el usuario marca `subsector` y todas las empresas de ese subsector pertenecen a un único `sector_category`, derivar `sector` (`origin: "derived"`).
     - **R-sub-2**: si cambia `sector` user-set y el `subsector` user-set ya no encaja, vaciar `subsector` a `free`.
     - **R-sub-3**: `getScopeTickers` y `computeScopeSize` aplican filtro `subsector`.
   - `subsector` ya está declarado en `FilterState` (`src/lib/reports/filterState.ts`), no requiere ampliar el tipo.

**5. `src/lib/reports/compileQuestion.ts`**
   - Incluir el `subsector` en la pregunta compilada cuando esté presente.

**6. `src/components/reports/LivePreview.tsx`**
   - Mostrar chip de subsector cuando esté activo.

**7. Verificación post-migración** (lectura)
   - `SELECT sector_category, subsector, COUNT(*) FROM repindex_root_issuers GROUP BY 1,2 ORDER BY 1,2`.
   - Confirmar 0 NULL en `subsector` para empresas activas.
   - Smoke-tests: "Grupos Hospitalarios" = 7, "Cerveceras" = 2, "Banca Comercial" = 6, "Seguros / Aseguradoras Generalistas" = 3.

### Lo que NO se toca
- Esquema RIX (`rix_runs_v2`), edge functions de scoring.
- `verified_competitors`.
- Lógica de universos (`ibex_family_code`).
- `ChatContext.tsx`, `RixViewer.tsx`.

### Riesgos
- Informes guardados que filtraban por sectores eliminados ("Construcción", "Otros Sectores", "Telecomunicaciones") quedarán con chip vacío al rehidratar; el usuario debe regenerar.
- `rix_runs_v2` no usa `sector_category` → cero impacto en datos históricos.
- Catálogos de UI (`useSectorCategories`, `useSubsectors`) recalculan desde DB automáticamente.

### Entregables
1. Migración SQL con UPDATEs masivos + tabla taxonomía opcional.
2. Hook `useSubsectors.ts`.
3. Cambios en `FilterPanel.tsx`, `coherenceEngine.ts`, `compileQuestion.ts`, `LivePreview.tsx`.
4. SQL de verificación post-migración.
