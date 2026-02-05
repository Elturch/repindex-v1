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
  Star,
  MessageSquare,
  Download,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompanies } from '@/hooks/useCompanies';
import { useToast } from '@/hooks/use-toast';
import { MarkdownMessage } from '@/components/ui/markdown-message';
import pptxgen from 'pptxgenjs';

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

// Star Rating Component
const StarRating = ({ 
  currentRating, 
  onRate 
}: { 
  messageIndex: number; 
  currentRating: number; 
  onRate: (rating: number) => void 
}) => {
  return (
    <div className="flex items-center gap-1 mt-3 pt-3 border-t border-border/50">
      <span className="text-xs text-muted-foreground mr-2">Valorar respuesta:</span>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => onRate(star)}
          className={`p-0.5 transition-all hover:scale-110 ${
            star <= currentRating 
              ? 'text-amber-500' 
              : 'text-gray-300 hover:text-amber-300'
          }`}
        >
          <Star className="h-5 w-5" fill={star <= currentRating ? 'currentColor' : 'none'} />
        </button>
      ))}
      {currentRating > 0 && (
        <span className={`text-xs ml-2 ${currentRating >= 4 ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
          {currentRating >= 4 ? '✓ Se usará en presentación' : `${currentRating}/5`}
        </span>
      )}
    </div>
  );
};

// Extract Rix Questions from response - updated patterns for "Preguntas imposibles"
const extractRixQuestions = (content: string): string[] => {
  // Look for the evidence questions section with new format
  const patterns = [
    /📊\s*\*\*Preguntas que solo puedes hacer con RepIndex:\*\*[\s\S]*?((?:\d\.\s*"[^"]+"\s*→[^"]*)+)/i,
    /Preguntas.*RepIndex[\s\S]*?((?:\d\.\s*"[^"]+"\s*)+)/i,
    /Evidencias para anexar[\s\S]*?((?:\d\.\s*"[^"]+"\s*)+)/i,
    /Preguntas.*Agente Rix[\s\S]*?((?:\d\.\s*"[^"]+"\s*)+)/i,
    /📋[\s\S]*?((?:\d\.\s*"[^"]+"\s*)+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      const questions = match[1].match(/"([^"]+)"/g);
      return questions?.map(q => q.replace(/"/g, '')) || [];
    }
  }
  
  return [];
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
  const [messageRatings, setMessageRatings] = useState<Record<number, number>>({});
  const [rixQuestions, setRixQuestions] = useState<string[]>([]);
  const [followUpInput, setFollowUpInput] = useState('');
  
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

  // Count high-rated responses (4-5 stars)
  const highRatedCount = useMemo(() => {
    return Object.values(messageRatings).filter(r => r >= 4).length;
  }, [messageRatings]);

  // Get high-rated content for presentation mode
  const getHighRatedContent = (): string[] => {
    return messages
      .map((msg, idx) => ({ msg, idx }))
      .filter(({ msg, idx }) => msg.role === 'assistant' && messageRatings[idx] >= 4)
      .map(({ msg }) => msg.content);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Extract Rix questions when messages update
  useEffect(() => {
    const lastAssistant = messages.filter(m => m.role === 'assistant').pop();
    if (lastAssistant) {
      const questions = extractRixQuestions(lastAssistant.content);
      if (questions.length > 0) {
        setRixQuestions(questions);
      }
    }
  }, [messages]);

  const handleSubmit = async (followUpMessage?: string) => {
    const messageContent = followUpMessage || `Analiza ${companyInput} para preparar una propuesta comercial dirigida a ${PROFILE_CONFIG[selectedProfile].label}`;
    
    if (!companyInput && !followUpMessage) {
      toast({ title: 'Error', description: 'Introduce el nombre de una empresa', variant: 'destructive' });
      return;
    }

    const userMessage: Message = { role: 'user', content: messageContent };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setStreamingContent('');

    try {
      // Check if this is a presentation request
      const isPresentationRequest = messageContent.toLowerCase().includes('presentación') || 
                                     messageContent.toLowerCase().includes('powerpoint') ||
                                     messageContent.toLowerCase().includes('crear ppt');
      
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
            conversation_history: [...messages, userMessage], // Include the new user message
            high_rated_content: isPresentationRequest ? getHighRatedContent() : [],
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

  const handleRate = (messageIndex: number, rating: number) => {
    setMessageRatings(prev => ({ ...prev, [messageIndex]: rating }));
    
    if (rating >= 4) {
      toast({ 
        title: '⭐ Respuesta valorada', 
        description: 'Se incluirá en la presentación final' 
      });
    }
  };

  const handleFollowUp = (action: string) => {
    handleSubmit(action);
  };

  // Generate real PPTX using pptxgenjs
  const generatePPTX = async () => {
    if (highRatedCount === 0) {
      toast({ 
        title: 'Sin contenido valorado', 
        description: 'Valora al menos una respuesta con 4-5 estrellas para generar la presentación',
        variant: 'destructive'
      });
      return;
    }

    try {
      const pres = new pptxgen();
      
      // Configure RepIndex theme
      pres.layout = 'LAYOUT_WIDE';
      pres.author = 'RepIndex';
      pres.title = `Propuesta Comercial - ${metadata?.company || 'Empresa'}`;
      pres.subject = 'Análisis de Percepción Algorítmica';
      pres.company = 'RepIndex';
      
      // Colors
      const PURPLE = '7C3AED';
      const DARK_GRAY = '1F2937';
      const LIGHT_GRAY = '6B7280';
      // Slide 1: Cover
      const slide1 = pres.addSlide();
      slide1.addText('RepIndex', { 
        x: 8.5, y: 0.3, w: 1.5, h: 0.5, 
        fontSize: 14, fontFace: 'Inter', color: PURPLE, bold: true 
      });
      slide1.addText(metadata?.company || 'Empresa', { 
        x: 0.5, y: 2, w: 9, h: 1.5, 
        fontSize: 44, fontFace: 'Inter', color: PURPLE, bold: true 
      });
      slide1.addText('Análisis de Percepción Algorítmica', { 
        x: 0.5, y: 3.5, w: 9, h: 0.8, 
        fontSize: 24, fontFace: 'Inter', color: DARK_GRAY 
      });
      slide1.addText(`Dirigido a: ${PROFILE_CONFIG[selectedProfile].label}`, { 
        x: 0.5, y: 4.3, w: 9, h: 0.5, 
        fontSize: 16, fontFace: 'Inter', color: LIGHT_GRAY, italic: true 
      });
      slide1.addText(`${metadata?.sectorCategory || 'Sector'}`, { 
        x: 0.5, y: 4.9, w: 9, h: 0.4, 
        fontSize: 14, fontFace: 'Inter', color: LIGHT_GRAY 
      });
      
      // Get high-rated messages
      const highRatedMessages = messages
        .map((msg, idx) => ({ msg, idx }))
        .filter(({ msg, idx }) => msg.role === 'assistant' && messageRatings[idx] >= 4);
      
      // Add content slides
      highRatedMessages.forEach(({ msg }, i) => {
        const slide = pres.addSlide();
        
        // Header
        slide.addText(`Insight ${i + 1}`, { 
          x: 0.5, y: 0.3, w: 2, h: 0.4, 
          fontSize: 12, fontFace: 'Inter', color: PURPLE, bold: true 
        });
        slide.addShape('rect', { 
          x: 0.5, y: 0.7, w: 9, h: 0.02, 
          fill: { color: PURPLE } 
        });
        
        // Content - clean markdown for slides
        const cleanContent = msg.content
          .replace(/#{1,3}\s*/g, '')
          .replace(/\*\*/g, '')
          .replace(/\*/g, '')
          .replace(/📊.*$/gm, '')
          .replace(/→.*$/gm, '')
          .slice(0, 1500);
        
        slide.addText(cleanContent, {
          x: 0.5, y: 1, w: 9, h: 4.5,
          fontSize: 13, fontFace: 'Inter', color: DARK_GRAY,
          valign: 'top', breakLine: true
        });
        
        // Footer
        slide.addText('RepIndex | Radar Reputacional', { 
          x: 0.5, y: 5.2, w: 4, h: 0.3, 
          fontSize: 9, fontFace: 'Inter', color: LIGHT_GRAY 
        });
      });
      
      // Add Rix Questions slide if we have questions
      if (rixQuestions.length > 0) {
        const questionsSlide = pres.addSlide();
        questionsSlide.addText('Preguntas para el Agente Rix', { 
          x: 0.5, y: 0.3, w: 9, h: 0.6, 
          fontSize: 24, fontFace: 'Inter', color: PURPLE, bold: true 
        });
        questionsSlide.addText('Evidencias para anexar a la propuesta', { 
          x: 0.5, y: 0.9, w: 9, h: 0.4, 
          fontSize: 14, fontFace: 'Inter', color: LIGHT_GRAY, italic: true 
        });
        
        rixQuestions.forEach((q, i) => {
          questionsSlide.addText(`${i + 1}. "${q}"`, { 
            x: 0.5, y: 1.5 + (i * 0.9), w: 9, h: 0.8, 
            fontSize: 14, fontFace: 'Inter', color: DARK_GRAY,
            bullet: false
          });
        });
      }
      
      // CTA Slide
      const ctaSlide = pres.addSlide();
      ctaSlide.addShape('rect', { 
        x: 1.5, y: 2, w: 7, h: 2, 
        fill: { color: PURPLE },
        rectRadius: 0.2
      });
      ctaSlide.addText('Siguiente paso', { 
        x: 1.5, y: 2.2, w: 7, h: 0.6, 
        fontSize: 18, fontFace: 'Inter', color: 'FFFFFF', align: 'center' 
      });
      ctaSlide.addText('Demo personalizada', { 
        x: 1.5, y: 2.8, w: 7, h: 0.8, 
        fontSize: 28, fontFace: 'Inter', color: 'FFFFFF', align: 'center', bold: true 
      });
      ctaSlide.addText('www.repindex.ai', { 
        x: 1.5, y: 4.5, w: 7, h: 0.5, 
        fontSize: 16, fontFace: 'Inter', color: PURPLE, align: 'center' 
      });
      
      // Download
      await pres.writeFile({ fileName: `RepIndex_${metadata?.company || 'Propuesta'}_${new Date().toISOString().slice(0,10)}.pptx` });
      
      toast({ 
        title: '✅ PPTX generado', 
        description: `Presentación con ${highRatedMessages.length} slides descargada` 
      });
      
    } catch (error) {
      console.error('[PPTX Generation] Error:', error);
      toast({ 
        title: 'Error', 
        description: 'No se pudo generar el archivo PPTX', 
        variant: 'destructive' 
      });
    }
  };


  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copiado', description: 'Texto copiado al portapapeles' });
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
      // RepIndex style HTML with white background, purple accents
      const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { 
      font-family: 'Inter', -apple-system, system-ui, sans-serif; 
      max-width: 900px; 
      margin: 40px auto; 
      padding: 40px; 
      color: #1F2937; 
      background: #FFFFFF;
      line-height: 1.6;
    }
    h1 { 
      color: #7C3AED; 
      font-size: 2.5rem;
      font-weight: 700;
      border-bottom: 3px solid #7C3AED; 
      padding-bottom: 16px; 
      margin-bottom: 32px;
    }
    h2 { 
      color: #7C3AED; 
      font-size: 1.5rem;
      margin-top: 40px; 
      margin-bottom: 16px;
    }
    h3 { 
      color: #4F46E5; 
      font-size: 1.25rem;
    }
    .big-number {
      font-size: 4rem;
      font-weight: 800;
      color: #7C3AED;
      text-align: center;
      margin: 40px 0;
    }
    blockquote { 
      border-left: 4px solid #7C3AED; 
      padding: 20px 24px; 
      margin: 24px 0; 
      background: #F5F3FF; 
      border-radius: 0 12px 12px 0;
      font-style: italic;
      font-size: 1.1rem;
    }
    ul { padding-left: 24px; }
    li { margin: 12px 0; }
    strong { color: #7C3AED; }
    .highlight {
      background: linear-gradient(120deg, #F59E0B20, #F59E0B40);
      padding: 2px 8px;
      border-radius: 4px;
    }
    .cta {
      background: #7C3AED;
      color: white;
      padding: 16px 32px;
      border-radius: 8px;
      display: inline-block;
      margin-top: 32px;
      font-weight: 600;
    }
    .footer {
      margin-top: 48px;
      padding-top: 24px;
      border-top: 1px solid #E5E7EB;
      font-size: 0.875rem;
      color: #6B7280;
    }
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
  .replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>')
  .replace(/\n\n/g, '</p><p>')}
<div class="footer">
  Generado por RepIndex — Radar Reputacional en la Era Algorítmica
</div>
</body>
</html>`;
      navigator.clipboard.writeText(html);
      toast({ title: 'Copiado', description: 'Contenido copiado como HTML ejecutivo (estilo RepIndex)' });
    }
  };

  const resetConversation = () => {
    setMessages([]);
    setMetadata(null);
    setStreamingContent('');
    setCompanyInput('');
    setCustomContext('');
    setMessageRatings({});
    setRixQuestions([]);
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
            Genera narrativas comerciales persuasivas basadas en datos RIX reales
          </p>
        </div>
        <div className="flex items-center gap-2">
          {highRatedCount > 0 && (
            <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200">
              {highRatedCount} respuestas valoradas
            </Badge>
          )}
          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
            Solo Admin
          </Badge>
        </div>
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
                    Analizando...
                  </>
                ) : (
                  <>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Iniciar Análisis
                  </>
                )}
              </Button>

              {/* Download PPTX Button - Only when there are high-rated responses */}
              {highRatedCount > 0 && !isLoading && (
                <Button 
                  onClick={generatePPTX}
                  className="w-full bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-700 hover:to-purple-900"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Descargar PPTX ({highRatedCount} slides)
                </Button>
              )}
              
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

            {/* Rix Questions for Evidence */}
            {rixQuestions.length > 0 && (
              <div className="pt-4 border-t space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <FileText className="h-3 w-3 text-purple-600" />
                  Preguntas para Agente Rix (evidencias)
                </Label>
                <div className="space-y-2">
                  {rixQuestions.map((q, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 bg-purple-50 rounded border border-purple-200 text-xs">
                      <span className="flex-1">{q}</span>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => copyToClipboard(q)}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Panel - Chat */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Análisis Comercial</CardTitle>
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
                    Introduce una empresa y selecciona el perfil del destinatario. 
                    Valora las respuestas con ⭐ para construir tu presentación.
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
                    <div className="bg-muted/30 rounded-lg p-4">
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <MarkdownMessage content={message.content} />
                      </div>
                      <StarRating 
                        messageIndex={index}
                        currentRating={messageRatings[index] || 0}
                        onRate={(rating) => handleRate(index, rating)}
                      />
                    </div>
                  )}
                </div>
              ))}

              {streamingContent && (
                <div className="bg-muted/30 rounded-lg p-4">
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <MarkdownMessage content={streamingContent} />
                    <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1" />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </ScrollArea>

            {/* Follow-up Input and Quick Actions */}
            {messages.some(m => m.role === 'assistant') && !isLoading && (
              <div className="mt-4 pt-4 border-t space-y-4">
                {/* Free-text follow-up input */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Escribe tu pregunta o indicación</Label>
                  <div className="flex gap-2">
                    <Input
                      value={followUpInput}
                      onChange={(e) => setFollowUpInput(e.target.value)}
                      placeholder="Ej: Profundiza en el tema de controversias ESG..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && followUpInput.trim()) {
                          handleFollowUp(followUpInput);
                          setFollowUpInput('');
                        }
                      }}
                    />
                    <Button 
                      onClick={() => {
                        if (followUpInput.trim()) {
                          handleFollowUp(followUpInput);
                          setFollowUpInput('');
                        }
                      }}
                      disabled={!followUpInput.trim()}
                    >
                      Enviar
                    </Button>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">O elige una acción rápida</Label>
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
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SalesIntelligencePanel;
