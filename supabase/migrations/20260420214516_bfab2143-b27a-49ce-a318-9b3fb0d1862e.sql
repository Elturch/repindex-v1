-- source_models
DROP POLICY IF EXISTS "Acceso público de actualización" ON public.source_models;
DROP POLICY IF EXISTS "Acceso público de eliminación" ON public.source_models;
DROP POLICY IF EXISTS "Acceso público de inserción" ON public.source_models;

-- sweep_progress
DROP POLICY IF EXISTS "Actualización pública sweep_progress" ON public.sweep_progress;
DROP POLICY IF EXISTS "Eliminación pública sweep_progress" ON public.sweep_progress;
DROP POLICY IF EXISTS "Inserción pública sweep_progress" ON public.sweep_progress;

-- top_drivers
DROP POLICY IF EXISTS "Acceso público de actualización" ON public.top_drivers;
DROP POLICY IF EXISTS "Acceso público de eliminación" ON public.top_drivers;
DROP POLICY IF EXISTS "Acceso público de inserción" ON public.top_drivers;

-- weekly_news
DROP POLICY IF EXISTS "Inserción restringida weekly_news" ON public.weekly_news;
DROP POLICY IF EXISTS "Actualización restringida weekly_news" ON public.weekly_news;
CREATE POLICY "Admins manage weekly_news"
  ON public.weekly_news FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));