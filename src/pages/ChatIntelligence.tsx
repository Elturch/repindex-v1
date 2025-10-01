import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageCircle, Sparkles, AlertCircle, Database } from "lucide-react";
import { useCompanies } from "@/hooks/useCompanies";
import { usePariRuns } from "@/hooks/usePariRuns";
import { format, startOfWeek, addWeeks } from "date-fns";
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
  const [analysisType, setAnalysisType] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [vectorStoreStatus, setVectorStoreStatus] = useState<'unknown' | 'populating' | 'ready'>('unknown');

  const { data: companies, isLoading: companiesLoading } = useCompanies();
  const { data: pariRuns } = usePariRuns();
  const { toast } = useToast();

  // Generate week options
  const weekOptions = pariRuns ? Array.from(
    new Set(
      pariRuns
        .filter(run => run["06_period_from"])
        .map(run => {
          const weekStart = startOfWeek(new Date(run["06_period_from"]!), { weekStartsOn: 1 });
          return format(weekStart, 'yyyy-MM-dd');
        })
    )
  )
    .sort()
    .reverse()
    .map(weekStart => {
      const start = new Date(weekStart);
      return {
        value: weekStart,
        label: `${format(start, 'dd/MM')} - ${format(addWeeks(start, 1), 'dd/MM/yyyy')}`
      };
    }) : [];

  const analysisTypes = [
    { value: 'consenso', label: '🤝 Consenso entre IAs', description: '¿En qué coinciden los modelos?' },
    { value: 'discrepancias', label: '⚡ Discrepancias', description: '¿Dónde difieren las IAs?' },
    { value: 'fortalezas', label: '💪 Fortalezas', description: '¿Qué destaca positivamente?' },
    { value: 'debilidades', label: '⚠️ Debilidades', description: '¿Qué necesita mejorar?' },
    { value: 'metricas', label: '📊 Análisis de Métricas', description: 'Comparación de LNS, ES, SAM, etc.' },
  ];

  const handlePopulateVectorStore = async () => {
    setVectorStoreStatus('populating');
    toast({
      title: "Poblando Vector Store",
      description: "Esto puede tardar unos minutos...",
    });

    try {
      const { data, error } = await supabase.functions.invoke('populate-vector-store', {
        body: {},
      });

      if (error) throw error;

      setVectorStoreStatus('ready');
      toast({
        title: "Vector Store Poblado",
        description: `${data.documents_created} documentos creados, ${data.documents_skipped} ya existían.`,
      });
    } catch (error) {
      console.error('Error populating vector store:', error);
      setVectorStoreStatus('unknown');
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error poblando el vector store",
        variant: "destructive",
      });
    }
  };

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

  const handleSuggestedQuestion = (question: string) => {
    // This would trigger a new analysis with the suggested question
    toast({
      title: "Próximamente",
      description: "Preguntas de seguimiento en desarrollo",
    });
  };

  return (
    <Layout title="Chat Inteligente IA">
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight flex items-center justify-center gap-2">
            <Sparkles className="h-8 w-8 text-primary" />
            Chat Inteligente: Comparaciones entre IAs
          </h1>
          <p className="text-muted-foreground mt-2">
            Descubre insights únicos comparando cómo diferentes IAs perciben la reputación corporativa
          </p>
        </div>

        {/* Vector Store Status */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Database className="h-5 w-5" />
              Vector Store
            </CardTitle>
            <CardDescription>
              Base de datos vectorial para búsquedas semánticas
            </CardDescription>
          </CardHeader>
          <CardContent>
            {vectorStoreStatus === 'unknown' && (
              <Button onClick={handlePopulateVectorStore} className="w-full">
                Poblar Vector Store con Datos
              </Button>
            )}
            {vectorStoreStatus === 'populating' && (
              <div className="flex items-center justify-center gap-2">
                <Skeleton className="h-4 w-4 rounded-full" />
                <span className="text-sm text-muted-foreground">Poblando vector store...</span>
              </div>
            )}
            {vectorStoreStatus === 'ready' && (
              <div className="text-sm text-green-600 dark:text-green-400">
                ✓ Vector store listo
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Selection Panel */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Configuración</CardTitle>
              <CardDescription>Selecciona empresa y tipo de análisis</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Company Selector */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Empresa</label>
                <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies?.map((company) => (
                      <SelectItem key={company.issuer_id} value={company.issuer_name}>
                        {company.issuer_name} ({company.ticker})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Week Selector (Optional) */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Semana (Opcional)</label>
                <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas las semanas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las semanas</SelectItem>
                    {weekOptions.map((week) => (
                      <SelectItem key={week.value} value={week.value}>
                        {week.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Analysis Type */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Tipo de Análisis</label>
                <div className="space-y-2">
                  {analysisTypes.map((type) => (
                    <Button
                      key={type.value}
                      variant={analysisType === type.value ? "default" : "outline"}
                      className="w-full justify-start text-left h-auto py-3"
                      onClick={() => setAnalysisType(type.value)}
                    >
                      <div>
                        <div className="font-medium">{type.label}</div>
                        <div className="text-xs text-muted-foreground">{type.description}</div>
                      </div>
                    </Button>
                  ))}
                </div>
              </div>

              {/* Start Analysis Button */}
              <Button
                onClick={handleStartAnalysis}
                disabled={!selectedCompany || !analysisType || isLoading}
                className="w-full"
                size="lg"
              >
                {isLoading ? "Analizando..." : "Iniciar Análisis"}
              </Button>
            </CardContent>
          </Card>

          {/* Chat Area */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                Conversación
              </CardTitle>
              <CardDescription>
                Análisis inteligente basado en comparaciones entre IAs
              </CardDescription>
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
                              : 'bg-muted'
                          }`}
                        >
                          <div className="whitespace-pre-wrap">{message.content}</div>
                          
                          {message.suggestedQuestions && message.suggestedQuestions.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-border/50">
                              <p className="text-xs font-medium mb-2 opacity-70">Preguntas sugeridas:</p>
                              <div className="space-y-2">
                                {message.suggestedQuestions.map((question, qIdx) => (
                                  <Button
                                    key={qIdx}
                                    variant="ghost"
                                    size="sm"
                                    className="w-full justify-start text-left h-auto py-2 text-xs"
                                    onClick={() => handleSuggestedQuestion(question)}
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
