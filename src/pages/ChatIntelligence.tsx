import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageCircle, AlertCircle, Building2, CalendarDays, Database, RefreshCw, Download, BarChart3 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCompanies } from "@/hooks/useCompanies";
import { usePariRuns } from "@/hooks/usePariRuns";
import { useIbexFamilyCategories } from "@/hooks/useIbexFamilyCategories";
import { format, addDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Message {
  role: 'user' | 'assistant';
  content: string;
  suggestedQuestions?: string[];
}

export default function ChatIntelligence() {
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [selectedWeek, setSelectedWeek] = useState<string>("all");
  const [selectedIbexFamily, setSelectedIbexFamily] = useState<string>("all");
  const [analysisType, setAnalysisType] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [companySearch, setCompanySearch] = useState("");

  const { data: companies, isLoading: companiesLoading } = useCompanies();
  const { data: pariRuns } = usePariRuns();
  const { data: ibexFamilyCategories, isLoading: ibexLoading } = useIbexFamilyCategories();
  const { toast } = useToast();

  // Filter companies based on search and ibex family
  const filteredCompanies = companies?.filter(company => {
    const matchesSearch = company.issuer_name.toLowerCase().includes(companySearch.toLowerCase()) ||
      company.ticker.toLowerCase().includes(companySearch.toLowerCase());
    const matchesIbexFamily = selectedIbexFamily === "all" || company.ibex_family_code === selectedIbexFamily;
    return matchesSearch && matchesIbexFamily;
  });

  // Generate week options using real period_from dates
  const weekOptions = pariRuns ? Array.from(
    new Set(
      pariRuns
        .filter(run => run["06_period_from"])
        .map(run => format(new Date(run["06_period_from"]!), 'yyyy-MM-dd'))
    )
  )
    .sort()
    .reverse()
    .map(dateStr => {
      const date = new Date(dateStr);
      return {
        value: dateStr,
        label: `${format(date, 'dd/MM/yyyy')} - ${format(addDays(date, 6), 'dd/MM/yyyy')}`
      };
    }) : [];

  const analysisTypes = [
    { value: 'consenso', label: '🤝 Consenso entre IAs', description: '¿En qué coinciden los modelos?' },
    { value: 'discrepancias', label: '⚡ Discrepancias', description: '¿Dónde difieren las IAs?' },
    { value: 'fortalezas', label: '💪 Fortalezas', description: '¿Qué destaca positivamente?' },
    { value: 'debilidades', label: '⚠️ Debilidades', description: '¿Qué necesita mejorar?' },
    { value: 'metricas', label: '📊 Análisis de Métricas', description: 'Comparación de LNS, ES, SAM, etc.' },
    { value: 'profundo', label: '🧠 Análisis Profundo', description: 'Razonamiento avanzado multi-paso (tarda más)' },
  ];

  const handleStartAnalysis = async () => {
    if (!selectedCompany || !analysisType) {
      toast({
        title: "Selección incompleta",
        description: "Por favor selecciona empresa y tipo de análisis",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    const userMessage: Message = {
      role: 'user',
      content: `Análisis: ${analysisTypes.find(t => t.value === analysisType)?.label} para ${selectedCompany}${selectedWeek && selectedWeek !== "all" ? ` (semana ${selectedWeek})` : ''}`,
    };

    setMessages(prev => [...prev, userMessage]);

    try {
      const { data, error } = await supabase.functions.invoke('chat-intelligence', {
        body: {
          company: selectedCompany,
          week: selectedWeek === "all" ? null : selectedWeek,
          analysisType,
          conversationHistory: messages.map(m => ({ role: m.role, content: m.content })),
        },
      });

      if (error) throw error;

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.response,
        suggestedQuestions: data.suggestedQuestions,
      };

      setMessages(prev => [...prev, assistantMessage]);

      toast({
        title: "Análisis completado",
        description: `${data.documentsFound} documentos analizados`,
      });
    } catch (error) {
      console.error('Error in chat intelligence:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error en el análisis",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestedQuestion = async (question: string) => {
    if (!selectedCompany) {
      toast({
        title: "Error",
        description: "No hay empresa seleccionada",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    const userMessage: Message = {
      role: 'user',
      content: question,
    };

    setMessages(prev => [...prev, userMessage]);

    try {
      const { data, error } = await supabase.functions.invoke('chat-intelligence', {
        body: {
          company: selectedCompany,
          week: selectedWeek === "all" ? null : selectedWeek,
          analysisType: analysisType || 'consenso', // Use current analysis type or default
          conversationHistory: [...messages, userMessage].map(m => ({ role: m.role, content: m.content })),
        },
      });

      if (error) throw error;

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.response,
        suggestedQuestions: data.suggestedQuestions,
      };

      setMessages(prev => [...prev, assistantMessage]);

      toast({
        title: "Análisis completado",
        description: `${data.documentsFound} documentos analizados`,
      });
    } catch (error) {
      console.error('Error in follow-up question:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error en el análisis",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInitializeVectorStore = async () => {
    setIsInitializing(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('populate-vector-store', {
        body: { clean: true },
      });

      if (error) throw error;

      toast({
        title: "Base de datos actualizada",
        description: `${data.documents_created} documentos creados con éxito`,
      });
    } catch (error) {
      console.error('Error initializing vector store:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al inicializar",
        variant: "destructive",
      });
    } finally {
      setIsInitializing(false);
    }
  };

  const generateFileName = (extension: string) => {
    const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm');
    const company = selectedCompany ? selectedCompany.replace(/\s+/g, '_') : 'conversacion';
    return `${company}_chat_${timestamp}.${extension}`;
  };

  const downloadAsTxt = () => {
    const metadata = `Chat Inteligente - Repindex.ai\n` +
      `Fecha: ${format(new Date(), 'dd/MM/yyyy HH:mm')}\n` +
      `Empresa: ${selectedCompany || 'No seleccionada'}\n` +
      `Semana: ${selectedWeek === "all" ? "Todas las semanas" : selectedWeek}\n` +
      `Tipo de análisis: ${analysisTypes.find(t => t.value === analysisType)?.label || 'No seleccionado'}\n` +
      `${'='.repeat(70)}\n\n`;

    const conversation = messages.map(msg => {
      const role = msg.role === 'user' ? 'USUARIO' : 'ASISTENTE IA';
      const content = msg.content;
      const questions = msg.suggestedQuestions?.length 
        ? `\n\nPreguntas sugeridas:\n${msg.suggestedQuestions.map(q => `  • ${q}`).join('\n')}`
        : '';
      return `[${role}]\n${content}${questions}\n${'-'.repeat(70)}\n`;
    }).join('\n');

    const blob = new Blob([metadata + conversation], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = generateFileName('txt');
    link.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Conversación exportada",
      description: "Archivo TXT descargado exitosamente",
    });
  };

  const downloadAsJson = () => {
    const exportData = {
      metadata: {
        exportDate: new Date().toISOString(),
        company: selectedCompany,
        week: selectedWeek,
        analysisType: analysisTypes.find(t => t.value === analysisType)?.label,
      },
      messages: messages,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = generateFileName('json');
    link.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Conversación exportada",
      description: "Archivo JSON descargado exitosamente",
    });
  };

  const downloadAsHtml = () => {
    const metadata = `
      <div style="background: #f4f4f4; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
        <h2 style="margin: 0 0 10px 0; color: #333;">Chat Inteligente - Repindex.ai</h2>
        <p style="margin: 5px 0; color: #666;"><strong>Fecha:</strong> ${format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
        <p style="margin: 5px 0; color: #666;"><strong>Empresa:</strong> ${selectedCompany || 'No seleccionada'}</p>
        <p style="margin: 5px 0; color: #666;"><strong>Semana:</strong> ${selectedWeek === "all" ? "Todas las semanas" : selectedWeek}</p>
        <p style="margin: 5px 0; color: #666;"><strong>Tipo de análisis:</strong> ${analysisTypes.find(t => t.value === analysisType)?.label || 'No seleccionado'}</p>
      </div>
    `;

    const conversation = messages.map(msg => {
      const isUser = msg.role === 'user';
      const bgColor = isUser ? '#3b82f6' : '#ffffff';
      const textColor = isUser ? '#ffffff' : '#333333';
      const alignment = isUser ? 'flex-end' : 'flex-start';
      const role = isUser ? 'Usuario' : 'Asistente IA';
      
      const questions = msg.suggestedQuestions?.length
        ? `<div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(0,0,0,0.1);">
            <p style="font-weight: bold; font-size: 12px; margin-bottom: 10px;">Preguntas sugeridas:</p>
            ${msg.suggestedQuestions.map(q => `<p style="font-size: 13px; margin: 5px 0;">• ${q}</p>`).join('')}
           </div>`
        : '';

      return `
        <div style="display: flex; justify-content: ${alignment}; margin-bottom: 20px;">
          <div style="max-width: 80%; background: ${bgColor}; color: ${textColor}; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <p style="font-weight: bold; font-size: 11px; opacity: 0.8; margin-bottom: 8px;">${role}</p>
            <div style="white-space: pre-wrap;">${msg.content.replace(/\n/g, '<br>')}</div>
            ${questions}
          </div>
        </div>
      `;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Conversación - ${selectedCompany || 'Chat'}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 900px; margin: 40px auto; padding: 20px; line-height: 1.6; }
            @media print { body { margin: 20px; } }
          </style>
        </head>
        <body>
          ${metadata}
          ${conversation}
        </body>
      </html>
    `;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = generateFileName('html');
    link.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Conversación exportada",
      description: "Archivo HTML descargado exitosamente",
    });
  };

  return (
    <Layout title="Repindex.ai">
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">
            Chat Inteligente - Comparaciones entre IAs
          </h1>
          <p className="text-sm text-muted-foreground">
            Descubre insights únicos comparando modelos de IA
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">Selección:</span>
            
            {/* Ibex Family Filter */}
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedIbexFamily} onValueChange={setSelectedIbexFamily}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="IBEX Family" />
                </SelectTrigger>
                <SelectContent className="bg-background border z-50">
                  <SelectItem value="all">Todas las familias IBEX</SelectItem>
                  {ibexFamilyCategories?.map((ibex) => (
                    <SelectItem key={ibex.ibex_family_code} value={ibex.ibex_family_code}>
                      {ibex.ibex_family_code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Company Filter */}
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Seleccionar empresa" />
                </SelectTrigger>
                <SelectContent className="bg-background border z-50">
                  <div className="px-2 py-1.5 sticky top-0 bg-background">
                    <Input
                      placeholder="Buscar empresa..."
                      value={companySearch}
                      onChange={(e) => setCompanySearch(e.target.value)}
                      className="h-8"
                    />
                  </div>
                  {filteredCompanies && filteredCompanies.length > 0 ? (
                    filteredCompanies.map((company) => (
                      <SelectItem key={company.issuer_id} value={company.issuer_name}>
                        {company.issuer_name} ({company.ticker})
                      </SelectItem>
                    ))
                  ) : (
                    <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                      No se encontraron empresas
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Week Filter */}
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Seleccionar semana" />
                </SelectTrigger>
                <SelectContent className="bg-background border z-50">
                  <SelectItem value="all">Todas las semanas</SelectItem>
                  {weekOptions.map((week) => (
                    <SelectItem key={week.value} value={week.value}>
                      {week.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Initialize DB Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleInitializeVectorStore}
            disabled={isInitializing}
            className="gap-2"
          >
            {isInitializing ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Actualizando...
              </>
            ) : (
              <>
                <Database className="h-4 w-4" />
                Actualizar Base de Datos
              </>
            )}
          </Button>
        </div>

        <div className="grid lg:grid-cols-4 gap-6">
          {/* Analysis Type Selection */}
          <Card className="lg:col-span-1 shadow-card">
            <CardHeader>
              <CardTitle className="text-lg">Tipo de Análisis</CardTitle>
              <CardDescription>Selecciona el tipo de comparación</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {analysisTypes.map((type) => (
                <Button
                  key={type.value}
                  variant={analysisType === type.value ? "default" : "outline"}
                  className="w-full justify-start text-left h-auto py-3"
                  onClick={() => setAnalysisType(type.value)}
                >
                  <div>
                    <div className="font-medium text-sm">{type.label}</div>
                    <div className="text-xs text-muted-foreground">{type.description}</div>
                  </div>
                </Button>
              ))}
              
              <Button
                onClick={handleStartAnalysis}
                disabled={!selectedCompany || !analysisType || isLoading}
                className="w-full mt-4"
                size="lg"
              >
                {isLoading ? "Analizando..." : "Iniciar Análisis"}
              </Button>
            </CardContent>
          </Card>

          {/* Chat Area */}
          <Card className="lg:col-span-3 shadow-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <MessageCircle className="h-5 w-5" />
                    Conversación
                  </CardTitle>
                  <CardDescription>
                    Análisis inteligente basado en comparaciones entre IAs
                  </CardDescription>
                </div>
                
                {messages.length > 0 && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="gap-2">
                              <Download className="h-4 w-4" />
                              Exportar
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-background border z-50">
                            <DropdownMenuItem onClick={downloadAsTxt}>
                              Descargar como TXT
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={downloadAsJson}>
                              Descargar como JSON
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={downloadAsHtml}>
                              Descargar como HTML
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Guardar conversación para imprimir o compartir</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px] pr-4">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                    <AlertCircle className="h-12 w-12 mb-4 opacity-50" />
                    <p>Selecciona una empresa y tipo de análisis para comenzar</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((message, idx) => (
                      <div key={idx} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[80%] rounded-lg p-4 ${
                            message.role === 'user'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-card border border-border'
                          }`}
                        >
                          <div className="whitespace-pre-wrap text-foreground">{message.content}</div>
                          
                          {message.suggestedQuestions && message.suggestedQuestions.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-border">
                              <p className="text-xs font-semibold mb-3 text-foreground">Preguntas sugeridas:</p>
                              <div className="space-y-2">
                                {message.suggestedQuestions.map((question, qIdx) => (
                                  <Button
                                    key={qIdx}
                                    variant="outline"
                                    size="sm"
                                    className="w-full justify-start text-left h-auto py-3 px-3 hover:bg-accent"
                                    onClick={() => handleSuggestedQuestion(question)}
                                    disabled={isLoading}
                                  >
                                    {question}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    
                    {isLoading && (
                      <div className="flex justify-start">
                        <div className="bg-muted rounded-lg p-4 max-w-[80%]">
                          <div className="flex items-center gap-2">
                            <Skeleton className="h-4 w-4 rounded-full" />
                            <span className="text-sm text-muted-foreground">Analizando datos...</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
