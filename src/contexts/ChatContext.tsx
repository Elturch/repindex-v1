import { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { getRoleById } from "@/lib/chatRoles";

export interface MessageMetadata {
  type?: 'standard' | 'bulletin' | 'enriched';
  companyName?: string;
  documentsFound?: number;
  structuredDataFound?: number;
  enrichedFromRole?: string;
  originalContent?: string;
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
  enrichResponse: (roleId: string, messageIndex: number) => Promise<void>;
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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const { toast } = useToast();

  // Get current user on mount and auth changes
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    };
    getCurrentUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUserId(session?.user?.id || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Create or update user_conversations record when user is authenticated
  const ensureConversationRecord = useCallback(async (title?: string) => {
    if (!currentUserId) return null;
    
    try {
      // Check if conversation already exists
      const { data: existing } = await supabase
        .from('user_conversations')
        .select('id')
        .eq('session_id', sessionId)
        .eq('user_id', currentUserId)
        .single();

      if (existing) {
        // Update messages count and last_message_at
        await supabase
          .from('user_conversations')
          .update({ 
            last_message_at: new Date().toISOString(),
            messages_count: messages.length + 1,
            title: title || 'Nueva conversación'
          })
          .eq('id', existing.id);
        return existing.id;
      } else {
        // Create new conversation record
        const { data: newConv, error } = await supabase
          .from('user_conversations')
          .insert({
            session_id: sessionId,
            user_id: currentUserId,
            title: title || 'Nueva conversación',
            last_message_at: new Date().toISOString(),
            messages_count: 1
          })
          .select('id')
          .single();
        
        if (error) throw error;
        setConversationId(newConv?.id || null);
        return newConv?.id;
      }
    } catch (error) {
      console.error('Error managing conversation record:', error);
      return null;
    }
  }, [currentUserId, sessionId, messages.length]);

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

    // Create/update conversation record for authenticated users
    const convId = await ensureConversationRecord(question.slice(0, 50));

    // Save user message to DB with user_id
    await supabase.from('chat_intelligence_sessions').insert({
      session_id: sessionId,
      role: 'user',
      content: question,
      user_id: currentUserId,
      conversation_id: convId,
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

      // Save assistant message to DB with user_id
      await supabase.from('chat_intelligence_sessions').insert({
        session_id: sessionId,
        role: 'assistant',
        content: data.answer,
        suggested_questions: data.suggestedQuestions,
        documents_found: data.metadata?.documentsFound,
        structured_data_found: data.metadata?.structuredDataFound,
        user_id: currentUserId,
        conversation_id: convId,
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
  }, [messages, sessionId, toast, currentUserId, ensureConversationRecord]);

  // Enrich a response with a specific professional role perspective
  const enrichResponse = useCallback(async (roleId: string, messageIndex: number) => {
    const role = getRoleById(roleId);
    if (!role || role.id === 'general') return;

    const targetMessage = messages[messageIndex];
    if (!targetMessage || targetMessage.role !== 'assistant') return;

    // Find the user question that preceded this response
    let userQuestion = '';
    for (let i = messageIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        userQuestion = messages[i].content;
        break;
      }
    }

    setIsLoading(true);

    // Add a visual indicator that we're enriching
    const enrichmentRequest: Message = {
      role: 'user',
      content: `🎭 Adaptar respuesta para: ${role.emoji} ${role.name}`,
    };

    setMessages(prev => [...prev, enrichmentRequest]);

    try {
      const { data, error } = await supabase.functions.invoke('chat-intelligence', {
        body: {
          action: 'enrich',
          roleId: role.id,
          roleName: role.name,
          rolePrompt: role.prompt,
          originalQuestion: userQuestion,
          originalResponse: targetMessage.content,
          sessionId,
        },
      });

      if (error) throw error;

      const enrichedMessage: Message = {
        role: 'assistant',
        content: data.answer,
        suggestedQuestions: data.suggestedQuestions,
        metadata: {
          type: 'enriched',
          enrichedFromRole: roleId,
          originalContent: targetMessage.content,
        },
      };

      setMessages(prev => [...prev, enrichedMessage]);

      // Save to DB with user_id
      await supabase.from('chat_intelligence_sessions').insert([
        {
          session_id: sessionId,
          role: 'user',
          content: enrichmentRequest.content,
          user_id: currentUserId,
        },
        {
          session_id: sessionId,
          role: 'assistant',
          content: data.answer,
          suggested_questions: data.suggestedQuestions,
          user_id: currentUserId,
        }
      ]);

      // Save analytics
      await supabase.from('role_enrichment_analytics').insert({
        session_id: sessionId,
        role_id: role.id,
        role_name: `${role.emoji} ${role.name}`,
        original_question: userQuestion,
        user_id: currentUserId,
      });

      toast({
        title: `Respuesta adaptada`,
        description: `Perspectiva de ${role.emoji} ${role.name}`,
      });

    } catch (error) {
      console.error('Error enriching response:', error);
      toast({
        title: "Error",
        description: "No se pudo adaptar la respuesta",
        variant: "destructive",
      });
      // Remove the enrichment request message on error
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  }, [messages, sessionId, toast, currentUserId]);

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
    const metadata = `Agente Rix - RepIndex.ai\n` +
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
    const now = format(new Date(), 'dd/MM/yyyy HH:mm');
    const dateForTitle = format(new Date(), 'dd-MM-yyyy');
    
    const html = `
      <!DOCTYPE html>
      <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Informe RepIndex - ${dateForTitle}</title>
          <style>
            :root {
              --primary: #3b82f6;
              --primary-dark: #1e40af;
              --primary-light: #60a5fa;
              --text: #1f2937;
              --text-light: #6b7280;
              --bg: #ffffff;
              --bg-alt: #f8fafc;
              --border: #e5e7eb;
            }
            
            * { box-sizing: border-box; margin: 0; padding: 0; }
            
            @page {
              size: A4;
              margin: 20mm 18mm;
            }
            
            body {
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              max-width: 900px;
              margin: 0 auto;
              padding: 40px 24px;
              line-height: 1.7;
              color: var(--text);
              background: var(--bg);
              font-size: 14px;
              -webkit-font-smoothing: antialiased;
            }
            
            /* Header corporativo premium */
            .report-header {
              background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
              color: white;
              padding: 44px 40px;
              border-radius: 18px;
              margin-bottom: 40px;
              position: relative;
              overflow: hidden;
              box-shadow: 0 20px 60px rgba(15, 23, 42, 0.4), 0 8px 24px rgba(0, 0, 0, 0.12);
              border: 1px solid rgba(255,255,255,0.08);
            }
            
            .report-header::before {
              content: '';
              position: absolute;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background: 
                radial-gradient(ellipse at 10% 20%, rgba(59, 130, 246, 0.15) 0%, transparent 50%),
                radial-gradient(ellipse at 90% 80%, rgba(99, 102, 241, 0.12) 0%, transparent 50%);
              pointer-events: none;
            }
            
            .report-header .header-top {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              margin-bottom: 24px;
              position: relative;
            }
            
            .report-header .logo-section {
              position: relative;
            }
            
            .report-header .logo {
              font-size: 32px;
              font-weight: 800;
              letter-spacing: -0.02em;
              margin-bottom: 4px;
              position: relative;
            }
            
            .report-header .logo span {
              color: #60a5fa;
            }
            
            .report-header .company-tagline {
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 2px;
              opacity: 0.7;
              font-weight: 500;
            }
            
            .report-header .header-badge {
              background: rgba(59, 130, 246, 0.2);
              border: 1px solid rgba(255,255,255,0.15);
              padding: 6px 14px;
              border-radius: 20px;
              font-size: 10px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            
            .report-header .divider {
              height: 1px;
              background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 20%, rgba(255,255,255,0.2) 80%, transparent 100%);
              margin-bottom: 20px;
            }
            
            .report-header .report-title {
              font-size: 20px;
              font-weight: 700;
              margin-bottom: 4px;
              position: relative;
            }
            
            .report-header .subtitle {
              font-size: 13px;
              opacity: 0.8;
              font-weight: 400;
              margin-bottom: 20px;
              position: relative;
            }
            
            .report-header .meta {
              display: flex;
              gap: 28px;
              font-size: 12px;
              opacity: 0.75;
              position: relative;
            }
            
            .report-header .meta-item {
              display: flex;
              align-items: center;
              gap: 6px;
            }
            
            /* Contenido de mensajes */
            .message {
              margin-bottom: 24px;
              page-break-inside: avoid;
            }
            
            .message-user {
              background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
              color: white;
              padding: 16px 20px;
              border-radius: 12px 12px 4px 12px;
              margin-left: 15%;
              box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
            }
            
            .message-assistant {
              background: var(--bg-alt);
              border: 1px solid var(--border);
              padding: 24px;
              border-radius: 4px 12px 12px 12px;
              margin-right: 5%;
            }
            
            .message-role {
              font-size: 11px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-bottom: 10px;
              opacity: 0.8;
            }
            
            .message-content {
              white-space: pre-wrap;
              line-height: 1.75;
            }
            
            .message-assistant .message-content h1,
            .message-assistant .message-content h2,
            .message-assistant .message-content h3 {
              margin-top: 20px;
              margin-bottom: 12px;
              color: var(--text);
            }
            
            .message-assistant .message-content h1 { font-size: 1.5em; border-bottom: 2px solid var(--primary); padding-bottom: 8px; }
            .message-assistant .message-content h2 { font-size: 1.3em; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
            .message-assistant .message-content h3 { font-size: 1.15em; color: var(--primary-dark); }
            
            .suggested-questions {
              margin-top: 16px;
              padding-top: 16px;
              border-top: 1px dashed var(--border);
            }
            
            .suggested-questions-title {
              font-size: 11px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              color: var(--text-light);
              margin-bottom: 8px;
            }
            
            .suggested-question {
              font-size: 13px;
              color: var(--primary-dark);
              margin: 4px 0;
              padding-left: 12px;
              position: relative;
            }
            
            .suggested-question::before {
              content: '•';
              position: absolute;
              left: 0;
              color: var(--primary);
            }
            
            /* Tables */
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 16px 0;
              font-size: 13px;
              border-radius: 8px;
              overflow: hidden;
              border: 1px solid var(--border);
            }
            
            thead { background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%); }
            
            th {
              padding: 12px 14px;
              text-align: left;
              font-weight: 700;
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              border-bottom: 2px solid var(--primary);
            }
            
            td {
              padding: 10px 14px;
              border-bottom: 1px solid var(--border);
            }
            
            tbody tr:nth-child(even) { background: #f9fafb; }
            tbody tr:hover { background: #f1f5f9; }
            
            /* Footer corporativo */
            .report-footer {
              margin-top: 50px;
              padding-top: 24px;
              border-top: 2px solid var(--border);
              text-align: center;
              color: var(--text-light);
              font-size: 12px;
            }
            
            .report-footer .logo {
              font-size: 18px;
              font-weight: 700;
              color: var(--primary);
              margin-bottom: 8px;
            }
            
            .report-footer p {
              margin: 4px 0;
            }
            
            .report-footer .disclaimer {
              margin-top: 16px;
              font-size: 11px;
              color: #9ca3af;
              font-style: italic;
            }
            
            @media print {
              body { 
                padding: 0;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              .report-header { break-after: avoid; }
              .message { break-inside: avoid; }
              .report-footer { break-before: avoid; }
              
              /* Hide browser extensions, TTS controls, and fixed elements */
              [class*="speech"], [class*="tts"], [class*="read-aloud"], [class*="readaloud"],
              [id*="speech"], [id*="tts"], [id*="read-aloud"], [id*="readaloud"],
              button[aria-label*="speech"], button[aria-label*="read"], button[aria-label*="play"],
              .readaloud-player, .tts-controls, #readaloud-player, #tts-wrapper,
              div[style*="position: fixed"], div[style*="position:fixed"],
              div[style*="z-index: 99"], div[style*="z-index:99"],
              iframe[style*="position: fixed"], iframe[style*="position:fixed"],
              [data-extension], [class*="extension"], [id*="extension"] {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                width: 0 !important;
                height: 0 !important;
                overflow: hidden !important;
              }
            }
          </style>
        </head>
        <body>
          <header class="report-header">
            <div class="header-top">
              <div class="logo-section">
                <div class="logo">Rep<span>Index</span></div>
                <div class="company-tagline">Inteligencia Reputacional Corporativa</div>
              </div>
              <div class="header-badge">Documento Confidencial</div>
            </div>
            <div class="divider"></div>
            <div class="report-title">Informe de Conversación</div>
            <div class="subtitle">Generado por Agente Rix — Asistente de Inteligencia Artificial</div>
            <div class="meta">
              <div class="meta-item">📅 ${now}</div>
              <div class="meta-item">💬 ${messages.length} mensajes</div>
              <div class="meta-item">🔖 Sesión ${sessionId.slice(0, 8)}</div>
            </div>
          </header>
          
          <main>
            ${messages.map(msg => {
              const isUser = msg.role === 'user';
              const role = isUser ? 'Consulta' : 'Análisis RepIndex';
              const questions = msg.suggestedQuestions?.length
                ? `<div class="suggested-questions">
                    <div class="suggested-questions-title">Análisis adicionales sugeridos</div>
                    ${msg.suggestedQuestions.map(q => `<div class="suggested-question">${q}</div>`).join('')}
                   </div>`
                : '';
              
              // Convert markdown to basic HTML
              let content = msg.content
                .replace(/^### (.+)$/gm, '<h3>$1</h3>')
                .replace(/^## (.+)$/gm, '<h2>$1</h2>')
                .replace(/^# (.+)$/gm, '<h1>$1</h1>')
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.+?)\*/g, '<em>$1</em>')
                .replace(/\n/g, '<br>');
              
              return `
                <div class="message">
                  <div class="message-${isUser ? 'user' : 'assistant'}">
                    <div class="message-role">${role}</div>
                    <div class="message-content">${content}</div>
                    ${!isUser ? questions : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </main>
          
          <footer class="report-footer">
            <div class="logo">RepIndex</div>
            <p style="font-size: 14px; color: #64748b; margin: 8px 0;">Inteligencia Artificial para Análisis de Reputación Corporativa</p>
            <p style="font-size: 13px; color: #3b82f6; font-weight: 600; margin: 8px 0;">🌐 repindex.ai</p>
            <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
              <p class="disclaimer">
                © ${new Date().getFullYear()} RepIndex. Este documento es confidencial y ha sido generado automáticamente por Agente Rix. 
                Los datos y análisis se basan en información disponible en la base de datos de RepIndex. 
                Queda prohibida su reproducción o distribución sin autorización expresa.
              </p>
            </div>
          </footer>
        </body>
      </html>
    `;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `informe_repindex_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.html`;
    link.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Informe exportado",
      description: "Informe RepIndex descargado como HTML",
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
        enrichResponse,
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
