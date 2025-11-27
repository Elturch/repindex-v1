import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { MarkdownMessage } from "@/components/ui/markdown-message";
import { MessageCircle, Send, Sparkles, Database, RefreshCw, Download, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Message {
  role: 'user' | 'assistant';
  content: string;
  suggestedQuestions?: string[];
}

export default function ChatIntelligence() {
  // Generate unique session ID on mount
  const [sessionId] = useState(() => crypto.randomUUID());
  const [userQuestion, setUserQuestion] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Starter prompts for empty chat
  const starterPrompts = [
    "¿Cuáles son las 5 empresas con mejor RIX Score esta semana?",
    "¿Qué empresas han subido más en reputación este mes?",
    "Compara la evolución de Telefónica e Iberdrola",
    "¿Cómo evalúan las IAs a Banco Santander?",
    "¿Qué empresas tienen discrepancias entre modelos de IA?",
  ];

  // Load conversation history from DB on mount
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const { data, error } = await supabase
          .from('chat_intelligence_sessions')
          .select('*')
          .eq('session_id', sessionId)
          .order('created_at', { ascending: true });
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          const loadedMessages: Message[] = data.map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
            suggestedQuestions: msg.suggested_questions as string[] | undefined,
          }));
          setMessages(loadedMessages);
        }
      } catch (error) {
        console.error('Error loading chat history:', error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadHistory();
  }, [sessionId]);

  const handleSendQuestion = async (question: string) => {
    if (!question.trim()) {
      toast({
        title: "Pregunta vacía",
        description: "Por favor escribe una pregunta",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setUserQuestion("");

    const userMessage: Message = {
      role: 'user',
      content: question,
    };

    setMessages(prev => [...prev, userMessage]);

    // Save user message to DB
    await supabase.from('chat_intelligence_sessions').insert({
      session_id: sessionId,
      role: 'user',
      content: question,
    });

    try {
      const { data, error } = await supabase.functions.invoke('chat-intelligence', {
        body: {
          question,
          conversationHistory: messages.map(m => ({ role: m.role, content: m.content })),
          sessionId,
        },
      });

      if (error) throw error;

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.response,
        suggestedQuestions: data.suggestedQuestions,
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Save assistant message to DB
      await supabase.from('chat_intelligence_sessions').insert({
        session_id: sessionId,
        role: 'assistant',
        content: data.response,
        suggested_questions: data.suggestedQuestions,
        documents_found: data.documentsFound,
        structured_data_found: data.structuredDataFound,
      });

      toast({
        title: "Respuesta recibida",
        description: `${data.documentsFound || 0} documentos consultados`,
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
    await handleSendQuestion(question);
  };

  const handleStarterPrompt = async (prompt: string) => {
    await handleSendQuestion(prompt);
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

  const handleClearConversation = () => {
    setMessages([]);
    toast({
      title: "Conversación limpiada",
      description: "Se ha iniciado una nueva conversación",
    });
  };

  const generateFileName = (extension: string) => {
    const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm');
    return `repindex_chat_${timestamp}.${extension}`;
  };

  const downloadAsTxt = () => {
    const metadata = `Chat Inteligente - RepIndex.ai\n` +
      `Fecha: ${format(new Date(), 'dd/MM/yyyy HH:mm')}\n` +
      `Sesión: ${sessionId}\n` +
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
        sessionId: sessionId,
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
        <h2 style="margin: 0 0 10px 0; color: #333;">Chat Inteligente - RepIndex.ai</h2>
        <p style="margin: 5px 0; color: #666;"><strong>Fecha:</strong> ${format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
        <p style="margin: 5px 0; color: #666;"><strong>Sesión:</strong> ${sessionId}</p>
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
          <title>Conversación RepIndex - ${format(new Date(), 'dd-MM-yyyy')}</title>
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
    <Layout title="RepIndex.ai">
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">
            Chat Inteligente RepIndex
          </h1>
          <p className="text-sm text-muted-foreground">
            Pregunta sobre empresas, tendencias, comparaciones y análisis de reputación
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearConversation}
            disabled={messages.length === 0}
            className="gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Nueva Conversación
          </Button>
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
                Actualizar DB
              </>
            )}
          </Button>
        </div>

        {/* Chat Area */}
        <Card className="shadow-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5" />
                  Conversación
                </CardTitle>
                <CardDescription>
                  Análisis inteligente basado en datos de RepIndex
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
            <ScrollArea className="h-[500px] pr-4 mb-4">
              {isLoadingHistory ? (
                <div className="space-y-4 py-4">
                  <Skeleton className="h-20 w-3/4" />
                  <Skeleton className="h-20 w-3/4 ml-auto" />
                  <Skeleton className="h-20 w-3/4" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full space-y-6 py-12">
                  <div className="text-center space-y-2">
                    <Sparkles className="h-12 w-12 mx-auto text-primary opacity-70" />
                    <h3 className="text-lg font-semibold">Comienza una conversación</h3>
                    <p className="text-sm text-muted-foreground max-w-md">
                      Pregunta lo que quieras sobre las empresas del IBEX y su reputación según las IAs
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-2 w-full max-w-2xl">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Sugerencias para empezar:</p>
                    {starterPrompts.map((prompt, idx) => (
                      <Button
                        key={idx}
                        variant="outline"
                        className="justify-start text-left h-auto py-3 px-4 hover:bg-accent"
                        onClick={() => handleStarterPrompt(prompt)}
                      >
                        <span className="text-sm">{prompt}</span>
                      </Button>
                    ))}
                  </div>
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
                        {message.role === 'user' ? (
                          <div className="whitespace-pre-wrap text-sm">{message.content}</div>
                        ) : (
                          <MarkdownMessage 
                            content={message.content} 
                            showDownload={true}
                          />
                        )}
                        
                        {message.suggestedQuestions && message.suggestedQuestions.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-border/50">
                            <p className="text-xs font-semibold mb-3 opacity-80">Preguntas sugeridas:</p>
                            <div className="space-y-2">
                              {message.suggestedQuestions.map((question, qIdx) => (
                                <Button
                                  key={qIdx}
                                  variant="outline"
                                  size="sm"
                                  className="w-full justify-start text-left h-auto py-2 px-3 text-xs"
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
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <RefreshCw className="h-5 w-5 text-primary animate-spin" />
                          </div>
                          <div>
                            <span className="text-sm font-medium text-foreground">Analizando datos...</span>
                            <p className="text-xs text-muted-foreground mt-1">Consultando base de datos completa</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Input Area */}
            <div className="flex gap-2">
              <Input
                placeholder="Escribe tu pregunta sobre RepIndex..."
                value={userQuestion}
                onChange={(e) => setUserQuestion(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendQuestion(userQuestion);
                  }
                }}
                disabled={isLoading}
                className="flex-1"
              />
              <Button
                onClick={() => handleSendQuestion(userQuestion)}
                disabled={isLoading || !userQuestion.trim()}
                size="icon"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
