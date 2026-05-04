## Plan: Restaurar nombres, estado activo y empresa en Admin

### Cambio 1 — Migración SQL
Recrear `public.list_admin_users()` para devolver desde `user_profiles`:
- `full_name`
- `is_active` (vía `COALESCE(p.is_active, false)`)
- `is_individual` (vía `COALESCE(p.is_individual, p.company_id IS NULL)`)
- `company_id`, `role`, `email_confirmed_at`, `last_sign_in_at`, `created_at`, `email`, `id`

### Cambio 2 — `src/pages/Admin.tsx` (mapping de usuarios)
Reemplazar el bloque hardcoded por:
```ts
const mapped: UserProfile[] = (data ?? []).map((row: any) => ({
  id: row.id,
  email: row.email,
  full_name: row.full_name ?? null,
  company_id: row.company_id ?? null,
  is_individual: row.is_individual ?? !row.company_id,
  is_active: row.is_active ?? false,
  created_at: row.created_at,
  client_companies: null,
  last_sign_in_at: row.last_sign_in_at ?? null,
  email_confirmed_at: row.email_confirmed_at ?? null,
  role: (row.role as 'admin' | 'press' | 'user' | null) ?? 'user',
}));
```

### Cambio 3 — Hidratar `client_companies`
Tras `setUsers(mapped)`, cargar `client_companies` (id, company_name, plan_type) e inyectar en cada usuario con `company_id`.

### Resultado
- Nombres reales restaurados
- Usuarios descartados vuelven a aparecer como inactivos
- Empresas correctamente asignadas
- Cero impacto en datos (la BD ya tiene la información correcta)
