

# Distribucion uniforme de negritas inteligentes a lo largo del informe

## Problema detectado

La funcion `highlightSmartKeywords` selecciona hasta 15 terminos pero los ordena por prioridad de capa y luego por posicion. Como el bucle de seleccion se detiene al llegar al limite, los terminos del final del documento nunca se seleccionan -- todas las negritas se concentran en los primeros parrafos.

## Solucion: distribucion por bloques

En lugar de un presupuesto global de 15 negritas aplicado de arriba a abajo, dividir el documento en bloques logicos (separados por doble salto de linea o cabeceras markdown) y asignar un presupuesto proporcional a cada bloque, garantizando al menos 1 highlight por bloque si hay candidatos.

## Cambios tecnicos

### Archivo: `src/lib/markdownToHtml.ts`

**Modificacion de la seccion "Layer 4: Density control" (lineas ~655-681)**

Logica nueva:

1. Dividir el markdown en bloques usando doble salto de linea (`\n\n`) como separador. Calcular los rangos de caracteres de cada bloque.
2. Clasificar cada match candidato en su bloque correspondiente segun su `index`.
3. Calcular presupuesto por bloque:
   - Total: 15 highlights.
   - Base: 1 highlight garantizado por bloque (si tiene candidatos).
   - Sobrante: se reparte proporcionalmente al numero de candidatos por bloque.
4. Dentro de cada bloque, seleccionar candidatos por prioridad de capa (3 > 1 > 2), respetando el presupuesto del bloque.
5. Seguir respetando las reglas existentes: no solapamientos, no duplicados de texto, no re-negritar lo que el LLM ya marco.

**Resultado esperado**: si un informe tiene 10 bloques de texto, cada bloque tendra 1-2 negritas bien escogidas en lugar de 15 negritas amontonadas en los primeros 3 bloques.

## Ejemplo

Informe con 8 bloques de texto y 25 candidatos totales:
- Presupuesto: 15 highlights, 8 bloques con candidatos.
- Garantia: 1 por bloque = 8 usados.
- Sobrante: 7 se reparten entre los bloques con mas candidatos de alta prioridad.
- Resultado: cada bloque tiene entre 1 y 3 negritas, distribuidas uniformemente.

## Impacto

- 1 archivo modificado: `src/lib/markdownToHtml.ts`
- Solo se cambia la logica de seleccion/densidad (lineas ~655-681), no las capas de deteccion
- Sin cambios en backend ni componentes UI

