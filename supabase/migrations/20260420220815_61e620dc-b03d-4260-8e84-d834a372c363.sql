CREATE OR REPLACE FUNCTION public.similarity(text, text)
RETURNS real LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, extensions
AS $f$ SELECT extensions.similarity($1, $2) $f$;