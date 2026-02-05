
# Plan: Corregir RLS para Guardar Leads

## Problema Identificado

La política RLS de INSERT en la tabla `interested_leads` no incluye explícitamente el rol `anon`, lo que impide que usuarios no autenticados (que intentan login) puedan insertar sus datos.

La política actual:
```sql
CREATE POLICY "Public can insert leads" ON public.interested_leads
  FOR INSERT WITH CHECK (true);
```

Debería incluir explícitamente:
```sql
CREATE POLICY "Public can insert leads" ON public.interested_leads
  AS PERMISSIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
```

## Cambio Necesario

### Migración SQL

Crear una nueva migración que:
1. Elimine la política actual de INSERT
2. Cree la nueva política con `TO anon, authenticated`

```sql
-- Drop existing INSERT policy
DROP POLICY IF EXISTS "Public can insert leads" ON public.interested_leads;

-- Recreate with explicit anon and authenticated roles
CREATE POLICY "Public can insert leads" ON public.interested_leads
  AS PERMISSIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
```

## Nota Importante

Además, debo mencionar que **el flujo de login no puede probarse desde el entorno de Preview** porque el código tiene un bypass que redirige automáticamente al dashboard en entornos de desarrollo. Las pruebas deben hacerse desde `https://repindex-v1.lovable.app/login` (producción).

## Impacto

| Aspecto | Antes | Después |
|---------|-------|---------|
| Inserción desde anon | Bloqueada por RLS | Permitida |
| Login no registrado | No guarda lead | Guarda lead correctamente |
| Seguridad | Sin cambios | Igual (solo INSERT público) |

## Archivos a modificar

1. **Nueva migración SQL** - Corregir política RLS con `TO anon, authenticated`
