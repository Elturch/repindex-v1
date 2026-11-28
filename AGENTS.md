# Electoral specials
- Load official election history through one cached client-side loader shared by historical views and live comparisons; missing live fields stay absent rather than inferred.
- Reuse the provincial SVG geometry loader and map renderer for historical and live elections so boundaries and province interactions remain consistent.- Noche 29-N: the client discards any `modo: "simulacro"` state on fetch (treated as no data); never render simulated or sample figures — why: only official Interior data may be published.
