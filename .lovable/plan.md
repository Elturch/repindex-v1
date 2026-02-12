

# Fix: Regex normalizado para matching de empresas

## Problema

El sistema ya normaliza acentos en `detectCompaniesInQuestion`, pero NO lo hace en el **bulletin handler** (linea ~2500). Resultado: "telefonica" no matchea con "Telefonica".

## Solucion (3 cambios minimos)

### Cambio 1: Cache - anadir `include_terms`

En la query del cache (linea 1959), anadir `include_terms` al SELECT para tener los aliases:

```typescript
.select('issuer_name, issuer_id, ticker, sector_category, ibex_family_code, cotiza_en_bolsa, include_terms');
```

### Cambio 2: Bulletin handler - normalizar con NFD

En el bulletin handler (linea ~2500), aplicar la misma normalizacion NFD que ya existe en `detectCompaniesInQuestion`:

```typescript
// Anadir normalize antes del .find()
const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const normalizedQuery = normalize(companyQuery);

// En el .find(), comparar con normalize(c.issuer_name)
```

### Cambio 3: detectCompaniesInQuestion - check include_terms

Despues del partial match existente, anadir un check contra `include_terms` (los aliases como "Acciona Energia" sin tilde):

```typescript
if (company.include_terms) {
  const terms = Array.isArray(company.include_terms) ? company.include_terms : JSON.parse(company.include_terms);
  if (terms.some(t => normalize(t).length > 3 && normalizedQuestion.includes(normalize(t)))) {
    detectedCompanies.push(company);
  }
}
```

## Resultado

La misma regex NFD que ya funciona en un sitio, se replica en el otro. Sin logica nueva, solo consistencia.

| Input | Antes | Despues |
|---|---|---|
| "telefonica" | Vacio | Telefonica |
| "enagas" | Vacio | Enagas |
| "acciona energia" | Vacio | Acciona Energia |
| "BBVA" | OK | OK |

## Archivo

Solo `supabase/functions/chat-intelligence/index.ts` (3 cambios puntuales en lineas existentes)

