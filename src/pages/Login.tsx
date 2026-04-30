import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, Loader2, CheckCircle, AlertCircle, ArrowLeft, UserPlus, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { isDevOrPreview } from '@/lib/env';
import { supabase } from '@/integrations/supabase/client';
import { Checkbox } from '@/components/ui/checkbox';

type LoginState = 'idle' | 'sending' | 'sent' | 'error' | 'not_registered';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loginState, setLoginState] = useState<LoginState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [consentGiven, setConsentGiven] = useState(false);
  const [savingLead, setSavingLead] = useState(false);
  const [leadSaveResult, setLeadSaveResult] = useState<{
    type: 'consent' | 'no_consent';
    isCorporateEmail?: boolean;
  } | null>(null);
  const { sendMagicLink, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // In dev/preview mode, skip login entirely and go to dashboard
  useEffect(() => {
    if (isDevOrPreview()) {
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard';
      navigate(from, { replace: true });
      return;
    }
    
    // Redirect if already authenticated
    if (!isLoading && isAuthenticated) {
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard';
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, location]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      setErrorMessage('Introduce tu email');
      setLoginState('error');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setErrorMessage('Introduce un email válido');
      setLoginState('error');
      return;
    }

    setLoginState('sending');
    setErrorMessage('');

    const result = await sendMagicLink(email.trim().toLowerCase());

    if (result.notRegistered) {
      // Email no está registrado - mostrar opción de consentimiento
      setLoginState('not_registered');
    } else if (result.error) {
      setErrorMessage(result.error);
      setLoginState('error');
    } else {
      setLoginState('sent');
    }
  };

  const saveLead = useCallback(async (withConsent: boolean) => {
    setSavingLead(true);
    setErrorMessage('');
    try {
      // Use Edge Function with Service Role to bypass any RLS/permission issues
      const { data, error } = await supabase.functions.invoke('save-interested-lead', {
        body: {
          email: email.trim().toLowerCase(),
          contact_consent: withConsent,
          source: 'login_attempt',
          user_agent: navigator.userAgent,
        }
      });

      if (error) {
        console.error('Error invoking save-interested-lead:', error);
        setErrorMessage('No se pudo guardar tu solicitud. Por favor, inténtalo de nuevo.');
        return;
      }

      // Check response from edge function
      if (!data?.ok) {
        console.error('Edge function returned error:', data?.error);
        setErrorMessage(data?.error || 'No se pudo guardar tu solicitud. Por favor, inténtalo de nuevo.');
        return;
      }
      
      console.log('Lead saved successfully:', data.leadId, 'Corporate:', data.isCorporateEmail);
      setLeadSaveResult({
        type: withConsent ? 'consent' : 'no_consent',
        isCorporateEmail: data.isCorporateEmail
      });
    } catch (err) {
      console.error('Error saving lead:', err);
      setErrorMessage('Error de conexión. Por favor, inténtalo de nuevo.');
    } finally {
      setSavingLead(false);
    }
  }, [email]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
      </div>

      {/* Back to home */}
      <Link 
        to="/" 
        className="absolute top-6 left-6 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Volver al inicio</span>
      </Link>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-block">
            <h1 className="text-3xl font-bold tracking-tight">
              <span className="text-primary">Rep</span>
              <span className="text-foreground">Index</span>
            </h1>
          </Link>
          <p className="text-muted-foreground mt-2">AI Corporate Reputation Authority</p>
        </div>

        <Card className="border-border/50 shadow-xl">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-xl">Acceder a tu cuenta</CardTitle>
            <CardDescription>
              Introduce tu email para recibir un enlace de acceso o para que te mandemos una invitación
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isDevOrPreview() && import.meta.env.VITE_DEV_PREVIEW_LOGIN_EMAIL ? (
              <div className="text-center py-6 space-y-4">
                <div className="text-xs uppercase tracking-wider text-amber-600 dark:text-amber-400 font-semibold">
                  Dev / Preview only
                </div>
                <Button
                  onClick={handleDevLogin}
                  disabled={devLoading}
                  className="w-full"
                >
                  {devLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <span className="mr-2">🔓</span>
                  )}
                  Login as {String(import.meta.env.VITE_DEV_PREVIEW_LOGIN_EMAIL)}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Sesión Supabase real vía edge function whitelisted. No disponible en producción.
                </p>
                {errorMessage && (
                  <div className="flex items-center gap-2 text-destructive text-sm justify-center bg-destructive/10 p-2 rounded">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}
              </div>
            ) : leadSaveResult ? (
              <div className="text-center py-6">
                <div className={`mx-auto w-12 h-12 ${leadSaveResult.type === 'consent' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-muted'} rounded-full flex items-center justify-center mb-4`}>
                  {leadSaveResult.type === 'consent' ? (
                    <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                  ) : (
                    <X className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                {leadSaveResult.type === 'consent' ? (
                  leadSaveResult.isCorporateEmail ? (
                    <>
                      <h3 className="font-semibold text-lg mb-2">¡Gracias por tu interés!</h3>
                      <p className="text-muted-foreground text-sm mb-4">
                        Te hemos enviado un email con un breve formulario para personalizar tu acceso a RepIndex.
                      </p>
                      <p className="text-xs text-muted-foreground mb-4">
                        Revisa tu bandeja de entrada (y spam) en <span className="font-medium">{email}</span>
                      </p>
                    </>
                  ) : (
                    <>
                      <h3 className="font-semibold text-lg mb-2">Gracias por tu interés</h3>
                      <p className="text-muted-foreground text-sm mb-4">
                        Te hemos enviado un email con información sobre cómo acceder a RepIndex desde tu email corporativo.
                      </p>
                      <p className="text-xs text-muted-foreground mb-4">
                        Para ofrecerte informes personalizados, necesitamos que accedas desde el email de tu empresa.
                      </p>
                    </>
                  )
                ) : (
                  <>
                    <h3 className="font-semibold text-lg mb-2">Entendido</h3>
                    <p className="text-muted-foreground text-sm mb-4">
                      Si cambias de opinión, puedes volver a intentarlo o contactar con tu administrador.
                    </p>
                  </>
                )}
                <Button
                  variant="outline"
                  onClick={() => {
                    setLeadSaveResult(null);
                    setLoginState('idle');
                    setEmail('');
                    setConsentGiven(false);
                  }}
                >
                  Volver al inicio
                </Button>
              </div>
            ) : loginState === 'not_registered' ? (
              <div className="text-center py-6">
                <div className="mx-auto w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-4">
                  <UserPlus className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Email no registrado</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Tu correo <span className="font-medium text-foreground">{email}</span> no está en la base de datos de RepIndex.
                </p>
                <div className="bg-muted/50 rounded-lg p-4 mb-4 text-left">
                  <p className="text-sm font-medium mb-3">
                    ¿Nos autorizas a contactar contigo para darte acceso?
                  </p>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="consent"
                      checked={consentGiven}
                      onCheckedChange={(checked) => setConsentGiven(checked === true)}
                      className="mt-0.5"
                    />
                    <label htmlFor="consent" className="text-xs text-muted-foreground cursor-pointer">
                      Autorizo a RepIndex a contactarme por email para informarme sobre el acceso a la plataforma y sus servicios.
                    </label>
                  </div>
                </div>
                <div className="flex gap-2 justify-center">
                  <Button
                    onClick={() => saveLead(true)}
                    disabled={!consentGiven || savingLead}
                    className="flex-1"
                  >
                    {savingLead ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-2" />
                    )}
                    Sí, contactadme
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => saveLead(false)}
                    disabled={savingLead}
                    className="flex-1"
                  >
                    No, gracias
                  </Button>
                </div>
                {errorMessage && (
                  <div className="flex items-center gap-2 text-destructive text-sm mt-3 bg-destructive/10 p-2 rounded">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}
                <button
                  onClick={() => {
                    setLoginState('idle');
                    setConsentGiven(false);
                    setErrorMessage('');
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground mt-4 underline"
                >
                  Probar con otro email
                </button>
              </div>
            ) : loginState === 'sent' ? (
              <div className="text-center py-6">
                <div className="mx-auto w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="font-semibold text-lg mb-2">¡Enlace enviado!</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Revisa tu correo <span className="font-medium text-foreground">{email}</span> y haz clic en el enlace para acceder.
                </p>
                <p className="text-xs text-muted-foreground">
                  ¿No lo recibes? Revisa tu carpeta de spam o{' '}
                  <button
                    onClick={() => {
                      setLoginState('idle');
                      setEmail('');
                    }}
                    className="text-primary hover:underline"
                  >
                    solicita otro enlace
                  </button>
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="tu@email.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (loginState === 'error') {
                          setLoginState('idle');
                          setErrorMessage('');
                        }
                      }}
                      className="pl-10"
                      disabled={loginState === 'sending'}
                      autoFocus
                    />
                  </div>
                  {loginState === 'error' && errorMessage && (
                    <div className="flex items-center gap-2 text-destructive text-sm">
                      <AlertCircle className="h-4 w-4" />
                      <span>{errorMessage}</span>
                    </div>
                  )}
                </div>

                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={loginState === 'sending'}
                >
                  {loginState === 'sending' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    'Solicitar enlace de acceso'
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Footer note */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          El acceso a RepIndex está limitado a usuarios registrados.
          <br />
          Si no tienes cuenta, contacta con tu administrador.
        </p>
      </div>
    </div>
  );
};

export default Login;
