import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Sparkles, 
  Loader2, 
  Copy, 
  RotateCcw, 
  Building2,
  Target,
  FileText,
  Database,
  Users,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompanies } from '@/hooks/useCompanies';
import { useToast } from '@/hooks/use-toast';
import { MarkdownMessage } from '@/components/ui/markdown-message';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Metadata {
  company: string;
  ticker: string | null;
  vectorDocsUsed: number;
  rixRecordsUsed: number;
  competitorsFound: string[];
  sectorCategory: string | null;
}

type TargetProfile = 'ceo' | 'cmo' | 'dircom' | 'compliance';

const PROFILE_CONFIG: Record<TargetProfile, { label: string; description: string; icon: string }> = {
  ceo: { label: 'CEO', description: 'Director General - Visión estratégica y ROI', icon: '👔' },
  cmo: { label: 'CMO', description: 'Director de Marketing - Marca y posicionamiento', icon: '📊' },
  dircom: { label: 'DirCom', description: 'Director de Comunicación - Narrativa y crisis', icon: '📰' },
  compliance: { label: 'Compliance', description: 'Officer de Cumplimiento - ESG y gobernanza', icon: '⚖️' },
};

export const SalesIntelligencePanel: React.FC = () => {
  const { toast } = useToast();
  const { data: companies } = useCompanies();
  
  const [companyInput, setCompanyInput] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<TargetProfile>('ceo');
  const [customContext, setCustomContext] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Autocomplete suggestions
  const suggestions = useMemo(() => {
    if (!companyInput || companyInput.length < 2 || !companies) return [];
    const query = companyInput.toLowerCase();
    return companies
      .filter(c => 
        c.issuer_name.toLowerCase().includes(query) || 
        c.ticker?.toLowerCase().includes(query)
      )
      .slice(0, 8);
  }, [companyInput, companies]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const handleSubmit = async (followUpMessage?: string) => {
    const messageContent = followUpMessage || `Genera propuesta comercial para ${companyInput} dirigida a ${PROFILE_CONFIG[selectedProfile].label}`;
    
    if (!companyInput && !followUpMessage) {
      toast({ title: 'Error', description: 'Introduce el nombre de una empresa', variant: 'destructive' });
      return;
    }

    const userMessage: Message = { role: 'user', content: messageContent };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setStreamingContent('');

    try {
      const response = await fetch(
        `https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/sales-intelligence-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`,
          },
          body: JSON.stringify({
            company_name: companyInput,
            target_profile: selectedProfile,
            custom_context: customContext,
            conversation_history: messages,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                if (data.type === 'start' && data.metadata) {
                  setMetadata(data.metadata);
                } else if (data.type === 'chunk' && data.text) {
                  fullContent += data.text;
                  setStreamingContent(fullContent);
                } else if (data.type === 'done') {
                  // Streaming complete
                }
              } catch (e) {
                // Skip malformed JSON
              }
            }
          }
        }
      }

      // Add assistant message
      if (fullContent) {
        setMessages(prev => [...prev, { role: 'assistant', content: fullContent }]);
        setStreamingContent('');
      }

    } catch (error: any) {
      console.error('[SalesIntelligence] Error:', error);
      toast({ 
        title: 'Error', 
        description: error.message || 'No se pudo generar la propuesta', 
        variant: 'destructive' 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFollowUp = (action: string) => {
    handleSubmit(action);
  };

  const copyAsMarkdown = () => {
    const lastAssistant = messages.filter(m => m.role === 'assistant').pop();
    if (lastAssistant) {
      navigator.clipboard.writeText(lastAssistant.content);
      toast({ title: 'Copiado', description: 'Contenido copiado como Markdown' });
    }
  };

  const copyAsHtml = () => {
    const lastAssistant = messages.filter(m => m.role === 'assistant').pop();
    if (lastAssistant) {
      // Simple markdown to HTML conversion for executive format
      const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; color: #1a1a1a; }
    h1 { color: #6366f1; border-bottom: 2px solid #6366f1; padding-bottom: 10px; }
    h2 { color: #4f46e5; margin-top: 30px; }
    h3 { color: #7c3aed; }
    ul { padding-left: 20px; }
    li { margin: 8px 0; }
    strong { color: #3730a3; }
    blockquote { border-left: 4px solid #6366f1; padding-left: 16px; margin: 20px 0; background: #f5f3ff; padding: 16px; border-radius: 0 8px 8px 0; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #e5e7eb; padding: 12px; text-align: left; }
    th { background: #6366f1; color: white; }
    tr:nth-child(even) { background: #f9fafb; }
  </style>
</head>
<body>
${lastAssistant.content
  .replace(/^# (.*$)/gim, '<h1>$1</h1>')
  .replace(/^## (.*$)/gim, '<h2>$1</h2>')
  .replace(/^### (.*$)/gim, '<h3>$1</h3>')
  .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  .replace(/\*(.*?)\*/g, '<em>$1</em>')
  .replace(/^- (.*$)/gim, '<li>$1</li>')
  .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
  .replace(/\n\n/g, '</p><p>')
  .replace(/^(?!<[hul])/gm, '<p>')
  .replace(/(?<![>])$/gm, '</p>')}
</body>
</html>`;
      navigator.clipboard.writeText(html);
      toast({ title: 'Copiado', description: 'Contenido copiado como HTML ejecutivo' });
    }
  };

  const resetConversation = () => {
    setMessages([]);
    setMetadata(null);
    setStreamingContent('');
    setCompanyInput('');
    setCustomContext('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-500 to-amber-500 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            Agente Rix Comercial
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Genera propuestas comerciales persuasivas basadas en datos RIX reales
          </p>
        </div>
        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
          Solo Admin
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Configuration */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4" />
              Configuración
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Company Input with Autocomplete */}
            <div className="space-y-2 relative">
              <Label htmlFor="company">Empresa objetivo</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="company"
                  ref={inputRef}
                  value={companyInput}
                  onChange={(e) => {
                    setCompanyInput(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder="Ej: Telefónica, BBVA..."
                  className="pl-9"
                  disabled={isLoading}
                />
              </div>
              
              {/* Autocomplete Dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto">
                  {suggestions.map((company) => (
                    <button
                      key={company.issuer_id}
                      className="w-full px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground flex items-center justify-between"
                      onClick={() => {
                        setCompanyInput(company.issuer_name);
                        setShowSuggestions(false);
                      }}
                    >
                      <span className="font-medium">{company.issuer_name}</span>
                      {company.ticker && (
                        <Badge variant="secondary" className="text-xs">{company.ticker}</Badge>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Target Profile Selector */}
            <div className="space-y-2">
              <Label htmlFor="profile">Destinatario</Label>
              <Select value={selectedProfile} onValueChange={(v) => setSelectedProfile(v as TargetProfile)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PROFILE_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <span>{config.icon}</span>
                        <div>
                          <div className="font-medium">{config.label}</div>
                          <div className="text-xs text-muted-foreground">{config.description}</div>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Custom Context */}
            <div className="space-y-2">
              <Label htmlFor="context">Contexto comercial (opcional)</Label>
              <Textarea
                id="context"
                value={customContext}
                onChange={(e) => setCustomContext(e.target.value)}
                placeholder="Ej: Reunión el jueves, quieren renovar contrato, presupuesto limitado..."
                rows={3}
                disabled={isLoading}
              />
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-2">
              <Button 
                onClick={() => handleSubmit()} 
                disabled={isLoading || !companyInput}
                className="w-full bg-gradient-to-r from-purple-600 to-amber-500 hover:from-purple-700 hover:to-amber-600"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Generando...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generar Propuesta
                  </>
                )}
              </Button>
              
              {messages.length > 0 && (
                <Button variant="outline" onClick={resetConversation} className="w-full">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Nueva Conversación
                </Button>
              )}
            </div>

            {/* Metadata Display */}
            {metadata && (
              <div className="pt-4 border-t space-y-2">
                <Label className="text-xs text-muted-foreground">Fuentes utilizadas</Label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5 p-2 rounded bg-muted/50">
                    <Database className="h-3 w-3 text-purple-500" />
                    <span>{metadata.vectorDocsUsed} docs</span>
                  </div>
                  <div className="flex items-center gap-1.5 p-2 rounded bg-muted/50">
                    <FileText className="h-3 w-3 text-blue-500" />
                    <span>{metadata.rixRecordsUsed} RIX</span>
                  </div>
                  {metadata.competitorsFound?.length > 0 && (
                    <div className="flex items-center gap-1.5 p-2 rounded bg-muted/50 col-span-2">
                      <Users className="h-3 w-3 text-green-500" />
                      <span>{metadata.competitorsFound.length} competidores</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Panel - Chat */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Propuesta Comercial</CardTitle>
              <CardDescription>
                {metadata?.company 
                  ? `${metadata.company} → ${PROFILE_CONFIG[selectedProfile].label}`
                  : 'Selecciona una empresa para comenzar'
                }
              </CardDescription>
            </div>
            {messages.some(m => m.role === 'assistant') && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={copyAsMarkdown}>
                  <Copy className="h-3 w-3 mr-1" />
                  Markdown
                </Button>
                <Button variant="outline" size="sm" onClick={copyAsHtml}>
                  <FileText className="h-3 w-3 mr-1" />
                  HTML
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px] pr-4">
              {messages.length === 0 && !streamingContent && (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <div className="h-16 w-16 rounded-full bg-gradient-to-br from-purple-100 to-amber-100 flex items-center justify-center mb-4">
                    <Sparkles className="h-8 w-8 text-purple-500" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">Agente Rix Comercial</h3>
                  <p className="text-muted-foreground max-w-md">
                    Introduce una empresa y selecciona el perfil del destinatario para generar 
                    una propuesta comercial persuasiva basada en datos RIX reales.
                  </p>
                </div>
              )}

              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`mb-4 ${message.role === 'user' ? 'text-right' : 'text-left'}`}
                >
                  {message.role === 'user' ? (
                    <div className="inline-block max-w-[80%] p-3 rounded-lg bg-primary text-primary-foreground">
                      {message.content}
                    </div>
                  ) : (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <MarkdownMessage content={message.content} />
                    </div>
                  )}
                </div>
              ))}

              {streamingContent && (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <MarkdownMessage content={streamingContent} />
                  <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1" />
                </div>
              )}

              <div ref={messagesEndRef} />
            </ScrollArea>

            {/* Quick Actions */}
            {messages.some(m => m.role === 'assistant') && !isLoading && (
              <div className="mt-4 pt-4 border-t">
                <Label className="text-xs text-muted-foreground mb-2 block">Acciones rápidas</Label>
                <div className="flex flex-wrap gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleFollowUp('Hazlo más agresivo comercialmente, con más urgencia')}
                  >
                    🎯 Más agresivo
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleFollowUp('Reformatea esto como un email ejecutivo de 3 párrafos')}
                  >
                    ✉️ Formato email
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleFollowUp('Añade más datos comparativos con los competidores')}
                  >
                    📊 Más competidores
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleFollowUp('Resume en 3 bullet points clave')}
                  >
                    📝 Resumir
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SalesIntelligencePanel;
