import React, { useState, useEffect } from 'react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  Eye,
  ChevronDown,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Info
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Constants for dropdowns
const SECTOR_CATEGORIES = [
  'Banca y Servicios Financieros',
  'Construcción e Infraestructuras',
  'Energía y Gas',
  'Hoteles y Turismo',
  'Materias Primas y Siderurgia',
  'Moda y Distribución',
  'Salud y Farmacéutico',
  'Telecomunicaciones y Tecnología',
  'Otros Sectores'
];

const IBEX_FAMILY_OPTIONS = [
  { code: 'IBEX-35', name: 'IBEX 35' },
  { code: 'IBEX-MC', name: 'IBEX Medium Cap' },
  { code: 'IBEX-SC', name: 'IBEX Small Cap' },
  { code: 'BME-GROWTH', name: 'BME Growth' },
  { code: 'MC-OTHER', name: 'Mercado Continuo (otros)' },
  { code: 'NO-COTIZA', name: 'No cotiza en bolsa' }
];

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
  confidence: 'high' | 'medium' | 'low';
  verification_notes: string;
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

// Confidence badge component
const ConfidenceBadge: React.FC<{ confidence: 'high' | 'medium' | 'low' }> = ({ confidence }) => {
  const config = {
    high: { icon: ShieldCheck, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', label: 'Alta' },
    medium: { icon: Shield, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', label: 'Media' },
    low: { icon: ShieldAlert, color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', label: 'Baja' }
  };
  
  const { icon: Icon, color, label } = config[confidence] || config.medium;
  
  return (
    <Badge variant="outline" className={`${color} text-xs gap-1`}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
};

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
  const [editedResults, setEditedResults] = useState<GeneratedIssuer[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Sync editedResults when previewResult changes
  useEffect(() => {
    if (previewResult?.results) {
      setEditedResults([...previewResult.results]);
      setExpandedRows(new Set());
    }
  }, [previewResult]);

  // Handle field edits
  const handleEditField = (index: number, field: keyof GeneratedIssuer, value: any) => {
    setEditedResults(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      
      // Auto-update ibex_family_category when code changes
      if (field === 'ibex_family_code') {
        const option = IBEX_FAMILY_OPTIONS.find(o => o.code === value);
        if (option) {
          updated[index].ibex_family_category = option.name;
        }
      }
      
      return updated;
    });
  };

  // Toggle row expansion
  const toggleRowExpansion = (index: number) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

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
    } catch (error: any) {
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

  // Confirm and insert with edited data
  const handleConfirmInsert = async () => {
    if (editedResults.length === 0) {
      toast({ title: 'No hay datos para insertar', variant: 'destructive' });
      return;
    }

    setConfirming(true);

    try {
      const { data, error } = await supabase.functions.invoke('ingest-new-issuer', {
        body: { 
          companies, 
          mode: 'confirm',
          editedData: editedResults 
        }
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
      setEditedResults([]);

    } catch (error: any) {
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
            Añade empresas al sistema RIX con generación automática de metadatos por IA (Gemini 3 Pro)
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
                        Generando con Gemini 3 Pro...
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
                    Preview de Ingesta (Editable)
                  </CardTitle>
                  <CardDescription>
                    {previewResult.processed} empresa(s) procesada(s) • Puedes editar los campos antes de confirmar
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

              {/* Editable Results */}
              {editedResults.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      Datos Generados por IA
                      <Badge variant="outline" className="text-xs font-normal">Editables</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[450px]">
                      <div className="space-y-3">
                        <TooltipProvider>
                          {editedResults.map((issuer, idx) => (
                            <Collapsible
                              key={idx}
                              open={expandedRows.has(idx)}
                              onOpenChange={() => toggleRowExpansion(idx)}
                            >
                              <div className="border rounded-lg p-3 space-y-3">
                                {/* Main row */}
                                <div className="flex items-start gap-3">
                                  <div className="flex-1 space-y-3">
                                    {/* Row 1: Name, Ticker, Confidence */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <Input
                                        value={issuer.issuer_name}
                                        onChange={(e) => handleEditField(idx, 'issuer_name', e.target.value)}
                                        className="flex-1 min-w-[200px] h-8 text-sm font-medium"
                                      />
                                      <Input
                                        value={issuer.ticker}
                                        onChange={(e) => handleEditField(idx, 'ticker', e.target.value.toUpperCase())}
                                        className="w-[100px] h-8 text-sm font-mono"
                                      />
                                      <ConfidenceBadge confidence={issuer.confidence || 'medium'} />
                                      <Badge 
                                        variant={issuer.is_new_phase ? 'destructive' : 'default'}
                                        className="text-xs"
                                      >
                                        Fase {issuer.fase}
                                        {issuer.is_new_phase && ' (nueva)'}
                                      </Badge>
                                    </div>
                                    
                                    {/* Row 2: Sector and IBEX */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <Select
                                        value={issuer.sector_category}
                                        onValueChange={(value) => handleEditField(idx, 'sector_category', value)}
                                      >
                                        <SelectTrigger className="w-[220px] h-8 text-xs">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {SECTOR_CATEGORIES.map((sector) => (
                                            <SelectItem key={sector} value={sector} className="text-xs">
                                              {sector}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      
                                      <Select
                                        value={issuer.ibex_family_code}
                                        onValueChange={(value) => handleEditField(idx, 'ibex_family_code', value)}
                                      >
                                        <SelectTrigger className="w-[180px] h-8 text-xs">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {IBEX_FAMILY_OPTIONS.map((option) => (
                                            <SelectItem key={option.code} value={option.code} className="text-xs">
                                              {option.name}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>

                                      {issuer.verification_notes && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                              <Info className="h-4 w-4 text-muted-foreground" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent className="max-w-xs">
                                            <p className="text-xs">{issuer.verification_notes}</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      )}
                                    </div>
                                  </div>

                                  <CollapsibleTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                      <ChevronDown className={`h-4 w-4 transition-transform ${expandedRows.has(idx) ? 'rotate-180' : ''}`} />
                                    </Button>
                                  </CollapsibleTrigger>
                                </div>

                                {/* Expanded content: Search terms */}
                                <CollapsibleContent className="space-y-3">
                                  <div className="border-t pt-3 grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                      <Label className="text-xs text-muted-foreground">Términos de inclusión</Label>
                                      <Textarea
                                        value={issuer.include_terms.join(', ')}
                                        onChange={(e) => handleEditField(
                                          idx, 
                                          'include_terms', 
                                          e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                                        )}
                                        rows={2}
                                        className="text-xs font-mono"
                                        placeholder="Término 1, Término 2, ..."
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-xs text-muted-foreground">Términos de exclusión</Label>
                                      <Textarea
                                        value={issuer.exclude_terms.join(', ')}
                                        onChange={(e) => handleEditField(
                                          idx, 
                                          'exclude_terms', 
                                          e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                                        )}
                                        rows={2}
                                        className="text-xs font-mono"
                                        placeholder="Término 1, Término 2, ..."
                                      />
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Query de búsqueda</Label>
                                    <Textarea
                                      value={issuer.sample_query}
                                      onChange={(e) => handleEditField(idx, 'sample_query', e.target.value)}
                                      rows={2}
                                      className="text-xs font-mono"
                                    />
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    <span className="font-medium">ID:</span> {issuer.issuer_id}
                                  </div>
                                </CollapsibleContent>
                              </div>
                            </Collapsible>
                          ))}
                        </TooltipProvider>
                      </div>
                    </ScrollArea>

                    {/* Confirm button */}
                    <div className="mt-4 pt-4 border-t flex gap-2">
                      <Button 
                        variant="outline"
                        onClick={() => { setPreviewResult(null); setEditedResults([]); }}
                        className="flex-1"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Regenerar Preview
                      </Button>
                      <Button 
                        onClick={handleConfirmInsert}
                        disabled={confirming || editedResults.length === 0}
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
                            Confirmar Inserción ({editedResults.length})
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
