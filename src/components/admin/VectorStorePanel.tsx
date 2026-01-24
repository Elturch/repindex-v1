import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useVectorStoreStatusV2, SourceStatus } from '@/hooks/useVectorStoreStatusV2';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Database, 
  RefreshCw, 
  Play, 
  Loader2, 
  CheckCircle, 
  AlertCircle,
  FileText,
  Sparkles,
  Newspaper
} from 'lucide-react';

interface SourceCardProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  status: SourceStatus;
  accentColor: string;
}

const SourceCard: React.FC<SourceCardProps> = ({ 
  title, 
  subtitle, 
  icon, 
  status, 
  accentColor 
}) => {
  const isComplete = status.pending === 0;
  
  return (
    <div className={`p-4 rounded-lg border ${isComplete ? 'bg-muted/30' : 'bg-muted/50 border-dashed'}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-1.5 rounded ${accentColor}`}>
          {icon}
        </div>
        <div>
          <h4 className="font-medium text-sm">{title}</h4>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      
      <Progress 
        value={status.progress} 
        className="h-2 mb-2"
      />
      
      <div className="flex justify-between items-center text-xs">
        <span className="text-muted-foreground">
          {status.indexed.toLocaleString()}/{status.total.toLocaleString()}
        </span>
        <Badge 
          variant={isComplete ? 'default' : 'secondary'} 
          className="text-[10px] h-5"
        >
          {isComplete ? '✓ Completo' : `${status.pending} pendientes`}
        </Badge>
      </div>
    </div>
  );
};

export const VectorStorePanel: React.FC = () => {
  const { toast } = useToast();
  const { status, refresh } = useVectorStoreStatusV2();
  
  // Processing state
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<{
    success: boolean;
    complete?: boolean;
    message?: string;
    error?: string;
  } | null>(null);
  const autoRunningRef = useRef(false);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const handleRunVectorStore = async () => {
    setIsRunning(true);
    autoRunningRef.current = true;
    setResult(null);
    setLogs([]);
    
    addLog('🚀 Iniciando sincronización incremental (V1 + V2 + Noticias)...');
    
    let continueProcessing = true;
    let batchNumber = 0;
    
    while (continueProcessing && autoRunningRef.current) {
      batchNumber++;
      addLog(`📦 Batch ${batchNumber}: procesando...`);
      
      try {
        const { data, error } = await supabase.functions.invoke('populate-vector-store', {
          body: { includeRawResponses: true },
        });
        
        if (error) throw error;
        
        if (data) {
          // Refresh status after each batch
          await refresh();
          
          addLog(`✓ Batch ${batchNumber}: ${data.processed || 0} creados, ${data.errored || 0} errores, ${data.remaining || 0} pendientes (${data.elapsed_seconds}s)`);
          
          // Log per-source progress if available
          if (data.v2_processed !== undefined) {
            addLog(`   ↳ V2: ${data.v2_processed || 0} | News: ${data.news_processed || 0}`);
          }
          
          if (data.complete || data.remaining === 0) {
            continueProcessing = false;
            addLog(`✅ ¡Proceso completado!`);
            setResult({ success: true, complete: true, message: `Sincronización completa` });
            toast({
              title: 'Vector Store completado',
              description: 'Todas las fuentes sincronizadas correctamente',
            });
          } else {
            // Brief pause before next batch
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      } catch (error: any) {
        console.error('Error in batch:', error);
        addLog(`❌ Error en batch ${batchNumber}: ${error.message}`);
        
        // Retry after longer pause
        if (batchNumber < 20) {
          addLog('⏳ Reintentando en 5 segundos...');
          await new Promise(resolve => setTimeout(resolve, 5000));
        } else {
          continueProcessing = false;
          setResult({ success: false, error: error.message });
          toast({
            title: 'Error',
            description: 'Proceso detenido tras múltiples errores',
            variant: 'destructive',
          });
        }
      }
    }
    
    setIsRunning(false);
    autoRunningRef.current = false;
  };

  const handleStop = () => {
    autoRunningRef.current = false;
    addLog('⏸️ Proceso pausado por usuario');
    toast({ title: 'Pausado', description: 'El proceso se detendrá tras el batch actual' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Vector Store - Base de Conocimiento
        </CardTitle>
        <CardDescription>
          Sincroniza incrementalmente las tres fuentes de datos del Agente Rix.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Three source cards in grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SourceCard
            title="RIX V1"
            subtitle="Make.com (Legacy)"
            icon={<FileText className="h-4 w-4 text-blue-600" />}
            status={status.rixV1}
            accentColor="bg-blue-100 dark:bg-blue-900/30"
          />
          <SourceCard
            title="RIX V2"
            subtitle="7 IAs (Lovable)"
            icon={<Sparkles className="h-4 w-4 text-purple-600" />}
            status={status.rixV2}
            accentColor="bg-purple-100 dark:bg-purple-900/30"
          />
          <SourceCard
            title="Noticias Corp."
            subtitle="Corporate News"
            icon={<Newspaper className="h-4 w-4 text-emerald-600" />}
            status={status.corporateNews}
            accentColor="bg-emerald-100 dark:bg-emerald-900/30"
          />
        </div>

        {/* Overall progress */}
        <div className="p-4 rounded-lg border bg-muted/30">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium">Progreso Total</span>
            <div className="flex items-center gap-2">
              <Badge variant={status.totalPending > 0 ? 'secondary' : 'default'}>
                {status.totalPending > 0 ? `${status.totalPending.toLocaleString()} pendientes` : 'Sincronizado'}
              </Badge>
              {status.lastChecked && (
                <span className="text-xs text-muted-foreground">
                  Actualizado: {status.lastChecked.toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
          <Progress value={status.overallProgress} className="h-3 mb-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{status.totalIndexed.toLocaleString()} documentos indexados</span>
            <span>{status.totalRecords.toLocaleString()} registros totales</span>
            <span className="font-medium">{status.overallProgress}%</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-4">
          <Button
            onClick={handleRunVectorStore}
            disabled={isRunning || status.isLoading}
            className="gap-2"
          >
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sincronizando...
              </>
            ) : status.totalPending > 0 ? (
              <>
                <RefreshCw className="h-4 w-4" />
                Sincronizar ({status.totalPending.toLocaleString()} pendientes)
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Verificar sincronización
              </>
            )}
          </Button>
          
          {isRunning && (
            <Button variant="outline" onClick={handleStop} size="sm">
              Pausar
            </Button>
          )}
          
          <Button variant="ghost" size="sm" onClick={refresh} disabled={status.isLoading}>
            <RefreshCw className={`h-4 w-4 ${status.isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Processing indicator */}
        {isRunning && (
          <div className="space-y-3 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                <span className="font-medium text-blue-700 dark:text-blue-300">
                  Auto-sincronización en curso
                </span>
              </div>
              <span className="text-2xl font-bold text-blue-600">{status.overallProgress}%</span>
            </div>
            <Progress value={status.overallProgress} className="h-3" />
          </div>
        )}

        {/* Result */}
        {result && !isRunning && (
          <div className={`p-4 rounded-lg border ${result.success ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'}`}>
            <div className="flex items-center gap-2 mb-2">
              {result.success ? (
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              )}
              <span className="font-medium">
                {result.success 
                  ? (result.complete ? '✅ Sincronización completada' : 'Progreso guardado')
                  : 'Error en el proceso'}
              </span>
            </div>
            {result.message && (
              <p className="text-sm text-green-600 dark:text-green-400">{result.message}</p>
            )}
            {result.error && (
              <p className="text-sm text-red-600 dark:text-red-400">{result.error}</p>
            )}
          </div>
        )}

        {/* Logs */}
        {logs.length > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label>Logs de procesamiento</Label>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setLogs([])}
                className="h-6 text-xs"
              >
                Limpiar
              </Button>
            </div>
            <ScrollArea className="h-48 rounded-md border bg-muted/30 p-3">
              <div className="space-y-1 font-mono text-xs">
                {logs.map((log, i) => (
                  <div key={i} className={log.includes('❌') ? 'text-red-500' : log.includes('✅') ? 'text-green-500' : log.includes('⏳') ? 'text-amber-500' : ''}>
                    {log}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Info */}
        <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
          <p className="font-medium mb-1">ℹ️ Fuentes de datos</p>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>RIX V1:</strong> Análisis históricos (Make.com) - 2 modelos</li>
            <li><strong>RIX V2:</strong> Análisis nuevos (Lovable) - 7 IAs</li>
            <li><strong>Noticias Corp:</strong> Artículos de blogs corporativos</li>
            <li>Solo añade nuevos documentos (nunca borra existentes)</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};
