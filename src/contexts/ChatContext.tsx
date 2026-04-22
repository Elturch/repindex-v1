import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { getRoleById } from "@/lib/chatRoles";
import { useAuth } from "@/contexts/AuthContext";
import { convertMarkdownToHtml, premiumTableStyles, emojiGridStyles } from "@/lib/markdownToHtml";
import { ChatLanguage, getSavedLanguage, saveLanguagePreference } from "@/lib/chatLanguages";
import { technicalSheetStyles, generateTechnicalSheetHtml } from "@/lib/technicalSheetHtml";
import { VerifiedSource, generateBibliographyHtml } from "@/lib/verifiedSourceExtractor";

// Constants for edge function invocation with extended timeout
const SUPABASE_URL = "https://jzkjykmrwisijiqlwuua.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU";

// Helper to get timeout based on depth level
function getTimeoutForRequest(depthLevel: string = 'complete'): number {
  switch (depthLevel) {
    case 'quick': return 120000;     // 2 min
    case 'complete': return 180000;  // 3 min  
    case 'exhaustive': return 300000; // 5 min
    default: return 180000;          // 3 min default
  }
}

// Helper to invoke edge functions with extended timeout using fetch + AbortController
async function invokeWithTimeout(
  functionName: string,
  body: Record<string, unknown>,
  timeoutMs: number = 300000
): Promise<{ data: unknown; error: Error | null }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/${functionName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      return { data: null, error: new Error(errorText || `HTTP ${response.status}`) };
    }

    const data = await response.json();
    return { data, error: null };

  } catch (err: unknown) {
    clearTimeout(timeoutId);

    if (err instanceof Error && err.name === 'AbortError') {
      return {
        data: null,
        error: new Error('La generación del informe ha excedido el tiempo límite. Intenta con un informe más corto o una profundidad menor.')
      };
    }

    return { data: null, error: err instanceof Error ? err : new Error('Unknown error') };
  }
}

// Loading messages for long operations (rotating every 15 seconds).
// PHASE 1.7: client-side mirror of parseModelsWithNegation. Handles negation
// ("sin contar X"), semantic groups ("americanas", "chinos", "openai"),
// and the expanded alias table. MUST stay in sync with
// supabase/functions/_shared/modelsEnum.ts so the loader count matches the
// model_names that the backend will compute.
const ALL_MODELS_CLIENT = ["ChatGPT", "Perplexity", "Gemini", "DeepSeek", "Grok", "Qwen"] as const;
const CLIENT_MODEL_GROUPS: Record<string, readonly string[]> = {
  "ias americanas": ["ChatGPT", "Gemini", "Grok", "Perplexity"],
  "modelos americanos": ["ChatGPT", "Gemini", "Grok", "Perplexity"],
  "americanas": ["ChatGPT", "Gemini", "Grok", "Perplexity"],
  "americanos": ["ChatGPT", "Gemini", "Grok", "Perplexity"],
  "ias chinas": ["DeepSeek", "Qwen"],
  "modelos chinos": ["DeepSeek", "Qwen"],
  "chinos": ["DeepSeek", "Qwen"],
  "chinas": ["DeepSeek", "Qwen"],
  "open source": ["DeepSeek", "Qwen"],
  "openai": ["ChatGPT"],
  "google": ["Gemini"],
  "anthropic": [],
  "todos los modelos": [...ALL_MODELS_CLIENT],
  "todos": [...ALL_MODELS_CLIENT],
  "todas": [...ALL_MODELS_CLIENT],
  "los 6": [...ALL_MODELS_CLIENT],
};
const CLIENT_MODEL_REGEX = /\b(chatgpt|chat\s*gpt|gpt[\s-]?[345](?:\.\d|o)?|gpt|perplexity|perplex|ppx|gemini(?:\s*\d(?:\.\d)?)?|deepseek|deep\s*seek|dsk|grok(?:\s*\d)?|qwen|openai|google\s+gemini|bard|xai)\b/gi;
const CLIENT_NEGATION_REGEX = /\b(sin(\s+contar|\s+incluir)?|excepto|salvo|menos|no\s+inclu(y|i)as?|fuera\s+de|exclu[yi]e?n?d?o?|quitando|except|excluding|without)\b/gi;
const CLIENT_SECTOR_REGEX = /\b(banca|banc[ao]s?|tecnol[oó]gic[ao]s?|hospitalari[oa]s?|asegurador[ae]s?|farmac[eé]utic[ao]s?|inmobiliari[ao]s?|energ[eé]tic[ao]s?|teleco|telecos|retailers?|seguros|salud|farma|sector|ibex|ibex\s*35|ibex35)\b/i;

// PHASE 1.8 — Conversational memory (Bug E).
// We keep the last successful query context client-side so that short
// follow-up questions ("y sin Grok?", "y ahora con Qwen?") can be merged
// with the previous sector / company / model_names before being sent to
// the backend. TTL = 5 minutes; reset on clearConversation().
const FOLLOWUP_TTL_MS = 5 * 60 * 1000;
const CLIENT_FOLLOWUP_PREFIX_REGEX =
  /^[¿\s]*(y|ahora|sin|con|tambi[eé]n|pero|en\s+cambio|y\s+si|y\s+ahora|quita|quitando|excluye|excluyendo|a[ñn]ade|a[ñn]adiendo|incluye|incluyendo|adem[aá]s)\b/i;
const CLIENT_FOLLOWUP_ANAPHOR_REGEX =
  /\b(ese|esa|esos|esas|este|esta|estos|estas|aquel|aquella|el\s+anterior|el\s+ultimo|el\s+último|los\s+mismos|esa\s+misma)\b/i;
const CLIENT_MODEL_QUANTIFIER_REGEX = /\b(\d+|uno|una|dos|tres|cuatro|cinco|seis)\s+(?:mejores?|peores?|principales|primeros?|ultimos?|últimos?)\s+(?:modelos?|ias?|llms?)\b/i;

function isFollowupClient(question: string): boolean {
  if (!question) return false;
  const t = question.trim();
  const wc = t.split(/\s+/).filter(Boolean).length;
  if (wc === 0 || wc > 10) return false;
  return CLIENT_FOLLOWUP_ANAPHOR_REGEX.test(t) || CLIENT_FOLLOWUP_PREFIX_REGEX.test(t);
}

function hasModelQuantifierClient(question: string): boolean {
  return !!question && CLIENT_MODEL_QUANTIFIER_REGEX.test(question);
}

export interface LastQueryContext {
  sector: string | null;
  company: string | null;
  model_names: string[];
  mode: "inclusive" | "exclusive" | "group" | "none";
  period_from: string | null;
  period_to: string | null;
  ts: number;
  intent?: string | null;
  canonical_group?: string | null;
  canonical_group_name?: string | null;
}

function aliasToCanonical(token: string): string | null {
  const t = token.toLowerCase().replace(/\s+/g, " ").trim();
  if (t === "chatgpt" || t === "openai" || t.startsWith("gpt")) return "ChatGPT";
  if (t === "perplexity" || t === "perplex" || t === "ppx") return "Perplexity";
  if (t === "gemini" || t === "google gemini" || t === "bard" || t.startsWith("gemini")) return "Gemini";
  if (t === "deepseek" || t === "deep seek" || t === "dsk") return "DeepSeek";
  if (t === "grok" || t === "xai" || t.startsWith("grok")) return "Grok";
  if (t === "qwen") return "Qwen";
  return null;
}

interface ClientParsedModels {
  modelNames: string[];
  mode: "inclusive" | "exclusive" | "group" | "none";
}

function parseModelsClient(question: string): ClientParsedModels {
  if (!question) return { modelNames: [], mode: "none" };
  // Collect alias hits with positions
  type Hit = { canonical: string; index: number };
  const hits: Hit[] = [];
  for (const m of question.matchAll(CLIENT_MODEL_REGEX)) {
    const canonical = aliasToCanonical(m[1]);
    if (canonical && typeof m.index === "number") hits.push({ canonical, index: m.index });
  }
  const negs: number[] = [];
  for (const m of question.matchAll(CLIENT_NEGATION_REGEX)) {
    if (typeof m.index === "number") negs.push(m.index);
  }
  // Negation path
  if (negs.length > 0 && hits.length > 0) {
    const excluded = new Set<string>();
    let any = false;
    for (const h of hits) {
      if (negs.some((ni) => Math.abs(h.index - ni) <= 25 && ni <= h.index)) {
        excluded.add(h.canonical);
        any = true;
      }
    }
    if (any) {
      return { modelNames: ALL_MODELS_CLIENT.filter((m) => !excluded.has(m)), mode: "exclusive" };
    }
  }
  // Group path (only when no plain alias)
  const lower = question.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (hits.length === 0) {
    for (const groupKey of Object.keys(CLIENT_MODEL_GROUPS).sort((a, b) => b.length - a.length)) {
      const re = new RegExp(`\\b${groupKey.replace(/\s+/g, "\\s+")}\\b`, "i");
      if (re.test(lower)) {
        return { modelNames: [...CLIENT_MODEL_GROUPS[groupKey]], mode: "group" };
      }
    }
  }
  // Inclusive path
  if (hits.length > 0) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const h of hits) if (!seen.has(h.canonical)) { seen.add(h.canonical); out.push(h.canonical); }
    return { modelNames: out, mode: "inclusive" };
  }
  return { modelNames: [], mode: "none" };
}

function detectModelCountFromQuery(question: string): number {
  return parseModelsClient(question).modelNames.length;
}

function buildLoadingMessages(modelCount: number): string[] {
  const n = modelCount > 0 ? modelCount : 6;
  const noun = n === 1 ? "modelo" : "modelos";
  return [
    `Consultando ${n} ${noun} de IA...`,
    "Analizando datos de mercado...",
    "Recopilando información sectorial...",
    "Procesando histórico de la empresa...",
    "Generando informe ejecutivo...",
    "Consolidando perspectivas de IA...",
    "Finalizando análisis...",
  ];
}

const DEFAULT_LOADING_MESSAGES = buildLoadingMessages(6);

// Phase 4 — UX: short generic loader shown for the first ~600ms so users
// don't see "Consultando 6 modelos de IA" for queries the guards will reject
// in milliseconds (off-topic, future predictions, greetings, etc.).
const INITIAL_LOADER_MESSAGE = "Analizando consulta…";
const INITIAL_LOADER_DURATION_MS = 600;

// Phase 4 — UX: persist sessionId across reloads so the user does not lose
// the current conversation. Clearing or loading another one rotates the key.
const SESSION_STORAGE_KEY = "repindex.chat.sessionId";
function loadPersistedSessionId(): string {
  if (typeof window === "undefined") return crypto.randomUUID();
  try {
    const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
  } catch {
    // localStorage unavailable (SSR / privacy mode) — fall through.
  }
  const fresh = crypto.randomUUID();
  try { window.localStorage.setItem(SESSION_STORAGE_KEY, fresh); } catch { /* noop */ }
  return fresh;
}
function persistSessionId(id: string) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(SESSION_STORAGE_KEY, id); } catch { /* noop */ }
}

/**
 * Normalize text for compliance matching (mirrors backend logic):
 * lowercase, strip diacritics, collapse whitespace, normalize quotes.
 */
function normalizeForCompliance(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[""«»]/g, '"')
    .replace(/['']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Patterns match NFD-normalized (accent-free) text — mirrors backend FORBIDDEN_PATTERNS
const STREAM_FORBIDDEN_PATTERNS: RegExp[] = [
  /la\s+respuesta\s+(?:completa\s+)?supera\s+el\s+limite/,
  /limite\s+maximo\s+permitido/,
  /limite\s+tecnico\s+de\s+entrega/,
  /supera\s+(?:el\s+)?(?:maximo\s+de\s+)?longitud/,
  /longitud\s+maxima\s+(?:permitida|de\s+respuesta)/,
  /maximo\s+de\s+longitud\s+permitido/,
  /excede\s+(?:el\s+)?(?:limite|longitud|maximo)/,
  /supera\s+(?:la\s+)?capacidad\s+(?:de\s+)?(?:esta\s+)?plataforma/,
  /(?:response|output)\s+(?:exceeds?|too\s+long|limit)/,
  /documento\s+aparte/,
  /carpeta\s+segura/,
  /\/informes[_\-]?rix\//,
  /informes[_\s\-]?rix/,
  /te\s+lo\s+deje\s+guardado/,
  /lo\s+he\s+dejado\s+en/,
  /dejado\s+(?:guardado|almacenado)\s+en/,
  /(?:adjunto|archivo|fichero)\s+(?:separado|externo|adicional)/,
  /(?:te\s+envio|te\s+mando|te\s+remito)\s+(?:el\s+)?(?:informe|documento|archivo)/,
  /puedes?\s+descargar(?:lo)?\s+(?:desde|en)/,
];

function sanitizeStreamContent(text: string): string {
  const normalized = normalizeForCompliance(text);
  let earliest = -1;
  for (const pattern of STREAM_FORBIDDEN_PATTERNS) {
    const match = pattern.exec(normalized);
    if (match && match.index !== undefined) {
      earliest = earliest === -1 ? match.index : Math.min(earliest, match.index);
    }
  }

  if (earliest === -1) return text;

  // Map normalized index back to original text (approximate — safe to cut early)
  const beforeMatch = text.substring(0, earliest);
  const lastBoundary = Math.max(
    beforeMatch.lastIndexOf('. '),
    beforeMatch.lastIndexOf('.\n'),
    beforeMatch.lastIndexOf('\n\n'),
    beforeMatch.lastIndexOf('---'),
  );

  return (lastBoundary > text.length * 0.2
    ? text.substring(0, lastBoundary + 1)
    : beforeMatch).trim();
}

export interface DrumrollQuestion {
  title: string;
  fullQuestion: string;
  teaser: string;
  reportType: 'competitive' | 'vulnerabilities' | 'projection' | 'sector';
}

export interface MethodologyMetadata {
  hasRixData?: boolean;
  modelsUsed?: string[];
  periodFrom?: string;
  periodTo?: string;
  observationsCount?: number;
  divergenceLevel?: 'low' | 'medium' | 'high' | 'unknown';
  divergencePoints?: number;
  uniqueCompanies?: number;
  uniqueWeeks?: number;
}

export interface ReportContext {
  company?: string | null;
  sector?: string | null;
  user_question?: string | null;
  perspective?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  timezone?: string;
  models?: string[];
  sample_size?: number;
  models_count?: number;
  weeks_analyzed?: number;
}

export interface MessageMetadata {
  type?: 'standard' | 'enriched';
  companyName?: string;
  documentsFound?: number;
  structuredDataFound?: number;
  enrichedFromRole?: string;
  originalContent?: string;
  depthLevel?: 'quick' | 'complete' | 'exhaustive';
  questionCategory?: string;
  // Methodology metadata for "Radar Reputacional" validation sheet
  methodology?: MethodologyMetadata;
  // Verified sources from ChatGPT and Perplexity for bibliography
  verifiedSources?: VerifiedSource[];
  // Report context for InfoBar
  reportContext?: ReportContext;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  suggestedQuestions?: string[];
  drumrollQuestion?: DrumrollQuestion;
  metadata?: MessageMetadata;
  isStreaming?: boolean; // indicates if message is currently being streamed
}

interface PageContext {
  name: string;
  path: string;
  dynamicData?: Record<string, any>;
}

// Session configuration types
export type DepthLevel = 'quick' | 'complete' | 'exhaustive';

interface ChatContextType {
  sessionId: string;
  messages: Message[];
  isLoading: boolean;
  isLoadingHistory: boolean;
  loadingMessage: string;
  sendMessage: (question: string, options?: { depthLevel?: DepthLevel; roleId?: string; useStreaming?: boolean }) => Promise<void>;
  enrichResponse: (roleId: string, messageIndex: number) => Promise<void>;
  clearConversation: () => void;
  pageContext: PageContext | null;
  setPageContext: (context: PageContext | null) => void;
  isFloatingOpen: boolean;
  setIsFloatingOpen: (open: boolean) => void;
  loadConversation: (sessionId: string) => void;
  // Conversation state
  isStarred: boolean;
  toggleStar: () => Promise<void>;
  hasConversation: boolean;
  // Language
  language: ChatLanguage;
  setLanguage: (language: ChatLanguage) => void;
  // Export functions
  downloadAsTxt: () => void;
  downloadAsJson: () => void;
  downloadAsHtml: () => void;
  // Streaming state
  isStreaming: boolean;
  // Session configuration
  sessionDepthLevel: DepthLevel;
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
  const [sessionId, setSessionId] = useState<string>(() => loadPersistedSessionId());
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState(DEFAULT_LOADING_MESSAGES[0]);
  const [pageContext, setPageContext] = useState<PageContext | null>(null);
  const [isFloatingOpen, setIsFloatingOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isStarred, setIsStarred] = useState(false);
  const [language, setLanguageState] = useState<ChatLanguage>(() => getSavedLanguage());
  const loadingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const initialLoaderTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // PHASE 1.8 — last successful query context for follow-up merging.
  const lastQueryContextRef = useRef<LastQueryContext | null>(null);
  // Capture the just-generated reportContext into the follow-up memory.
  const captureLastQueryContext = useCallback((rc: any | null | undefined) => {
    if (!rc) return;
    lastQueryContextRef.current = {
      sector: rc.sector ?? null,
      company: rc.company ?? null,
      model_names: Array.isArray(rc.models) ? rc.models : [],
      mode: (rc._parsed_mode as any) || "none",
      period_from: rc.date_from ?? null,
      period_to: rc.date_to ?? null,
      ts: Date.now(),
      intent: (rc.intent as string | undefined) ?? null,
      canonical_group: (rc.canonical_group as string | undefined) ?? null,
      canonical_group_name: (rc.canonical_group_name as string | undefined) ?? null,
    };
    console.log('[ChatContext] PHASE 1.8 captured lastQueryContext:', lastQueryContextRef.current);
  }, []);
  const { toast } = useToast();
  
  // Session configuration state
  const [sessionDepthLevel, setSessionDepthLevel] = useState<DepthLevel>('complete');
  
  // Use auth context for user ID - this syncs properly with AuthProvider
  const { user, isAuthenticated } = useAuth();
  const currentUserId = user?.id || null;
  
  // Debug logging for auth state
  useEffect(() => {
    console.log('[ChatContext] Auth state changed:', { 
      isAuthenticated, 
      userId: currentUserId,
      sessionId 
    });
  }, [isAuthenticated, currentUserId, sessionId]);

  // Create or update user_conversations record when user is authenticated
  const ensureConversationRecord = useCallback(async (title?: string, depthLevel?: DepthLevel, roleId?: string) => {
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
        // Update messages count and last_message_at, and session config if provided
        const updateData: Record<string, unknown> = { 
          last_message_at: new Date().toISOString(),
          messages_count: messages.length + 1,
          title: title || 'Nueva conversación'
        };
        if (depthLevel) updateData.session_depth_level = depthLevel;
        if (roleId) updateData.session_role_id = roleId;
        
        await supabase
          .from('user_conversations')
          .update(updateData)
          .eq('id', existing.id);
        return existing.id;
      } else {
        // Create new conversation record with session config
        const { data: newConv, error } = await supabase
          .from('user_conversations')
          .insert({
            session_id: sessionId,
            user_id: currentUserId,
            title: title || 'Nueva conversación',
            last_message_at: new Date().toISOString(),
            messages_count: 1,
            session_depth_level: depthLevel || 'exhaustive',
            session_role_id: roleId || 'general'
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
        // Load messages
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
          
          // Get conversation_id from first message if available
          const convId = data[0].conversation_id;
          if (convId) {
            setConversationId(convId);
            // Fetch starred status AND session config
            const { data: convData } = await supabase
              .from('user_conversations')
              .select('is_starred, session_depth_level, session_role_id')
              .eq('id', convId)
              .single();
            if (convData) {
              setIsStarred(convData.is_starred || false);
              if (convData.session_depth_level) {
                setSessionDepthLevel(convData.session_depth_level as DepthLevel);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error loading chat history:', error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadHistory();
  }, [sessionId]);

  const sendMessage = useCallback(async (question: string, options?: { depthLevel?: 'quick' | 'complete' | 'exhaustive'; roleId?: string; useStreaming?: boolean }) => {
    if (!question.trim()) {
      toast({
        title: "Pregunta vacía",
        description: "Por favor escribe una pregunta",
        variant: "destructive",
      });
      return;
    }

    const useStreaming = options?.useStreaming ?? true; // Default to streaming mode

    setIsLoading(true);
    if (useStreaming) {
      setIsStreaming(true);
    }
    
    // Start rotating loading messages — first one reflects the actual model count detected in the query.
    // PHASE 1.8 — Follow-up memory merge for the loader count.
    const lastCtx = lastQueryContextRef.current;
    const followupActive =
      isFollowupClient(question) &&
      lastCtx !== null &&
      Date.now() - lastCtx.ts < FOLLOWUP_TTL_MS;
    let detectedModelCount = detectModelCountFromQuery(question);
    if (followupActive) {
      const parsed = parseModelsClient(question);
      if (parsed.mode === "exclusive" && parsed.modelNames.length > 0) {
        // Subtract the excluded models from previous list
        const stillIn = new Set(parsed.modelNames);
        const excluded = ALL_MODELS_CLIENT.filter((m) => !stillIn.has(m));
        const merged = (lastCtx?.model_names ?? [...ALL_MODELS_CLIENT]).filter(
          (m) => !excluded.includes(m as any),
        );
        detectedModelCount = merged.length || (lastCtx?.model_names?.length ?? 6);
      } else if ((parsed.mode === "inclusive" || parsed.mode === "group") && parsed.modelNames.length > 0) {
        detectedModelCount = parsed.modelNames.length;
      } else {
        detectedModelCount = lastCtx?.model_names?.length ?? 6;
      }
      console.log(`[ChatContext] PHASE 1.8 follow-up active: loader count = ${detectedModelCount}`);
    }
    const loadingMessages = buildLoadingMessages(detectedModelCount);
    let loadingIndex = 0;
    setLoadingMessage(loadingMessages[0]);
    loadingIntervalRef.current = setInterval(() => {
      loadingIndex = (loadingIndex + 1) % loadingMessages.length;
      setLoadingMessage(loadingMessages[loadingIndex]);
    }, 15000); // Rotate every 15 seconds

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
      depth_level: options?.depthLevel || sessionDepthLevel,
    });

    try {
      const role = options?.roleId ? getRoleById(options.roleId) : undefined;
      const timeoutMs = getTimeoutForRequest(options?.depthLevel || sessionDepthLevel);
      
      console.log('[ChatContext] Sending message with language:', language.code, 'depth:', options?.depthLevel, 'streaming:', useStreaming);

      // =========================================================================
      // NORMALIZE QUERY: Call normalize-query edge function first (3s timeout)
      // =========================================================================
      let normalizedQuestion = question;
      let _normalizationMeta: Record<string, unknown> | null = null;
      
      try {
        const normController = new AbortController();
        const normTimeout = setTimeout(() => normController.abort(), 3500);
        
        const normResp = await fetch(
          `${SUPABASE_URL}/functions/v1/normalize-query`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'apikey': SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ query: question, language: language.code }),
            signal: normController.signal,
          }
        );
        clearTimeout(normTimeout);

        if (normResp.ok) {
          const normData = await normResp.json();
          _normalizationMeta = normData;
          
          // PHASE 1.7 BUG B FIX: Don't honor LLM's needs_clarification when our
          // deterministic parser detects a sector OR a supported model. The
          // LLM tends to mis-classify queries like "compara GPT4 vs claude
          // para tecnologicas" as off-topic just because Claude isn't supported.
          const hasDeterministicSector = CLIENT_SECTOR_REGEX.test(question);
          const hasDeterministicModel = parseModelsClient(question).modelNames.length > 0;
          // PHASE 1.8c BUG #1 FIX: also override when this is a follow-up with
          // a fresh previousContext that already has sector/company. Otherwise
          // queries like "y los 3 mejores" trigger an LLM clarification.
          const hasFollowupContext = followupActive && !!(lastCtx?.sector || lastCtx?.company);
          const overrideClarification = hasDeterministicSector || hasDeterministicModel || hasFollowupContext;
          if (normData.needs_clarification && normData.clarification_message && !overrideClarification) {
            const clarificationMsg: Message = {
              role: 'assistant',
              content: normData.clarification_message,
            };
            setMessages(prev => [...prev, clarificationMsg]);
            
            // Save to DB
            await supabase.from('chat_intelligence_sessions').insert({
              session_id: sessionId,
              role: 'assistant',
              content: normData.clarification_message,
              user_id: currentUserId,
              conversation_id: convId,
            });
            
            // Clean up loading state
            if (loadingIntervalRef.current) clearInterval(loadingIntervalRef.current);
            setIsLoading(false);
            setIsStreaming(false);
            return;
          }
          if (normData.needs_clarification && overrideClarification) {
            console.log('[ChatContext] PHASE 1.7/1.8c: ignoring needs_clarification — deterministic parser found sector/model OR follow-up context active');
          }
          
          // Use normalized query if available — BUT for follow-ups, keep the
          // original short query so the backend ctx-merge can apply (otherwise
          // the LLM rewrite strips the conversational link, e.g. "y los 3
          // mejores" → "Top 3 del sector banca" loses the model intent).
          const shouldPreserveOriginalForParser = hasModelQuantifierClient(question);
          if (normData.normalized_query && normData.confidence > 0.3 && !hasFollowupContext && !shouldPreserveOriginalForParser) {
            normalizedQuestion = normData.normalized_query;
            console.log('[ChatContext] Query normalized:', question, '->', normalizedQuestion);
          } else if (hasFollowupContext) {
            console.log('[ChatContext] PHASE 1.8c: skipping normalize-query rewrite for follow-up — preserving original to enable ctx-merge.');
          } else if (shouldPreserveOriginalForParser) {
            console.log('[ChatContext] preserving original query — model quantifier must not drift into company top-N.');
          }
        }
      } catch (normErr) {
        // Graceful degradation: just use original query
        console.warn('[ChatContext] normalize-query failed, using original:', normErr);
      }

      const previousContextPayload = followupActive && lastQueryContextRef.current
        ? {
            ...lastQueryContextRef.current,
            entity: lastQueryContextRef.current.company,
            models: lastQueryContextRef.current.model_names,
            period: {
              from: lastQueryContextRef.current.period_from,
              to: lastQueryContextRef.current.period_to,
            },
            timestamp: lastQueryContextRef.current.ts,
          }
        : null;

      console.log('[FE-BE]', {
        query: normalizedQuestion,
        originalQuestion: question,
        previousContext: previousContextPayload,
        isFollowupActive: followupActive,
      });

      if (useStreaming) {
        // =========================================================================
        // STREAMING MODE: Use fetch with ReadableStream for SSE
        // =========================================================================
        
        // Add empty assistant message that will be filled during streaming
        const streamingMessage: Message = {
          role: 'assistant',
          content: '',
          isStreaming: true,
        };
        setMessages(prev => [...prev, streamingMessage]);

        const response = await fetch(
          `${SUPABASE_URL}/functions/v1/chat-intelligence`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'apikey': SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({
              question: normalizedQuestion,
              originalQuestion: question !== normalizedQuestion ? question : undefined,
              conversationHistory: messages.map(m => ({ role: m.role, content: m.content })),
              sessionId,
              conversationId: convId,
              language: language.code,
              languageName: language.nativeName,
              depthLevel: options?.depthLevel || sessionDepthLevel,
              roleId: role?.id,
              roleName: role ? `${role.emoji} ${role.name}` : undefined,
              rolePrompt: role?.prompt,
              streamMode: true, // Enable streaming in edge function
              // PHASE 1.8 — Conversational memory for short follow-ups.
              previousContext: previousContextPayload,
              isFollowup: followupActive,
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || `HTTP ${response.status}`);
        }

        // =========================================================================
        // CONTENT-TYPE DETECTION: Handle both SSE and JSON responses
        // =========================================================================
        const contentType = response.headers.get('content-type') || '';
        console.log('[ChatContext] Response Content-Type:', contentType);

        // If backend returns JSON instead of SSE, handle it as non-streaming
        if (contentType.includes('application/json')) {
          console.log('[ChatContext] Received JSON response (fallback mode)');
          const data = await response.json();
          
          // Update the streaming message with the actual content
          setMessages(prev => {
            const updated = [...prev];
            const lastMsg = updated[updated.length - 1];
            if (lastMsg?.role === 'assistant') {
              lastMsg.content = data.answer || '';
              lastMsg.isStreaming = false;
              lastMsg.suggestedQuestions = data.suggestedQuestions || [];
              lastMsg.drumrollQuestion = data.drumrollQuestion || null;
              lastMsg.metadata = {
                type: data.metadata?.type || 'standard',
                companyName: data.metadata?.companyName,
                documentsFound: data.metadata?.documentsFound,
                structuredDataFound: data.metadata?.structuredDataFound,
                depthLevel: options?.depthLevel || sessionDepthLevel,
                questionCategory: data.metadata?.questionCategory,
                methodology: data.metadata?.methodology || {
                  hasRixData: (data.metadata?.structuredDataFound || 0) > 0,
                  modelsUsed: data.metadata?.modelsUsed || [],
                  periodFrom: data.metadata?.periodFrom,
                  periodTo: data.metadata?.periodTo,
                  observationsCount: data.metadata?.structuredDataFound || 0,
                  divergenceLevel: data.metadata?.divergenceLevel || 'unknown',
                  divergencePoints: data.metadata?.divergencePoints || 0,
                  uniqueCompanies: data.metadata?.uniqueCompanies,
                  uniqueWeeks: data.metadata?.uniqueWeeks,
                },
              };
            }
            return updated;
          });

          toast({
            title: "Respuesta recibida",
            description: `${data.metadata?.documentsFound || 0} documentos analizados`,
          });
          // PHASE 1.8 — capture context for follow-up merging
          captureLastQueryContext(data.metadata?.reportContext);

        } else {
          // =========================================================================
          // SSE STREAMING MODE: Parse event stream
          // =========================================================================
          console.log('[ChatContext] Received SSE stream');
          
          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error('No response body for streaming');
          }

          const decoder = new TextDecoder();
          let buffer = '';
          let accumulatedContent = '';
          let finalMetadata: any = null;
          let suggestedQuestions: string[] = [];
          let drumrollQuestion: DrumrollQuestion | null = null;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              // Skip empty lines and keep-alive comments
              if (!line.trim() || line.startsWith(':')) continue;
              
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (data === '[DONE]') continue;

                try {
                  const parsed = JSON.parse(data);
                  
                  if (parsed.type === 'chunk' && parsed.text) {
                    accumulatedContent += parsed.text;
                    accumulatedContent = sanitizeStreamContent(accumulatedContent);

                    // Update the last message with accumulated (sanitized) content
                    setMessages(prev => {
                      const updated = [...prev];
                      const lastMsg = updated[updated.length - 1];
                      if (lastMsg?.role === 'assistant') {
                        lastMsg.content = accumulatedContent;
                      }
                      return updated;
                    });
                  } else if (parsed.type === 'done') {
                    // Capture final metadata
                    suggestedQuestions = parsed.suggestedQuestions || [];
                    drumrollQuestion = parsed.drumrollQuestion || null;
                    finalMetadata = parsed.metadata || {};
                  } else if (parsed.type === 'error') {
                    throw new Error(parsed.error || 'Streaming error');
                  }
                } catch {
                  // Ignore parse errors for incomplete chunks
                }
              }
            }
          }

          // Safety check: if stream ended with empty content, show error
          if (!accumulatedContent.trim()) {
            console.error('[ChatContext] Stream completed but no content received');
            toast({
              title: "Error en la respuesta",
              description: "No se recibió contenido del asistente. Intenta de nuevo.",
              variant: "destructive",
            });
            // Remove the empty assistant message
            setMessages(prev => prev.filter((_, idx) => idx !== prev.length - 1));
            return;
          }

          // Mark streaming as complete and add final metadata including methodology
          setMessages(prev => {
            const updated = [...prev];
            const lastMsg = updated[updated.length - 1];
            if (lastMsg?.role === 'assistant') {
              lastMsg.isStreaming = false;
              lastMsg.suggestedQuestions = suggestedQuestions;
              lastMsg.drumrollQuestion = drumrollQuestion;
              lastMsg.metadata = {
                type: finalMetadata?.type || 'standard',
                companyName: finalMetadata?.companyName,
                documentsFound: finalMetadata?.documentsFound,
                structuredDataFound: finalMetadata?.structuredDataFound,
                depthLevel: options?.depthLevel || sessionDepthLevel,
                questionCategory: finalMetadata?.questionCategory,
                // Verified sources from ChatGPT and Perplexity for bibliography
                verifiedSources: finalMetadata?.verifiedSources,
                // Report context for InfoBar
                reportContext: finalMetadata?.reportContext || undefined,
                // Methodology metadata for "Radar Reputacional" validation sheet
                methodology: finalMetadata?.methodology || {
                  hasRixData: (finalMetadata?.structuredDataFound || 0) > 0,
                  modelsUsed: finalMetadata?.modelsUsed || [],
                  periodFrom: finalMetadata?.periodFrom,
                  periodTo: finalMetadata?.periodTo,
                  observationsCount: finalMetadata?.structuredDataFound || 0,
                  divergenceLevel: finalMetadata?.divergenceLevel || 'unknown',
                  divergencePoints: finalMetadata?.divergencePoints || 0,
                  uniqueCompanies: finalMetadata?.uniqueCompanies,
                  uniqueWeeks: finalMetadata?.uniqueWeeks,
                },
              };
            }
            return updated;
          });

          // NOTE: Backend already saves to DB in streaming mode, so we skip client-side insert
          // to avoid duplicate entries in chat_intelligence_sessions

          toast({
            title: "Respuesta recibida",
            description: `${finalMetadata?.documentsFound || 0} documentos analizados`,
          });
          // PHASE 1.8 — capture context for follow-up merging (SSE)
          captureLastQueryContext(finalMetadata?.reportContext);
        }

      } else {
        // =========================================================================
        // NON-STREAMING MODE: Use invokeWithTimeout (original behavior)
        // =========================================================================
        const { data, error } = await invokeWithTimeout('chat-intelligence', {
          question: normalizedQuestion,
          originalQuestion: question !== normalizedQuestion ? question : undefined,
          conversationHistory: messages.map(m => ({ role: m.role, content: m.content })),
          sessionId,
          conversationId: convId,
          language: language.code,
          languageName: language.nativeName,
          depthLevel: options?.depthLevel || sessionDepthLevel,
          roleId: role?.id,
          roleName: role ? `${role.emoji} ${role.name}` : undefined,
          rolePrompt: role?.prompt,
          streamMode: false,
          // PHASE 1.8 — Conversational memory for short follow-ups.
          previousContext: previousContextPayload,
          isFollowup: followupActive,
        }, timeoutMs) as { data: any; error: Error | null };

        if (error) throw error;

        const assistantMessage: Message = {
          role: 'assistant',
          content: data.answer,
          suggestedQuestions: data.suggestedQuestions,
          drumrollQuestion: data.drumrollQuestion,
          metadata: {
            type: data.metadata?.type || 'standard',
            companyName: data.metadata?.companyName,
            documentsFound: data.metadata?.documentsFound,
            structuredDataFound: data.metadata?.structuredDataFound,
            depthLevel: options?.depthLevel || sessionDepthLevel,
            questionCategory: data.metadata?.questionCategory,
            verifiedSources: data.metadata?.verifiedSources,
            reportContext: data.metadata?.reportContext || undefined,
            methodology: data.metadata?.methodology || {
              hasRixData: (data.metadata?.structuredDataFound || 0) > 0,
              modelsUsed: data.metadata?.modelsUsed || [],
              periodFrom: data.metadata?.periodFrom,
              periodTo: data.metadata?.periodTo,
              observationsCount: data.metadata?.structuredDataFound || 0,
              divergenceLevel: data.metadata?.divergenceLevel || 'unknown',
              divergencePoints: data.metadata?.divergencePoints || 0,
              uniqueCompanies: data.metadata?.uniqueCompanies,
              uniqueWeeks: data.metadata?.uniqueWeeks,
            },
          },
        };

        setMessages(prev => [...prev, assistantMessage]);

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

        toast({
          title: "Respuesta recibida",
          description: `${data.metadata?.documentsFound || 0} documentos, ${data.metadata?.structuredDataFound || 0} registros analizados`,
        });
        // PHASE 1.8 — capture context for follow-up merging (non-streaming)
        captureLastQueryContext(data.metadata?.reportContext);
      }
    } catch (error) {
      console.error('Error in chat intelligence:', error);
      
      // If streaming failed, remove the incomplete assistant message
      if (options?.useStreaming) {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && last.isStreaming) {
            return prev.slice(0, -1);
          }
          return prev;
        });
      }
      
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error en el análisis",
        variant: "destructive",
      });
    } finally {
      if (loadingIntervalRef.current) {
        clearInterval(loadingIntervalRef.current);
        loadingIntervalRef.current = null;
      }
      setIsLoading(false);
      setIsStreaming(false);
    }
  }, [messages, sessionId, toast, currentUserId, ensureConversationRecord, language, captureLastQueryContext]);

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
      // Use invokeWithTimeout for enrich action (2 min timeout)
      const { data, error } = await invokeWithTimeout('chat-intelligence', {
        action: 'enrich',
        roleId: role.id,
        roleName: role.name,
        rolePrompt: role.prompt,
        originalQuestion: userQuestion,
        originalResponse: targetMessage.content,
        sessionId,
        // Language preference
        language: language.code,
        languageName: language.nativeName,
      }, 120000) as { data: any; error: Error | null }; // 2 min timeout for enrich

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
  }, [messages, sessionId, toast, currentUserId, language]);

  const clearConversation = useCallback(() => {
    setMessages([]);
    setSessionId(crypto.randomUUID());
    setConversationId(null);
    setIsStarred(false);
    setIsLoadingHistory(false);
    setSessionDepthLevel('complete');
    // PHASE 1.8 — reset conversational memory
    lastQueryContextRef.current = null;
    toast({
      title: "Conversación limpiada",
      description: "Se ha iniciado una nueva conversación",
    });
  }, [toast]);

  const loadConversation = useCallback((newSessionId: string) => {
    setSessionId(newSessionId as `${string}-${string}-${string}-${string}-${string}`);
    setMessages([]);
    setConversationId(null);
    setIsStarred(false);
    setIsLoadingHistory(true);
    // PHASE 1.8 — reset conversational memory when switching conversation
    lastQueryContextRef.current = null;
  }, []);

  // Toggle star status for current conversation
  const toggleStar = useCallback(async () => {
    if (!conversationId || !currentUserId) {
      // No conversation saved yet, need to create one first
      if (messages.length > 0) {
        const convId = await ensureConversationRecord(messages[0]?.content?.slice(0, 50));
        if (convId) {
          const { error } = await supabase
            .from('user_conversations')
            .update({ is_starred: true })
            .eq('id', convId);
          
          if (!error) {
            setIsStarred(true);
            toast({
              title: "Conversación guardada",
              description: "La conversación se ha añadido a tus guardadas",
            });
          }
        }
      }
      return;
    }

    const newStarred = !isStarred;
    const { error } = await supabase
      .from('user_conversations')
      .update({ is_starred: newStarred })
      .eq('id', conversationId);

    if (!error) {
      setIsStarred(newStarred);
      toast({
        title: newStarred ? "Conversación guardada" : "Conversación desmarcada",
        description: newStarred 
          ? "La conversación se ha añadido a tus guardadas" 
          : "La conversación ya no está guardada",
      });
    }
  }, [conversationId, currentUserId, isStarred, messages, ensureConversationRecord, toast]);

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
          <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
          <style>
            :root {
              --primary: #1a73e8;
              --primary-dark: #1a3a5c;
              --text: #0f1419;
              --text-light: #536471;
              --text-muted: #8899a6;
              --bg: #ffffff;
              --bg-alt: #f7f9fa;
              --border: #e5e7eb;
            }
            
            * { box-sizing: border-box; margin: 0; padding: 0; }
            
            @page {
              size: A4;
              margin: 20mm 18mm;
            }
            
            body {
              font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              max-width: 900px;
              margin: 0 auto;
              padding: 40px 24px;
              line-height: 1.75;
              color: var(--text);
              background: var(--bg);
              font-size: 14.5px;
              -webkit-font-smoothing: antialiased;
            }
            
            /* Header corporativo editorial */
            .report-header {
              background: #f0f4f8;
              color: #0f1419;
              padding: 44px 40px;
              border-radius: 12px;
              margin-bottom: 40px;
              border: 1px solid #e5e7eb;
            }
            
            .report-header .header-top {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              margin-bottom: 24px;
            }
            
            .report-header .logo-section {
            }
            
            .report-header .logo {
              font-size: 28px;
              font-weight: 700;
              color: #0f1419;
              letter-spacing: -0.02em;
              margin-bottom: 4px;
            }
            
            .report-header .logo span {
              color: #8899a6;
            }
            
            .report-header .company-tagline {
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 2px;
              color: #8899a6;
              font-weight: 500;
            }
            
            .report-header .header-badge {
              background: transparent;
              border: 1px solid #1a73e8;
              color: #1a73e8;
              padding: 6px 14px;
              border-radius: 4px;
              font-size: 10px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            
            .report-header .divider {
              height: 1px;
              background: #e5e7eb;
              margin-bottom: 20px;
            }
            
            .report-header .report-title {
              font-size: 20px;
              font-weight: 600;
              color: #0f1419;
              margin-bottom: 4px;
            }
            
            .report-header .subtitle {
              font-size: 13px;
              color: #536471;
              font-weight: 400;
              margin-bottom: 20px;
            }
            
            .report-header .meta {
              display: flex;
              gap: 28px;
              font-size: 12px;
              color: #536471;
              font-weight: 400;
            }
            
            .report-header .meta-item {
              display: flex;
              align-items: center;
              gap: 6px;
            }
            
            /* Contenido de mensajes */
            .message {
              margin-bottom: 24px;
            }
            
            .message-user {
              background: #1a73e8;
              color: white;
              padding: 16px 20px;
              border-radius: 12px 12px 4px 12px;
              margin-left: 15%;
            }
            
            .message-assistant {
              background: #f7f9fa;
              border: 1px solid #e5e7eb;
              padding: 24px;
              border-radius: 4px 12px 12px 12px;
              margin-right: 5%;
            }
            
            .message-role {
              font-size: 11px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-bottom: 10px;
              color: #536471;
            }
            
            .message-content {
              white-space: pre-wrap;
              line-height: 1.75;
              overflow-wrap: anywhere;
              word-break: break-word;
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
            
            /* Tables - Premium Styling */
            ${premiumTableStyles}
            
            /* Emoji Result Grids */
            ${emojiGridStyles}
            
            /* Technical Sheet - Legal Fine Print */
            ${technicalSheetStyles}
            
            /* Footer corporativo */
            .report-footer {
              margin-top: 50px;
              padding-top: 24px;
              border-top: 2px solid var(--border);
              text-align: center;
            }
            
            .report-footer .logo {
              font-size: 16px;
              font-weight: 700;
              color: #0f1419;
              margin-bottom: 8px;
            }
            
            .report-footer p {
              margin: 4px 0;
            }
            
            .report-footer .disclaimer {
              margin-top: 16px;
              font-size: 10px;
              color: #8899a6;
              font-weight: 400;
            }
            
            @media print {
              body { 
                padding: 0;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              .report-header { break-after: avoid; }
              .message-user { break-inside: avoid; }
              .message-role { break-after: avoid; }
              .report-footer { break-before: avoid; }
              table { page-break-inside: auto; }
              thead { display: table-header-group; }
              tr { page-break-inside: avoid; }
              
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
              
              // Convert markdown to premium HTML using shared converter
              const content = convertMarkdownToHtml(msg.content);
              
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
          
          ${(() => {
            // Collect all verified sources and period dates from assistant messages
            const allSources: VerifiedSource[] = [];
            let periodFrom: string | null = null;
            let periodTo: string | null = null;
            
            messages.forEach(msg => {
              if (msg.role === 'assistant') {
                if (msg.metadata?.verifiedSources) {
                  allSources.push(...msg.metadata.verifiedSources);
                }
                // Extract period dates from methodology metadata
                if (msg.metadata?.methodology) {
                  if (msg.metadata.methodology.periodFrom && !periodFrom) {
                    periodFrom = msg.metadata.methodology.periodFrom;
                  }
                  if (msg.metadata.methodology.periodTo && !periodTo) {
                    periodTo = msg.metadata.methodology.periodTo;
                  }
                }
              }
            });
            // Deduplicate by URL
            const uniqueSources = allSources.filter((source, index, self) => 
              index === self.findIndex(s => s.url === source.url)
            );
            return generateBibliographyHtml(uniqueSources, periodFrom, periodTo);
          })()}
          
          <footer class="report-footer">
            <div class="logo">RepIndex</div>
            <p style="font-size: 11px; color: #536471; font-weight: 400; margin: 8px 0;">Inteligencia de Reputación Corporativa</p>
            <p style="font-size: 12px; color: #1a73e8; font-weight: 600; margin: 8px 0;">🌐 repindex.ai</p>
            <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
              <p class="disclaimer">
                © ${new Date().getFullYear()} RepIndex. Este documento es confidencial y ha sido generado automáticamente por Agente Rix. 
                Los datos y análisis se basan en información disponible en la base de datos de RepIndex. 
                Queda prohibida su reproducción o distribución sin autorización expresa.
              </p>
            </div>
          </footer>
          
          ${generateTechnicalSheetHtml()}
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

  // Language setter with persistence
  const setLanguage = useCallback((newLanguage: ChatLanguage) => {
    console.log('[ChatContext] Language changed:', newLanguage.code, newLanguage.nativeName);
    setLanguageState(newLanguage);
    saveLanguagePreference(newLanguage.code);
    toast({
      title: 'Idioma cambiado',
      description: `Agente Rix responderá en: ${newLanguage.nativeName}`,
    });
  }, [toast]);

  return (
    <ChatContext.Provider
      value={{
        sessionId,
        messages,
        isLoading,
        isLoadingHistory,
        loadingMessage,
        sendMessage,
        enrichResponse,
        clearConversation,
        pageContext,
        setPageContext,
        isFloatingOpen,
        setIsFloatingOpen,
        loadConversation,
        isStarred,
        toggleStar,
        hasConversation: messages.length > 0,
        language,
        setLanguage,
        downloadAsTxt,
        downloadAsJson,
        downloadAsHtml,
        isStreaming,
        sessionDepthLevel,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
