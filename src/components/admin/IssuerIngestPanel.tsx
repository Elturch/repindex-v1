import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Plus, 
  Loader2, 
  CheckCircle, 
  XCircle, 
  Building2,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Eye
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface CompanyInput {
  name: string;
  cotiza_en_bolsa: boolean;
  ticker: string;
}

interface GeneratedIssuer {
  issuer_id: string;
  issuer_name: string;
  ticker: string;
  include_terms: string[];
  exclude_terms: string[];
  sample_query: string;
  sector_category: string;
  ibex_family_code: string;
  ibex_family_category: string;
  geography: string[];
  languages: string[];
  fase: number;
  is_new_phase: boolean;
}

interface IngestResult {
  success: boolean;
  mode: 'preview' | 'confirm';
  processed: number;
  errors: number;
  results: GeneratedIssuer[];
  errorDetails: { company: string; error: string }[];
  newPhasesCreated: number[];
  phaseSummary: { fase: number; count: number }[];
}

export const IssuerIngestPanel: React.FC = () => {
  const { toast } = useToast();
  const [companies, setCompanies] = useState<CompanyInput[]>([]);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyTicker, setNewCompanyTicker] = useState('');
  const [newCompanyCotiza, setNewCompanyCotiza] = useState(true);
  const [bulkInput, setBulkInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<IngestResult | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Add single company
  const handleAddCompany = () => {
    if (!newCompanyName.trim()) return;

    const company: CompanyInput = {
      name: newCompanyName.trim(),
      cotiza_en_bolsa: newCompanyCotiza,
      ticker: newCompanyCotiza ? newCompanyTicker.trim() || '' : ''
    };

    setCompanies(prev => [...prev, company]);
    setNewCompanyName('');
    setNewCompanyTicker('');
    setNewCompanyCotiza(true);
    setPreviewResult(null);
  };

  // Parse bulk input
  const handleParseBulk = () => {
    if (!bulkInput.trim()) return;

    const lines = bulkInput.split('\n').filter(l => l.trim());
    const parsed: CompanyInput[] = [];

    for (const line of lines) {
      // Format: "Nombre de empresa" or "Nombre de empresa (TICKER.MC)" or "Nombre de empresa (no cotiza)"
      const match = line.match(/^(.+?)(?:\s*\(([^)]+)\))?$/);
      if (match) {
        const name = match[1].trim();
        const tickerOrNote = match[2]?.trim() || '';
        
        const noCotiza = tickerOrNote.toLowerCase().includes('no cotiza') || 
                         tickerOrNote.toLowerCase() === 'no';
        
        parsed.push({
          name,
          cotiza_en_bolsa: !noCotiza,
          ticker: noCotiza ? '' : tickerOrNote
        });
      }
    }

    if (parsed.length > 0) {
      setCompanies(prev => [...prev, ...parsed]);
      setBulkInput('');
      setPreviewResult(null);
      toast({
        title: `${parsed.length} empresas añadidas`,
        description: 'Revisa la lista y genera preview con IA'
      });
    }
  };

  // Remove company from list
  const handleRemoveCompany = (index: number) => {
    setCompanies(prev => prev.filter((_, i) => i !== index));
    setPreviewResult(null);
  };

  // Generate preview using AI
  const handleGeneratePreview = async () => {
    if (companies.length === 0) {
      toast({ title: 'Añade al menos una empresa', variant: 'destructive' });
      return;
    }

    setLoading(true);
    setPreviewResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('ingest-new-issuer', {
        body: { companies, mode: 'preview' }
      });

      if (error) throw error;

      setPreviewResult(data);
      
      if (data.errors > 0) {
        toast({
          title: `Preview generado con ${data.errors} error(es)`,
          description: 'Revisa los detalles antes de confirmar',
          variant: 'destructive'
        });
      } else {
        toast({
          title: `Preview generado para ${data.processed} empresa(s)`,
          description: data.newPhasesCreated.length > 0 
            ? `Se crearán ${data.newPhasesCreated.length} nueva(s) fase(s)` 
            : 'Todas las empresas caben en fases existentes'
        });
      }
    } catch (error) {
      console.error('Preview error:', error);
      toast({
        title: 'Error generando preview',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Confirm and insert
  const handleConfirmInsert = async () => {
    if (!previewResult || previewResult.results.length === 0) {
      toast({ title: 'Genera un preview primero', variant: 'destructive' });
      return;
    }

    setConfirming(true);

    try {
      const { data, error } = await supabase.functions.invoke('ingest-new-issuer', {
        body: { companies, mode: 'confirm' }
      });

      if (error) throw error;

      toast({
        title: `✅ ${data.processed} empresa(s) insertada(s)`,
        description: data.newPhasesCreated.length > 0 
          ? `Se crearon CRONs para fase(s): ${data.newPhasesCreated.join(', ')}` 
          : 'Todas las empresas asignadas a fases existentes'
      });

      // Reset state
      setCompanies([]);
      setPreviewResult(null);

    } catch (error) {
      console.error('Confirm error:', error);
      toast({
        title: 'Error insertando empresas',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Ingesta de Nuevas Empresas
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Añade empresas al sistema RIX con generación automática de metadatos por IA
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Input */}
        <div className="space-y-4">
          {/* Single company input */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Añadir Empresa Individual</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="company_name">Nombre de la empresa</Label>
                <Input
                  id="company_name"
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  placeholder="Ej: El Corte Inglés"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCompany()}
                />
              </div>
              
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="cotiza"
                    checked={newCompanyCotiza}
                    onCheckedChange={setNewCompanyCotiza}
                  />
                  <Label htmlFor="cotiza">Cotiza en bolsa</Label>
                </div>
                
                {newCompanyCotiza && (
                  <div className="flex-1">
                    <Input
                      value={newCompanyTicker}
                      onChange={(e) => setNewCompanyTicker(e.target.value.toUpperCase())}
                      placeholder="Ticker (ej: VIS.MC)"
                      className="max-w-[150px]"
                    />
                  </div>
                )}
              </div>

              <Button onClick={handleAddCompany} disabled={!newCompanyName.trim()}>
                <Plus className="h-4 w-4 mr-2" />
                Añadir a la Lista
              </Button>
            </CardContent>
          </Card>

          {/* Bulk input */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Entrada Masiva</CardTitle>
              <CardDescription className="text-xs">
                Una empresa por línea. Formato: "Nombre" o "Nombre (TICKER.MC)" o "Nombre (no cotiza)"
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                placeholder={`El Corte Inglés (no cotiza)\nViscofan (VIS.MC)\nCoca-Cola Europacific Partners (CCEP)\nTelepizza (no cotiza)\nDia (DIA.MC)`}
                rows={5}
                className="font-mono text-sm"
              />
              <Button 
                variant="outline" 
                onClick={handleParseBulk}
                disabled={!bulkInput.trim()}
              >
                Parsear y Añadir
              </Button>
            </CardContent>
          </Card>

          {/* Companies list */}
          {companies.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    Lista de Empresas ({companies.length})
                  </CardTitle>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => { setCompanies([]); setPreviewResult(null); }}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Limpiar
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[200px]">
                  <div className="space-y-2">
                    {companies.map((company, idx) => (
                      <div 
                        key={idx} 
                        className="flex items-center justify-between p-2 rounded border bg-muted/30"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{company.name}</span>
                          {company.cotiza_en_bolsa ? (
                            <Badge variant="outline" className="text-xs">
                              {company.ticker || 'Por determinar'}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              No cotiza
                            </Badge>
                          )}
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleRemoveCompany(idx)}
                        >
                          <XCircle className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                <div className="mt-4 pt-4 border-t">
                  <Button 
                    onClick={handleGeneratePreview} 
                    disabled={loading || companies.length === 0}
                    className="w-full"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Generando con IA...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Generar Preview con IA
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Preview Results */}
        <div className="space-y-4">
          {previewResult ? (
            <>
              {/* Summary */}
              <Card className={previewResult.errors > 0 ? 'border-amber-500' : 'border-green-500'}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Preview de Ingesta
                  </CardTitle>
                  <CardDescription>
                    {previewResult.processed} empresa(s) procesada(s)
                    {previewResult.newPhasesCreated.length > 0 && (
                      <span className="text-amber-600 ml-2">
                        • {previewResult.newPhasesCreated.length} nueva(s) fase(s)
                      </span>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-2 rounded bg-green-100 dark:bg-green-900/30">
                      <p className="text-xl font-bold text-green-600">{previewResult.processed}</p>
                      <p className="text-xs text-muted-foreground">Procesadas</p>
                    </div>
                    <div className="text-center p-2 rounded bg-red-100 dark:bg-red-900/30">
                      <p className="text-xl font-bold text-red-600">{previewResult.errors}</p>
                      <p className="text-xs text-muted-foreground">Errores</p>
                    </div>
                    <div className="text-center p-2 rounded bg-amber-100 dark:bg-amber-900/30">
                      <p className="text-xl font-bold text-amber-600">
                        {previewResult.newPhasesCreated.length}
                      </p>
                      <p className="text-xs text-muted-foreground">Nuevas fases</p>
                    </div>
                  </div>

                  {/* New phases warning */}
                  {previewResult.newPhasesCreated.length > 0 && (
                    <div className="p-3 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                            Se crearán nuevas fases
                          </p>
                          <p className="text-xs text-amber-700 dark:text-amber-400">
                            Fases: {previewResult.newPhasesCreated.join(', ')}. 
                            Se crearán automáticamente los CRONs correspondientes.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Errors */}
              {previewResult.errorDetails.length > 0 && (
                <Card className="border-red-300">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-red-600 flex items-center gap-2">
                      <XCircle className="h-4 w-4" />
                      Errores ({previewResult.errorDetails.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {previewResult.errorDetails.map((err, idx) => (
                        <div key={idx} className="p-2 rounded bg-red-50 dark:bg-red-900/20 text-sm">
                          <span className="font-medium">{err.company}:</span>{' '}
                          <span className="text-red-600">{err.error}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Results table */}
              {previewResult.results.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Datos Generados por IA</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[350px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Empresa</TableHead>
                            <TableHead>Ticker</TableHead>
                            <TableHead>Sector</TableHead>
                            <TableHead>IBEX</TableHead>
                            <TableHead>Fase</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {previewResult.results.map((issuer, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">
                                <div>
                                  <p className="text-sm">{issuer.issuer_name}</p>
                                  <p className="text-xs text-muted-foreground">{issuer.issuer_id}</p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{issuer.ticker}</Badge>
                              </TableCell>
                              <TableCell className="text-xs">{issuer.sector_category}</TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="text-xs">
                                  {issuer.ibex_family_code}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge 
                                  variant={issuer.is_new_phase ? 'destructive' : 'default'}
                                  className="text-xs"
                                >
                                  {issuer.fase}
                                  {issuer.is_new_phase && ' (nueva)'}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>

                    {/* Confirm button */}
                    <div className="mt-4 pt-4 border-t flex gap-2">
                      <Button 
                        variant="outline"
                        onClick={() => setPreviewResult(null)}
                        className="flex-1"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Regenerar Preview
                      </Button>
                      <Button 
                        onClick={handleConfirmInsert}
                        disabled={confirming || previewResult.results.length === 0}
                        className="flex-1"
                      >
                        {confirming ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Insertando...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Confirmar Inserción
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Sparkles className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
                <h3 className="text-lg font-medium mb-2">Sin Preview</h3>
                <p className="text-muted-foreground text-center max-w-md mb-4 text-sm">
                  Añade empresas a la lista y haz clic en "Generar Preview con IA" para ver 
                  los metadatos generados automáticamente antes de insertar.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
