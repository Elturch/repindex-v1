import { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export interface MessageMetadata {
  type?: 'standard' | 'bulletin';
  companyName?: string;
  documentsFound?: number;
  structuredDataFound?: number;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  suggestedQuestions?: string[];
  metadata?: MessageMetadata;
}

interface PageContext {
  name: string;
  path: string;
  dynamicData?: Record<string, any>;
}

interface ChatContextType {
  sessionId: string;
  messages: Message[];
  isLoading: boolean;
  isLoadingHistory: boolean;
  sendMessage: (question: string) => Promise<void>;
  clearConversation: () => void;
  pageContext: PageContext | null;
  setPageContext: (context: PageContext | null) => void;
  isFloatingOpen: boolean;
  setIsFloatingOpen: (open: boolean) => void;
  loadConversation: (sessionId: string) => void;
  // Export functions
  downloadAsTxt: () => void;
  downloadAsJson: () => void;
  downloadAsHtml: () => void;
}

const ChatContext = createContext<ChatContextType | null>(null);

export function useChatContext() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChatContext must be used within a ChatProvider');
  }
  return context;
}

interface ChatProviderProps {
  children: ReactNode;
}

export function ChatProvider({ children }: ChatProviderProps) {
  const [sessionId, setSessionId] = useState<string>(() => crypto.randomUUID());
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [pageContext, setPageContext] = useState<PageContext | null>(null);
  const [isFloatingOpen, setIsFloatingOpen] = useState(false);
  const { toast } = useToast();

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

  const sendMessage = useCallback(async (question: string) => {
    if (!question.trim()) {
      toast({
        title: "Pregunta vacía",
        description: "Por favor escribe una pregunta",
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
        content: data.answer,
        suggestedQuestions: data.suggestedQuestions,
        metadata: {
          type: data.metadata?.type || 'standard',
          companyName: data.metadata?.companyName,
          documentsFound: data.metadata?.documentsFound,
          structuredDataFound: data.metadata?.structuredDataFound,
        },
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Save assistant message to DB
      await supabase.from('chat_intelligence_sessions').insert({
        session_id: sessionId,
        role: 'assistant',
        content: data.answer,
        suggested_questions: data.suggestedQuestions,
        documents_found: data.metadata?.documentsFound,
        structured_data_found: data.metadata?.structuredDataFound,
      });

      // Show appropriate toast based on response type
      if (data.metadata?.type === 'bulletin') {
        toast({
          title: "Boletín generado",
          description: `Boletín ejecutivo de ${data.metadata.companyName || 'empresa'} listo para descargar`,
        });
      } else {
        toast({
          title: "Respuesta recibida",
          description: `${data.metadata?.documentsFound || 0} documentos, ${data.metadata?.structuredDataFound || 0} registros analizados`,
        });
      }
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
  }, [messages, sessionId, toast]);

  const clearConversation = useCallback(() => {
    setMessages([]);
    setSessionId(crypto.randomUUID());
    setIsLoadingHistory(false);
    toast({
      title: "Conversación limpiada",
      description: "Se ha iniciado una nueva conversación",
    });
  }, [toast]);

  const loadConversation = useCallback((newSessionId: string) => {
    setSessionId(newSessionId as `${string}-${string}-${string}-${string}-${string}`);
    setMessages([]);
    setIsLoadingHistory(true);
  }, []);

  const generateFileName = (extension: string) => {
    const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm');
    return `repindex_chat_${timestamp}.${extension}`;
  };

  const downloadAsTxt = useCallback(() => {
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
  }, [messages, sessionId, toast]);

  const downloadAsJson = useCallback(() => {
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
  }, [messages, sessionId, toast]);

  const downloadAsHtml = useCallback(() => {
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
  }, [messages, sessionId, toast]);

  return (
    <ChatContext.Provider
      value={{
        sessionId,
        messages,
        isLoading,
        isLoadingHistory,
        sendMessage,
        clearConversation,
        pageContext,
        setPageContext,
        isFloatingOpen,
        setIsFloatingOpen,
        loadConversation,
        downloadAsTxt,
        downloadAsJson,
        downloadAsHtml,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
