import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type State = 'verifying' | 'success' | 'expired' | 'used' | 'invalid' | 'error';

/**
 * /auth/callback?token=...&email=...
 *
 * Página pública que finaliza el flujo de magic link mediante verifyOtp.
 * Inmune al prefetch de Outlook/Mimecast porque verifyOtp requiere POST con
 * el token; los escáneres corporativos sólo hacen GET.
 */
const AuthCallback: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<State>('verifying');
  const [errorDetail, setErrorDetail] = useState<string>('');
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const token = params.get('token') || params.get('token_hash');
    const email = params.get('email');

    if (!token || !email) {
      setState('invalid');
      return;
    }

    const verify = async () => {
      try {
        const normalizedEmail = email.trim().toLowerCase();

        // Intento 1: type 'magiclink' (correcto para generateLink({type:'magiclink'}))
        let { data, error } = await supabase.auth.verifyOtp({
          email: normalizedEmail,
          token,
          type: 'magiclink',
        });

        // Fallback: type 'email' (alias moderno)
        if (error) {
          const retry = await supabase.auth.verifyOtp({
            email: normalizedEmail,
            token,
            type: 'email',
          });
          data = retry.data;
          error = retry.error;
        }

        if (error) {
          const msg = (error.message || '').toLowerCase();
          console.error('[AuthCallback] verifyOtp error:', error);
          setErrorDetail(error.message || 'Error desconocido');
          if (msg.includes('expired')) {
            setState('expired');
          } else if (msg.includes('invalid') || msg.includes('not found')) {
            setState('used');
          } else {
            setState('error');
          }
          return;
        }

        if (!data?.session) {
          setState('error');
          setErrorDetail('No se devolvió sesión tras la verificación.');
          return;
        }

        setState('success');
        // Pequeño delay para que el AuthProvider procese onAuthStateChange
        setTimeout(() => navigate('/dashboard', { replace: true }), 400);
      } catch (err) {
        console.error('[AuthCallback] Unexpected error:', err);
        setState('error');
        setErrorDetail(err instanceof Error ? err.message : 'Error inesperado');
      }
    };

    verify();
  }, [params, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border/50 shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">
            <span className="text-primary">Rep</span>
            <span className="text-foreground">Index</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-6">
          {state === 'verifying' && (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Verificando tu acceso…</p>
            </div>
          )}

          {state === 'success' && (
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-muted-foreground">Acceso confirmado. Entrando…</p>
            </div>
          )}

          {(state === 'expired' || state === 'used' || state === 'invalid' || state === 'error') && (
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-2">
                  {state === 'expired' && 'Enlace expirado'}
                  {state === 'used' && 'Enlace ya utilizado'}
                  {state === 'invalid' && 'Enlace incompleto'}
                  {state === 'error' && 'No pudimos verificar el enlace'}
                </h3>
                <p className="text-muted-foreground text-sm mb-4">
                  {state === 'expired' && 'El enlace de acceso caducó. Solicita uno nuevo desde la pantalla de login.'}
                  {state === 'used' && 'Este enlace ya fue utilizado. Solicita uno nuevo para volver a entrar.'}
                  {state === 'invalid' && 'Faltan parámetros en el enlace. Solicita uno nuevo desde la pantalla de login.'}
                  {state === 'error' && 'Algo falló al verificar tu acceso. Solicita un nuevo enlace.'}
                </p>
                {errorDetail && (
                  <p className="text-xs text-muted-foreground/70 mb-4 break-words">
                    Detalle técnico: {errorDetail}
                  </p>
                )}
              </div>
              <Button asChild className="w-full">
                <Link to="/login">Solicitar nuevo enlace</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthCallback;