import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isTranslationError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    isTranslationError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    // Check if this is likely a translation-related DOM manipulation error
    const isTranslationError = 
      error.message?.includes('removeChild') ||
      error.message?.includes('insertBefore') ||
      error.message?.includes('appendChild') ||
      error.message?.includes('replaceChild') ||
      error.name === 'NotFoundError' ||
      error.message?.includes('not a child of this node');

    return { 
      hasError: true, 
      error,
      isTranslationError,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    
    if (this.state.isTranslationError) {
      console.warn(
        "This error may have been caused by browser translation features manipulating the DOM. " +
        "Consider disabling automatic translation for this page."
      );
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null, isTranslationError: false });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
            </div>
            
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">
                Algo salió mal
              </h1>
              
              {this.state.isTranslationError ? (
                <div className="space-y-3">
                  <p className="text-muted-foreground">
                    Este error puede haber sido causado por la <strong>traducción automática del navegador</strong>.
                  </p>
                  <div className="bg-muted/50 rounded-lg p-4 text-sm text-left space-y-2">
                    <p className="font-medium">Para evitar este problema:</p>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li>Desactiva la traducción automática para esta página</li>
                      <li>O añade este sitio a la lista de excepciones de traducción</li>
                    </ul>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">
                  Ha ocurrido un error inesperado. Por favor, recarga la página para continuar.
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={this.handleReload} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Recargar página
              </Button>
              <Button variant="outline" onClick={this.handleReset}>
                Intentar continuar
              </Button>
            </div>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-6 text-left">
                <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                  Detalles técnicos
                </summary>
                <pre className="mt-2 p-3 bg-muted rounded-lg text-xs overflow-auto max-h-40">
                  {this.state.error.message}
                  {'\n\n'}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
