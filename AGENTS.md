# Electoral specials
- Load official election history through one cached client-side loader shared by historical views and live comparisons; missing live fields stay absent rather than inferred.
- Reuse the provincial SVG geometry loader and map renderer for historical and live elections so boundaries and province interactions remain consistent.- Noche 29-N: the client discards any `modo: "simulacro"` state on fetch (treated as no data); never render simulated or sample figures — why: only official Interior data may be published.
- 29-N specials share one black navigation bar (`src/components/especiales/BarraEspeciales29N.tsx`); debate iframes hide their own verbatim `nav.dbx` via same-origin CSS injection — why: one consistent bar without editing the verbatim HTML files.
- Election-night countdown logic lives in `src/components/especiales/cuentaAtras.ts` (closing time as a fixed UTC instant) — why: testable and independent of the viewer’s timezone.
