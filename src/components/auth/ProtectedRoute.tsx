import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { isDevOrPreview } from '@/lib/env';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading, profile } = useAuth();
  const location = useLocation();

  // In Preview/development, allow access without authentication
  if (isDevOrPreview()) {
    return <>{children}</>;
  }

  // Show loading spinner while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Verificando acceso...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check if user is active
  if (profile && !profile.is_active) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-md p-8 text-center">
          <h1 className="text-2xl font-bold text-destructive mb-4">Cuenta desactivada</h1>
          <p className="text-muted-foreground mb-6">
            Tu cuenta ha sido desactivada. Contacta con el administrador para más información.
          </p>
          <button
            onClick={() => window.location.href = '/login'}
            className="text-primary hover:underline"
          >
            Volver al inicio de sesión
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
