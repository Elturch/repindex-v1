import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, Loader2, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

type LoginState = 'idle' | 'sending' | 'sent' | 'error';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loginState, setLoginState] = useState<LoginState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const { sendMagicLink, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect if already authenticated
  useEffect(() => {
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

    const { error } = await sendMagicLink(email.trim().toLowerCase());

    if (error) {
      setErrorMessage(error);
      setLoginState('error');
    } else {
      setLoginState('sent');
    }
  };

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
              Introduce tu email para recibir un enlace de acceso
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loginState === 'sent' ? (
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
