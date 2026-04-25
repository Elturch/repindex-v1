-- 2026-04-26_security_hotfix_interested_leads
-- Cierra finding `interested_leads_no_public_insert` (ERROR severity)
-- Bloquea explícitamente INSERT desde clientes públicos (anon y authenticated)
-- save-interested-lead edge function sigue funcionando vía service_role (bypassa RLS)

CREATE POLICY "Block public inserts on interested_leads"
ON public.interested_leads
FOR INSERT
TO anon, authenticated
WITH CHECK (false);