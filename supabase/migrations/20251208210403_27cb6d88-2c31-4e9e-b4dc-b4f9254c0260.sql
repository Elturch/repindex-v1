-- Añadir campo status a user_notifications para sistema de borradores
ALTER TABLE public.user_notifications 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';

-- Añadir índice para búsquedas por status
CREATE INDEX IF NOT EXISTS idx_user_notifications_status ON public.user_notifications(status);

-- Añadir campo para tracking del admin que creó/aprobó
ALTER TABLE public.user_notifications 
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS scheduled_for timestamp with time zone;

-- Comentarios para documentación
COMMENT ON COLUMN public.user_notifications.status IS 'draft=borrador, approved=aprobado pendiente envío, sent=enviado, cancelled=cancelado';
COMMENT ON COLUMN public.user_notifications.created_by IS 'Admin que creó el mensaje';
COMMENT ON COLUMN public.user_notifications.approved_by IS 'Admin que aprobó el envío';
COMMENT ON COLUMN public.user_notifications.approved_at IS 'Fecha de aprobación';
COMMENT ON COLUMN public.user_notifications.scheduled_for IS 'Fecha programada para envío (opcional)';