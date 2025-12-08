import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Layout } from '@/components/layout/Layout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { 
  Building2, 
  Users, 
  Plus, 
  Loader2, 
  CheckCircle,
  Mail,
  RefreshCw,
  Pencil,
  Gift,
  Database,
  Play,
  AlertCircle,
  BarChart3,
  Sparkles,
  MessageSquare,
  Eye,
  UserCircle,
  TrendingUp,
  Target,
  Send,
  Bell,
  Megaphone
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';

interface Company {
  id: string;
  company_name: string;
  ticker: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  billing_name: string | null;
  tax_id: string | null;
  plan_type: string;
  monthly_fee: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  is_individual: boolean;
  is_active: boolean;
  company_id: string | null;
  created_at: string;
  client_companies: { id: string; company_name: string } | null;
}

interface RoleEnrichmentAnalytic {
  id: string;
  role_id: string;
  role_name: string;
  original_question: string;
  enrichment_timestamp: string;
  session_id: string;
}

interface RoleStats {
  role_id: string;
  role_name: string;
  count: number;
}

interface UserConversation {
  id: string;
  session_id: string;
  user_id: string;
  title: string | null;
  messages_count: number | null;
  last_message_at: string | null;
  created_at: string | null;
  is_starred: boolean | null;
  is_archived: boolean | null;
  user_email?: string;
  user_name?: string;
}

interface UserPersona {
  id: string;
  name: string;
  emoji: string;
  description: string;
  characteristics: string[];
  userIds: string[];
  userCount: number;
  avgMetrics: {
    conversations: number;
    enrichments: number;
    documents: number;
    sessionFrequency: number;
  };
  color: string;
}

interface UserActivity {
  userId: string;
  email: string;
  fullName: string | null;
  companyName: string | null;
  totalConversations: number;
  totalMessages: number;
  totalEnrichments: number;
  totalDocuments: number;
  favoriteRoles: { roleId: string; roleName: string; count: number }[];
  lastActivity: string | null;
  daysActive: number;
  companiesMentioned: string[];
}

const Admin: React.FC = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  
  // Companies state
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [showCompanyForm, setShowCompanyForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [savingCompany, setSavingCompany] = useState(false);
  const [companyForm, setCompanyForm] = useState({
    company_name: '',
    ticker: '',
    contact_email: '',
    contact_phone: '',
    billing_name: '',
    billing_address: '',
    billing_city: '',
    billing_postal_code: '',
    tax_id: '',
    plan_type: 'basic',
    monthly_fee: '',
    is_courtesy: false, // Plan gratuito de cortesía
    is_active: true,
    notes: '',
  });

  // Users state
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [savingUser, setSavingUser] = useState(false);
  const [userForm, setUserForm] = useState({
    email: '',
    full_name: '',
    company_id: '',
    is_individual: false,
    is_active: true,
    send_magic_link: true,
  });

  // Vector Store state
  const [vectorStoreRunning, setVectorStoreRunning] = useState(false);
  const [vectorStoreLogs, setVectorStoreLogs] = useState<string[]>([]);
  const [vectorStoreProgress, setVectorStoreProgress] = useState(0);
  const [vectorStoreTotalRuns, setVectorStoreTotalRuns] = useState(0);
  const [vectorStoreDocsCreated, setVectorStoreDocsCreated] = useState(0);
  const [vectorStoreRemaining, setVectorStoreRemaining] = useState(0);
  const [vectorStoreAutoRunning, setVectorStoreAutoRunning] = useState(false);
  const autoRunningRef = useRef(false);
  const [vectorStoreResult, setVectorStoreResult] = useState<{
    success: boolean;
    complete?: boolean;
    message?: string;
    error?: string;
  } | null>(null);

  // Role Analytics state
  const [roleAnalytics, setRoleAnalytics] = useState<RoleEnrichmentAnalytic[]>([]);
  const [roleStats, setRoleStats] = useState<RoleStats[]>([]);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [totalEnrichments, setTotalEnrichments] = useState(0);

  // Conversations state
  const [conversations, setConversations] = useState<UserConversation[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [conversationMessages, setConversationMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [filterByUserId, setFilterByUserId] = useState<string | null>(null);

  // User Profiles/Personas state
  const [personas, setPersonas] = useState<UserPersona[]>([]);
  const [userActivities, setUserActivities] = useState<UserActivity[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);
  const [profilesAnalyzedAt, setProfilesAnalyzedAt] = useState<string | null>(null);
  const [filterByUserName, setFilterByUserName] = useState<string | null>(null);

  // Marketing state
  const [sendingNotifications, setSendingNotifications] = useState(false);
  const [notificationStats, setNotificationStats] = useState<{
    notificationsSent: number;
    usersReached: number;
    byPersona: { name: string; count: number }[];
  } | null>(null);
  const [customNotification, setCustomNotification] = useState({
    title: '',
    content: '',
    type: 'persona_tip',
    priority: 'normal',
  });
  const [selectedMarketingPersonas, setSelectedMarketingPersonas] = useState<string[]>([]);

  // Test user for admin (only visible in Admin panel)
  const testUser: UserProfile = {
    id: 'test-lovable-user',
    email: 'pruebas@lovable.dev',
    full_name: 'Pruebas Lovable',
    is_individual: true,
    is_active: true,
    company_id: null,
    created_at: new Date().toISOString(),
    client_companies: null,
  };

  // Combine real users with test user for admin display
  const allUsersWithTest = useMemo(() => {
    return [testUser, ...users];
  }, [users]);

  // Fetch initial vector store status on mount
  useEffect(() => {
    const fetchInitialStatus = async () => {
      try {
        const [docsResult, runsResult] = await Promise.all([
          supabase.from('documents').select('id', { count: 'exact', head: true }),
          supabase.from('rix_runs').select('id', { count: 'exact', head: true }).not('10_resumen', 'is', null),
        ]);
        const docs = docsResult.count || 0;
        const runs = runsResult.count || 0;
        setVectorStoreDocsCreated(docs);
        setVectorStoreTotalRuns(runs);
        setVectorStoreRemaining(Math.max(0, runs - docs));
        setVectorStoreProgress(runs > 0 ? Math.round((docs / runs) * 100) : 100);
      } catch (e) {
        console.error('Error fetching vector store status:', e);
      }
    };
    fetchInitialStatus();
  }, []);

  // Compute chat activity data for chart
  const chatActivityData = useMemo(() => {
    const last14Days: { date: string; chats: number; label: string }[] = [];
    const today = new Date();
    
    for (let i = 13; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const label = date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
      last14Days.push({ date: dateStr, chats: 0, label });
    }

    conversations.forEach(convo => {
      if (convo.created_at) {
        const convoDate = convo.created_at.split('T')[0];
        const dayEntry = last14Days.find(d => d.date === convoDate);
        if (dayEntry) {
          dayEntry.chats++;
        }
      }
    });

    return last14Days;
  }, [conversations]);

  // Fetch user profiles analysis
  const fetchUserProfiles = async () => {
    setLoadingProfiles(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-user-profiles');
      if (error) throw error;
      setPersonas(data.personas || []);
      setUserActivities(data.userActivities || []);
      setProfilesAnalyzedAt(data.analysisDate || new Date().toISOString());
      toast({ title: 'Análisis completado', description: `${data.personas?.length || 0} perfiles identificados` });
    } catch (error: any) {
      console.error('Error analyzing profiles:', error);
      toast({ title: 'Error', description: 'No se pudo analizar los perfiles', variant: 'destructive' });
    } finally {
      setLoadingProfiles(false);
    }
  };

  // Fetch data
  useEffect(() => {
    fetchCompanies();
    fetchUsers();
    fetchRoleAnalytics();
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    setLoadingConversations(true);
    try {
      const { conversations: convos } = await callAdminApi('list_conversations');
      setConversations(convos || []);
    } catch (error) {
      console.error('Error fetching conversations:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar las conversaciones', variant: 'destructive' });
    } finally {
      setLoadingConversations(false);
    }
  };

  const fetchConversationMessages = async (sessionId: string) => {
    setLoadingMessages(true);
    setSelectedConversation(sessionId);
    try {
      const { messages } = await callAdminApi('get_conversation_messages', { session_id: sessionId });
      setConversationMessages(messages || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar los mensajes', variant: 'destructive' });
    } finally {
      setLoadingMessages(false);
    }
  };

  const fetchRoleAnalytics = async () => {
    setLoadingAnalytics(true);
    try {
      // Fetch recent enrichments
      const { data: analytics, error: analyticsError, count } = await supabase
        .from('role_enrichment_analytics')
        .select('*', { count: 'exact' })
        .order('enrichment_timestamp', { ascending: false })
        .limit(50);

      if (analyticsError) throw analyticsError;
      setRoleAnalytics(analytics || []);
      setTotalEnrichments(count || 0);

      // Calculate role stats
      const { data: allAnalytics, error: statsError } = await supabase
        .from('role_enrichment_analytics')
        .select('role_id, role_name');

      if (statsError) throw statsError;

      const statsMap = new Map<string, { role_name: string; count: number }>();
      (allAnalytics || []).forEach((item: any) => {
        const existing = statsMap.get(item.role_id);
        if (existing) {
          existing.count++;
        } else {
          statsMap.set(item.role_id, { role_name: item.role_name, count: 1 });
        }
      });

      const stats: RoleStats[] = Array.from(statsMap.entries())
        .map(([role_id, data]) => ({ role_id, role_name: data.role_name, count: data.count }))
        .sort((a, b) => b.count - a.count);

      setRoleStats(stats);
    } catch (error) {
      console.error('Error fetching role analytics:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar los analytics', variant: 'destructive' });
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const callAdminApi = async (action: string, data?: any) => {
    const { data: response, error } = await supabase.functions.invoke('admin-api', {
      body: { action, data },
    });
    if (error) throw error;
    if (response.error) throw new Error(response.error);
    return response;
  };

  const fetchCompanies = async () => {
    setLoadingCompanies(true);
    try {
      const { companies } = await callAdminApi('list_companies');
      setCompanies(companies || []);
    } catch (error) {
      console.error('Error fetching companies:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar las empresas', variant: 'destructive' });
    } finally {
      setLoadingCompanies(false);
    }
  };

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const { users } = await callAdminApi('list_users');
      setUsers(users || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar los usuarios', variant: 'destructive' });
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleRunVectorStore = async () => {
    setVectorStoreRunning(true);
    setVectorStoreAutoRunning(true);
    autoRunningRef.current = true;
    setVectorStoreResult(null);
    
    const addLog = (msg: string) => {
      setVectorStoreLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    };
    
    addLog('🚀 Iniciando repoblación incremental...');
    
    let continueProcessing = true;
    let batchNumber = 0;
    
    while (continueProcessing && autoRunningRef.current) {
      batchNumber++;
      addLog(`📦 Batch ${batchNumber}: procesando...`);
      
      try {
        const { data, error } = await supabase.functions.invoke('populate-vector-store', {
          body: { includeRawResponses: true },
        });
        
        if (error) throw error;
        
        if (data) {
          setVectorStoreDocsCreated(data.existing || 0);
          setVectorStoreTotalRuns(data.total || 0);
          setVectorStoreRemaining(data.remaining || 0);
          
          if (data.total > 0) {
            const progress = Math.round(((data.existing || 0) / data.total) * 100);
            setVectorStoreProgress(progress);
          }
          
          addLog(`✓ Batch ${batchNumber}: ${data.processed || 0} creados, ${data.errored || 0} errores, ${data.remaining || 0} pendientes (${data.elapsed_seconds}s)`);
          
          if (data.complete || data.remaining === 0) {
            continueProcessing = false;
            addLog(`✅ ¡Proceso completado! ${data.existing} documentos totales`);
            setVectorStoreResult({ success: true, complete: true, message: `${data.existing} documentos` });
            toast({
              title: 'Vector Store completado',
              description: `${data.existing} documentos sincronizados correctamente`,
            });
          } else {
            // Brief pause before next batch
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      } catch (error: any) {
        console.error('Error in batch:', error);
        addLog(`❌ Error en batch ${batchNumber}: ${error.message}`);
        
        // Retry after longer pause
        if (batchNumber < 20) {
          addLog('⏳ Reintentando en 5 segundos...');
          await new Promise(resolve => setTimeout(resolve, 5000));
        } else {
          continueProcessing = false;
          setVectorStoreResult({ success: false, error: error.message });
          toast({
            title: 'Error',
            description: 'Proceso detenido tras múltiples errores',
            variant: 'destructive',
          });
        }
      }
    }
    
    setVectorStoreRunning(false);
    setVectorStoreAutoRunning(false);
    autoRunningRef.current = false;
  };

  const handleStopVectorStore = () => {
    autoRunningRef.current = false;
    setVectorStoreAutoRunning(false);
    setVectorStoreLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ⏸️ Proceso pausado por usuario`]);
    toast({ title: 'Pausado', description: 'El proceso se detendrá tras el batch actual' });
  };

  const resetCompanyForm = () => {
    setCompanyForm({
      company_name: '', ticker: '', contact_email: '', contact_phone: '',
      billing_name: '', billing_address: '', billing_city: '', billing_postal_code: '',
      tax_id: '', plan_type: 'basic', monthly_fee: '', is_courtesy: false, is_active: true, notes: '',
    });
  };

  const openEditCompany = (company: Company) => {
    setEditingCompany(company);
    setCompanyForm({
      company_name: company.company_name,
      ticker: company.ticker || '',
      contact_email: company.contact_email || '',
      contact_phone: company.contact_phone || '',
      billing_name: company.billing_name || '',
      billing_address: '',
      billing_city: '',
      billing_postal_code: '',
      tax_id: company.tax_id || '',
      plan_type: company.plan_type,
      monthly_fee: company.monthly_fee?.toString() || '0',
      is_courtesy: company.monthly_fee === 0 && company.plan_type !== 'basic',
      is_active: company.is_active,
      notes: company.notes || '',
    });
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyForm.company_name.trim()) {
      toast({ title: 'Error', description: 'El nombre de la empresa es obligatorio', variant: 'destructive' });
      return;
    }

    setSavingCompany(true);
    try {
      await callAdminApi('create_company', {
        ...companyForm,
        monthly_fee: companyForm.is_courtesy ? 0 : (companyForm.monthly_fee ? parseFloat(companyForm.monthly_fee) : 0),
      });
      toast({ title: 'Empresa creada', description: `${companyForm.company_name} añadida correctamente` });
      setShowCompanyForm(false);
      resetCompanyForm();
      fetchCompanies();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSavingCompany(false);
    }
  };

  const handleUpdateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCompany) return;

    setSavingCompany(true);
    try {
      await callAdminApi('update_company', {
        id: editingCompany.id,
        company_name: companyForm.company_name,
        ticker: companyForm.ticker || null,
        contact_email: companyForm.contact_email || null,
        contact_phone: companyForm.contact_phone || null,
        billing_name: companyForm.billing_name || null,
        tax_id: companyForm.tax_id || null,
        plan_type: companyForm.plan_type,
        monthly_fee: companyForm.is_courtesy ? 0 : (companyForm.monthly_fee ? parseFloat(companyForm.monthly_fee) : 0),
        is_active: companyForm.is_active,
        notes: companyForm.notes || null,
      });
      toast({ title: 'Empresa actualizada', description: `${companyForm.company_name} guardada correctamente` });
      setEditingCompany(null);
      resetCompanyForm();
      fetchCompanies();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSavingCompany(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userForm.email.trim()) {
      toast({ title: 'Error', description: 'El email es obligatorio', variant: 'destructive' });
      return;
    }

    setSavingUser(true);
    try {
      await callAdminApi('create_user', {
        ...userForm,
        company_id: userForm.company_id || null,
      });
      toast({ 
        title: 'Usuario creado', 
        description: `${userForm.email} añadido correctamente${userForm.send_magic_link ? '. Magic link enviado.' : ''}` 
      });
      setShowUserForm(false);
      setUserForm({ email: '', full_name: '', company_id: '', is_individual: false, is_active: true, send_magic_link: true });
      fetchUsers();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSavingUser(false);
    }
  };

  const handleSendMagicLink = async (userId: string, email: string) => {
    try {
      await callAdminApi('send_magic_link', { user_id: userId });
      toast({ title: 'Magic Link enviado', description: `Enlace enviado a ${email}` });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const openEditUser = (user: UserProfile) => {
    setEditingUser(user);
    setUserForm({
      email: user.email,
      full_name: user.full_name || '',
      company_id: user.company_id || '',
      is_individual: user.is_individual,
      is_active: user.is_active,
      send_magic_link: false,
    });
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setSavingUser(true);
    try {
      await callAdminApi('update_user', {
        id: editingUser.id,
        full_name: userForm.full_name || null,
        company_id: userForm.company_id || null,
        is_active: userForm.is_active,
        is_individual: userForm.is_individual || !userForm.company_id,
      });
      toast({ title: 'Usuario actualizado', description: `${userForm.email} guardado correctamente` });
      setEditingUser(null);
      fetchUsers();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSavingUser(false);
    }
  };

  // Company form fields JSX (inline to prevent input focus loss)
  const companyFormFieldsJSX = (isEditing: boolean) => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="company_name">Nombre de la empresa *</Label>
          <Input
            id="company_name"
            value={companyForm.company_name}
            onChange={(e) => setCompanyForm(f => ({ ...f, company_name: e.target.value }))}
            placeholder="Acme Corp"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ticker">Ticker (si cotiza)</Label>
          <Input
            id="ticker"
            value={companyForm.ticker}
            onChange={(e) => setCompanyForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))}
            placeholder="ACM"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact_email">Email de contacto</Label>
          <Input
            id="contact_email"
            type="email"
            value={companyForm.contact_email}
            onChange={(e) => setCompanyForm(f => ({ ...f, contact_email: e.target.value }))}
            placeholder="contacto@empresa.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact_phone">Teléfono</Label>
          <Input
            id="contact_phone"
            value={companyForm.contact_phone}
            onChange={(e) => setCompanyForm(f => ({ ...f, contact_phone: e.target.value }))}
            placeholder="+34 600 000 000"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="billing_name">Razón social</Label>
          <Input
            id="billing_name"
            value={companyForm.billing_name}
            onChange={(e) => setCompanyForm(f => ({ ...f, billing_name: e.target.value }))}
            placeholder="Acme Corporation S.L."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tax_id">CIF/NIF</Label>
          <Input
            id="tax_id"
            value={companyForm.tax_id}
            onChange={(e) => setCompanyForm(f => ({ ...f, tax_id: e.target.value.toUpperCase() }))}
            placeholder="B12345678"
          />
        </div>
      </div>

      {/* Plan section */}
      <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
        <h4 className="font-medium">Plan y facturación</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="plan_type">Tipo de plan</Label>
            <Select value={companyForm.plan_type} onValueChange={(v) => setCompanyForm(f => ({ ...f, plan_type: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="basic">Basic</SelectItem>
                <SelectItem value="premium">Premium</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="monthly_fee">Cuota mensual (€)</Label>
            <Input
              id="monthly_fee"
              type="number"
              step="0.01"
              value={companyForm.monthly_fee}
              onChange={(e) => setCompanyForm(f => ({ ...f, monthly_fee: e.target.value }))}
              placeholder="0.00"
              disabled={companyForm.is_courtesy}
            />
          </div>
          <div className="space-y-2 flex items-end">
            <div className="flex items-center gap-2 p-2 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <Gift className="h-4 w-4 text-green-600 dark:text-green-400" />
              <Switch
                id="is_courtesy"
                checked={companyForm.is_courtesy}
                onCheckedChange={(v) => setCompanyForm(f => ({ ...f, is_courtesy: v, monthly_fee: v ? '0' : f.monthly_fee }))}
              />
              <Label htmlFor="is_courtesy" className="text-sm text-green-700 dark:text-green-300">
                Plan cortesía (0€)
              </Label>
            </div>
          </div>
        </div>
      </div>

      {isEditing && (
        <div className="flex items-center gap-2">
          <Switch
            id="is_active"
            checked={companyForm.is_active}
            onCheckedChange={(v) => setCompanyForm(f => ({ ...f, is_active: v }))}
          />
          <Label htmlFor="is_active">Empresa activa</Label>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="notes">Notas internas</Label>
        <Textarea
          id="notes"
          value={companyForm.notes}
          onChange={(e) => setCompanyForm(f => ({ ...f, notes: e.target.value }))}
          placeholder="Notas internas sobre la empresa..."
          rows={2}
        />
      </div>
    </div>
  );

  return (
    <Layout title="Admin - RepIndex">
      <div className="container max-w-6xl mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Panel de Administración</h1>
          <p className="text-muted-foreground">
            Gestión de empresas cliente y usuarios de RepIndex
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full max-w-5xl grid-cols-7 mb-6">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Resumen
            </TabsTrigger>
            <TabsTrigger value="profiles" className="flex items-center gap-2">
              <UserCircle className="h-4 w-4" />
              Perfiles
            </TabsTrigger>
            <TabsTrigger value="companies" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Empresas
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Usuarios
            </TabsTrigger>
            <TabsTrigger value="conversations" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Chats
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="marketing" className="flex items-center gap-2">
              <Megaphone className="h-4 w-4" />
              Marketing
            </TabsTrigger>
            <TabsTrigger value="system" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              Sistema
            </TabsTrigger>
          </TabsList>

          {/* ==================== PERFILES DE USUARIO ==================== */}
          <TabsContent value="profiles">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" />
                  Perfiles y Estereotipos de Usuarios
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Análisis dinámico de comportamiento basado en IA
                  {profilesAnalyzedAt && (
                    <span className="ml-2 text-xs">
                      · Último análisis: {new Date(profilesAnalyzedAt).toLocaleString('es-ES')}
                    </span>
                  )}
                </p>
              </div>
              <Button onClick={fetchUserProfiles} disabled={loadingProfiles}>
                {loadingProfiles ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Analizando...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Analizar Perfiles
                  </>
                )}
              </Button>
            </div>

            {loadingProfiles ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">Analizando patrones de comportamiento con IA...</p>
                <p className="text-xs text-muted-foreground mt-1">Esto puede tardar unos segundos</p>
              </div>
            ) : personas.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <UserCircle className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
                  <h3 className="text-lg font-medium mb-2">Sin análisis de perfiles</h3>
                  <p className="text-muted-foreground text-center max-w-md mb-4">
                    Haz clic en "Analizar Perfiles" para que la IA analice el comportamiento 
                    de los usuarios y cree estereotipos dinámicos.
                  </p>
                  <Button onClick={fetchUserProfiles}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Iniciar Análisis
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* Personas grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {personas.map((persona) => (
                    <Card 
                      key={persona.id}
                      className={`cursor-pointer transition-all hover:shadow-lg ${
                        selectedPersona === persona.id ? 'ring-2 ring-primary shadow-lg' : ''
                      }`}
                      style={{ borderLeftColor: persona.color, borderLeftWidth: '4px' }}
                      onClick={() => setSelectedPersona(selectedPersona === persona.id ? null : persona.id)}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-3xl">{persona.emoji}</span>
                            <div>
                              <CardTitle className="text-base">{persona.name}</CardTitle>
                              <CardDescription className="text-xs">
                                {persona.userCount} usuario{persona.userCount !== 1 ? 's' : ''}
                              </CardDescription>
                            </div>
                          </div>
                          <Badge 
                            variant="secondary" 
                            style={{ backgroundColor: `${persona.color}20`, color: persona.color }}
                          >
                            {Math.round((persona.userCount / userActivities.length) * 100)}%
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-sm text-muted-foreground">{persona.description}</p>
                        
                        <div className="flex flex-wrap gap-1">
                          {persona.characteristics.slice(0, 3).map((char, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {char}
                            </Badge>
                          ))}
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                          <div className="text-center">
                            <p className="text-lg font-bold" style={{ color: persona.color }}>
                              {persona.avgMetrics.conversations.toFixed(1)}
                            </p>
                            <p className="text-xs text-muted-foreground">Avg. Chats</p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg font-bold" style={{ color: persona.color }}>
                              {persona.avgMetrics.enrichments.toFixed(1)}
                            </p>
                            <p className="text-xs text-muted-foreground">Avg. Enriq.</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Selected persona details */}
                {selectedPersona && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Usuarios del perfil: {personas.find(p => p.id === selectedPersona)?.name}
                      </CardTitle>
                      <CardDescription>
                        Detalle de usuarios asignados a este estereotipo
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[400px]">
                        <div className="space-y-2">
                          {userActivities
                            .filter(u => personas.find(p => p.id === selectedPersona)?.userIds.includes(u.userId))
                            .map((user) => (
                              <div 
                                key={user.userId}
                                className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                    <UserCircle className="h-5 w-5 text-primary" />
                                  </div>
                                  <div>
                                    <p className="font-medium">{user.fullName || user.email}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {user.companyName || 'Particular'}
                                      {user.lastActivity && (
                                        <span className="ml-2">
                                          · Último: {new Date(user.lastActivity).toLocaleDateString('es-ES')}
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-4">
                                  <div className="text-center">
                                    <p className="font-bold text-sm">{user.totalConversations}</p>
                                    <p className="text-xs text-muted-foreground">Chats</p>
                                  </div>
                                  <div className="text-center">
                                    <p className="font-bold text-sm">{user.totalEnrichments}</p>
                                    <p className="text-xs text-muted-foreground">Enriq.</p>
                                  </div>
                                  <div className="text-center">
                                    <p className="font-bold text-sm">{user.totalDocuments}</p>
                                    <p className="text-xs text-muted-foreground">Docs</p>
                                  </div>
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setFilterByUserId(user.userId);
                                      setFilterByUserName(user.fullName || user.email);
                                      setActiveTab('conversations');
                                    }}
                                  >
                                    <MessageSquare className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}

                {/* Activity heatmap summary */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      Distribución de Actividad por Perfil
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {personas.map((persona) => (
                        <div key={persona.id} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span>{persona.emoji}</span>
                              <span className="font-medium">{persona.name}</span>
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {persona.userCount} usuarios ({Math.round((persona.userCount / userActivities.length) * 100)}%)
                            </span>
                          </div>
                          <div className="h-4 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full rounded-full transition-all duration-500"
                              style={{ 
                                width: `${(persona.userCount / userActivities.length) * 100}%`,
                                backgroundColor: persona.color 
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Insights */}
                <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      Insights del Análisis
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 rounded-lg bg-background/80">
                        <p className="text-2xl font-bold text-primary">{userActivities.length}</p>
                        <p className="text-sm text-muted-foreground">Usuarios analizados</p>
                      </div>
                      <div className="p-4 rounded-lg bg-background/80">
                        <p className="text-2xl font-bold text-green-600">
                          {personas.find(p => p.id.includes('power') || p.id.includes('intensive'))?.userCount || 0}
                        </p>
                        <p className="text-sm text-muted-foreground">Usuarios intensivos</p>
                      </div>
                      <div className="p-4 rounded-lg bg-background/80">
                        <p className="text-2xl font-bold text-amber-600">
                          {personas.find(p => p.id.includes('dormant') || p.id.includes('inactive'))?.userCount || 0}
                        </p>
                        <p className="text-sm text-muted-foreground">Usuarios inactivos</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* ==================== RESUMEN ==================== */}
          <TabsContent value="overview">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Resumen de Clientes</h2>
              <Button variant="outline" size="sm" onClick={() => { fetchCompanies(); fetchUsers(); }}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            {(loadingCompanies || loadingUsers) ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Statistics */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-bold text-primary">{companies.length}</p>
                      <p className="text-sm text-muted-foreground">Empresas</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-bold text-blue-600">{users.length}</p>
                      <p className="text-sm text-muted-foreground">Usuarios</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-bold text-purple-600">{conversations.length}</p>
                      <p className="text-sm text-muted-foreground">Chats</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-bold text-green-600">{companies.filter(c => c.is_active).length}</p>
                      <p className="text-sm text-muted-foreground">Activas</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-bold text-amber-600">{users.filter(u => u.is_individual).length}</p>
                      <p className="text-sm text-muted-foreground">Particulares</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Chat Activity Chart */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Actividad de Chat (últimos 14 días)</CardTitle>
                    <CardDescription>Nuevas conversaciones por día</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chatActivityData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis 
                            dataKey="label" 
                            tick={{ fontSize: 11 }} 
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis 
                            allowDecimals={false}
                            tick={{ fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                            width={30}
                          />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--card))', 
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '6px'
                            }}
                            labelStyle={{ fontWeight: 600 }}
                          />
                          <Bar 
                            dataKey="chats" 
                            fill="hsl(var(--primary))" 
                            radius={[4, 4, 0, 0]}
                            name="Conversaciones"
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Companies with their users */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Empresas y sus usuarios</h3>
                  {companies.map((company) => {
                    const companyUsers = users.filter(u => u.company_id === company.id);
                    return (
                      <Card key={company.id} className={!company.is_active ? 'opacity-60' : ''}>
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                <Building2 className="h-5 w-5 text-primary" />
                              </div>
                              <div>
                                <CardTitle className="text-base">{company.company_name}</CardTitle>
                                <CardDescription>
                                  {company.contact_email || 'Sin email'}
                                  {company.ticker && ` · ${company.ticker}`}
                                </CardDescription>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={company.is_active ? 'default' : 'secondary'}>
                                {company.is_active ? 'Activa' : 'Inactiva'}
                              </Badge>
                              <Badge variant="outline" className={company.plan_type === 'premium' ? 'border-amber-500 text-amber-600' : company.plan_type === 'enterprise' ? 'border-purple-500 text-purple-600' : ''}>
                                {company.plan_type}
                              </Badge>
                              {company.monthly_fee === 0 && company.plan_type !== 'basic' && (
                                <Badge variant="outline" className="border-green-500 text-green-600">
                                  <Gift className="h-3 w-3 mr-1" />
                                  Cortesía
                                </Badge>
                              )}
                              <Button variant="ghost" size="sm" onClick={() => openEditCompany(company)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-2">
                          {companyUsers.length > 0 ? (
                            <div className="border rounded-lg divide-y">
                              {companyUsers.map((user) => (
                                <div key={user.id} className="flex items-center justify-between p-3 hover:bg-muted/30">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                      <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <div>
                                      <p className="font-medium text-sm">{user.full_name || 'Sin nombre'}</p>
                                      <p className="text-xs text-muted-foreground">{user.email}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant={user.is_active ? 'default' : 'secondary'} className="text-xs">
                                      {user.is_active ? 'Activo' : 'Inactivo'}
                                    </Badge>
                                    <Button variant="ghost" size="sm" onClick={() => openEditUser(user)} title="Editar usuario">
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => handleSendMagicLink(user.id, user.email)} title="Enviar Magic Link">
                                      <Mail className="h-4 w-4" />
                                    </Button>
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setFilterByUserId(user.id);
                                        setFilterByUserName(user.full_name || user.email);
                                        setActiveTab('conversations');
                                      }} 
                                      title="Ver conversaciones"
                                    >
                                      <MessageSquare className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground italic py-2">Sin usuarios asignados</p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}

                  {/* Test user card - Admin only */}
                  <Card className="border-purple-500/50 bg-purple-50/50 dark:bg-purple-900/10">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                            <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                          </div>
                          <div>
                            <CardTitle className="text-base flex items-center gap-2">
                              Usuario de Pruebas
                              <Badge variant="outline" className="border-purple-500 text-purple-600 text-xs">Admin Only</Badge>
                            </CardTitle>
                            <CardDescription>Usuario interno para testing de funcionalidades</CardDescription>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-2">
                      <div className="border border-purple-200 dark:border-purple-800 rounded-lg divide-y">
                        <div className="flex items-center justify-between p-3 hover:bg-purple-100/50 dark:hover:bg-purple-900/30">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                              <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{testUser.full_name}</p>
                              <p className="text-xs text-muted-foreground">{testUser.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs border-purple-500 text-purple-600">Test</Badge>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => {
                                setFilterByUserId(testUser.id);
                                setFilterByUserName(testUser.full_name || testUser.email);
                                setActiveTab('conversations');
                              }} 
                              title="Ver conversaciones"
                            >
                              <MessageSquare className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Individual users (Particulares) */}
                  {users.filter(u => u.is_individual || !u.company_id).length > 0 && (
                    <Card className="border-dashed">
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                            <Users className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                          </div>
                          <div>
                            <CardTitle className="text-base">Usuarios Particulares</CardTitle>
                            <CardDescription>Usuarios sin empresa asociada</CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-2">
                        <div className="border rounded-lg divide-y">
                          {users.filter(u => u.is_individual || !u.company_id).map((user) => (
                            <div key={user.id} className="flex items-center justify-between p-3 hover:bg-muted/30">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                                  <Users className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                </div>
                                <div>
                                  <p className="font-medium text-sm">{user.full_name || 'Sin nombre'}</p>
                                  <p className="text-xs text-muted-foreground">{user.email}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">Particular</Badge>
                                <Badge variant={user.is_active ? 'default' : 'secondary'} className="text-xs">
                                  {user.is_active ? 'Activo' : 'Inactivo'}
                                </Badge>
                                <Button variant="ghost" size="sm" onClick={() => openEditUser(user)} title="Editar usuario">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => handleSendMagicLink(user.id, user.email)} title="Enviar Magic Link">
                                  <Mail className="h-4 w-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => {
                                    setFilterByUserId(user.id);
                                    setFilterByUserName(user.full_name || user.email);
                                    setActiveTab('conversations');
                                  }} 
                                  title="Ver conversaciones"
                                >
                                  <MessageSquare className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          {/* ==================== EMPRESAS ==================== */}
          <TabsContent value="companies">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Empresas Cliente</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={fetchCompanies}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button onClick={() => { resetCompanyForm(); setShowCompanyForm(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva Empresa
                </Button>
              </div>
            </div>

            {/* Create company form */}
            {showCompanyForm && (
              <Card className="mb-6 border-primary/50">
                <CardHeader>
                  <CardTitle className="text-lg">Nueva Empresa</CardTitle>
                  <CardDescription>Rellena los datos de la empresa cliente</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateCompany} className="space-y-4">
                    {companyFormFieldsJSX(false)}
                    <div className="flex gap-2 justify-end">
                      <Button type="button" variant="outline" onClick={() => setShowCompanyForm(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={savingCompany}>
                        {savingCompany ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                        Crear Empresa
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            {/* Edit company dialog */}
            <Dialog open={!!editingCompany} onOpenChange={(open) => !open && setEditingCompany(null)}>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Editar Empresa</DialogTitle>
                  <DialogDescription>Modifica los datos de {editingCompany?.company_name}</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleUpdateCompany} className="space-y-4">
                  {companyFormFieldsJSX(true)}
                  <div className="flex gap-2 justify-end">
                    <Button type="button" variant="outline" onClick={() => setEditingCompany(null)}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={savingCompany}>
                      {savingCompany ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                      Guardar Cambios
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>

            {loadingCompanies ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : companies.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No hay empresas registradas</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {companies.map((company) => (
                  <Card key={company.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{company.company_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {company.contact_email || 'Sin email'}
                            {company.ticker && ` · ${company.ticker}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={company.is_active ? 'default' : 'secondary'}>
                          {company.is_active ? 'Activa' : 'Inactiva'}
                        </Badge>
                        <Badge variant="outline" className={company.plan_type === 'premium' ? 'border-amber-500 text-amber-600' : company.plan_type === 'enterprise' ? 'border-purple-500 text-purple-600' : ''}>
                          {company.plan_type}
                        </Badge>
                        {company.monthly_fee === 0 && company.plan_type !== 'basic' && (
                          <Badge variant="outline" className="border-green-500 text-green-600">
                            <Gift className="h-3 w-3 mr-1" />
                            Cortesía
                          </Badge>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => openEditCompany(company)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ==================== USUARIOS ==================== */}
          <TabsContent value="users">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Usuarios</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={fetchUsers}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button onClick={() => setShowUserForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nuevo Usuario
                </Button>
              </div>
            </div>

            {showUserForm && (
              <Card className="mb-6 border-primary/50">
                <CardHeader>
                  <CardTitle className="text-lg">Nuevo Usuario</CardTitle>
                  <CardDescription>El usuario recibirá un Magic Link para acceder</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateUser} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="user_email">Email *</Label>
                        <Input
                          id="user_email"
                          type="email"
                          value={userForm.email}
                          onChange={(e) => setUserForm(f => ({ ...f, email: e.target.value }))}
                          placeholder="usuario@empresa.com"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="full_name">Nombre completo</Label>
                        <Input
                          id="full_name"
                          value={userForm.full_name}
                          onChange={(e) => setUserForm(f => ({ ...f, full_name: e.target.value }))}
                          placeholder="Juan García"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="user_company">Empresa</Label>
                        <Select 
                          value={userForm.company_id || "_none"} 
                          onValueChange={(v) => setUserForm(f => ({ ...f, company_id: v === "_none" ? "" : v, is_individual: v === "_none" }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar empresa..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">Sin empresa (particular)</SelectItem>
                            {companies.map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2 flex items-end">
                        <div className="flex items-center gap-2">
                          <Switch
                            id="send_magic_link"
                            checked={userForm.send_magic_link}
                            onCheckedChange={(v) => setUserForm(f => ({ ...f, send_magic_link: v }))}
                          />
                          <Label htmlFor="send_magic_link">Enviar Magic Link al crear</Label>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button type="button" variant="outline" onClick={() => setShowUserForm(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={savingUser}>
                        {savingUser ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                        Crear Usuario
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            {/* Edit user dialog */}
            <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Editar Usuario</DialogTitle>
                  <DialogDescription>Modifica los datos de {editingUser?.email}</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleUpdateUser} className="space-y-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input value={userForm.email} disabled className="bg-muted" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit_full_name">Nombre completo</Label>
                      <Input
                        id="edit_full_name"
                        value={userForm.full_name}
                        onChange={(e) => setUserForm(f => ({ ...f, full_name: e.target.value }))}
                        placeholder="Juan García"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit_user_company">Empresa</Label>
                      <Select 
                        value={userForm.company_id || "_none"} 
                        onValueChange={(v) => setUserForm(f => ({ ...f, company_id: v === "_none" ? "" : v, is_individual: v === "_none" }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar empresa..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Sin empresa (particular)</SelectItem>
                          {companies.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="edit_is_active"
                        checked={userForm.is_active}
                        onCheckedChange={(v) => setUserForm(f => ({ ...f, is_active: v }))}
                      />
                      <Label htmlFor="edit_is_active">Usuario activo</Label>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button type="button" variant="outline" onClick={() => setEditingUser(null)}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={savingUser}>
                      {savingUser ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                      Guardar Cambios
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>

            {loadingUsers ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : users.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Users className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No hay usuarios registrados</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {users.map((user) => (
                  <Card key={user.id}>
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                          <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <p className="font-medium">{user.full_name || user.email}</p>
                          <p className="text-sm text-muted-foreground">
                            {user.email}
                            {user.client_companies && ` · ${user.client_companies.company_name}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={user.is_active ? 'default' : 'secondary'}>
                          {user.is_active ? 'Activo' : 'Inactivo'}
                        </Badge>
                        {user.is_individual && <Badge variant="outline">Particular</Badge>}
                                    <Button 
                                      variant="ghost" 
                                      size="sm"
                                      onClick={() => openEditUser(user)}
                                      title="Editar usuario"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button 
                                      variant="ghost" 
                                      size="sm"
                                      onClick={() => handleSendMagicLink(user.id, user.email)}
                                      title="Enviar Magic Link"
                                    >
                                      <Mail className="h-4 w-4 mr-1" />
                                      Enviar Link
                                    </Button>
                                    <Button 
                                      variant="ghost" 
                                      size="sm"
                                      onClick={() => {
                                        setFilterByUserId(user.id);
                                        setFilterByUserName(user.full_name || user.email);
                                        setActiveTab('conversations');
                                      }}
                                      title="Ver conversaciones"
                                    >
                                      <MessageSquare className="h-4 w-4" />
                                    </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ==================== ANALYTICS ==================== */}
          <TabsContent value="analytics">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Analytics de Enriquecimiento por Rol</h2>
              <Button variant="outline" size="sm" onClick={fetchRoleAnalytics}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            {loadingAnalytics ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Summary stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-bold text-primary">{totalEnrichments}</p>
                      <p className="text-sm text-muted-foreground">Total Enriquecimientos</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-bold text-purple-600">{roleStats.length}</p>
                      <p className="text-sm text-muted-foreground">Roles Utilizados</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-bold text-blue-600">
                        {roleStats[0]?.count || 0}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Más usado: {roleStats[0]?.role_name || 'N/A'}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-bold text-green-600">
                        {new Set(roleAnalytics.map(a => a.session_id)).size}
                      </p>
                      <p className="text-sm text-muted-foreground">Sesiones Únicas</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Top roles */}
                {roleStats.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Sparkles className="h-5 w-5 text-amber-500" />
                        Roles Más Utilizados
                      </CardTitle>
                      <CardDescription>
                        Distribución del uso de roles de enriquecimiento
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {roleStats.slice(0, 10).map((stat, index) => {
                          const maxCount = roleStats[0]?.count || 1;
                          const percentage = Math.round((stat.count / maxCount) * 100);
                          return (
                            <div key={stat.role_id} className="space-y-1">
                              <div className="flex justify-between text-sm">
                                <span className="font-medium">
                                  {index + 1}. {stat.role_name}
                                </span>
                                <span className="text-muted-foreground">
                                  {stat.count} uso{stat.count !== 1 ? 's' : ''}
                                </span>
                              </div>
                              <Progress value={percentage} className="h-2" />
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Recent enrichments table */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Enriquecimientos Recientes</CardTitle>
                    <CardDescription>
                      Últimas 50 solicitudes de adaptación por rol
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {roleAnalytics.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No hay datos de enriquecimiento todavía</p>
                        <p className="text-sm">Los analytics se registran cuando los usuarios adaptan respuestas a roles específicos</p>
                      </div>
                    ) : (
                      <ScrollArea className="h-[400px]">
                        <div className="space-y-2">
                          {roleAnalytics.map((analytic) => (
                            <div 
                              key={analytic.id} 
                              className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30 transition-colors"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="outline" className="shrink-0">
                                    {analytic.role_name}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(analytic.enrichment_timestamp).toLocaleString('es-ES')}
                                  </span>
                                </div>
                                <p className="text-sm text-muted-foreground truncate">
                                  {analytic.original_question}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* ==================== SISTEMA ==================== */}
          <TabsContent value="system">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    Vector Store - Base de Conocimiento
                  </CardTitle>
                  <CardDescription>
                    Sincroniza incrementalmente la base de conocimiento del Agente Rix.
                    Solo añade nuevos documentos (nunca borra). Auto-continuación incluida.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Current status */}
                  <div className="p-4 rounded-lg border bg-muted/30">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium">Estado actual</span>
                      <Badge variant={vectorStoreRemaining > 0 ? 'secondary' : 'default'}>
                        {vectorStoreRemaining > 0 ? `${vectorStoreRemaining} pendientes` : 'Sincronizado'}
                      </Badge>
                    </div>
                    <Progress value={vectorStoreProgress} className="h-2 mb-2" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{vectorStoreDocsCreated.toLocaleString()} documentos</span>
                      <span>{vectorStoreTotalRuns.toLocaleString()} rix_runs</span>
                      <span>{Math.round(vectorStoreProgress)}%</span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-4">
                    <Button
                      onClick={handleRunVectorStore}
                      disabled={vectorStoreRunning}
                      className="gap-2"
                    >
                      {vectorStoreRunning ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Sincronizando...
                        </>
                      ) : vectorStoreRemaining > 0 ? (
                        <>
                          <RefreshCw className="h-4 w-4" />
                          Sincronizar ({vectorStoreRemaining} pendientes)
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4" />
                          Verificar sincronización
                        </>
                      )}
                    </Button>
                    
                    {vectorStoreRunning && (
                      <Button variant="outline" onClick={handleStopVectorStore} size="sm">
                        Pausar
                      </Button>
                    )}
                  </div>

                  {/* Processing indicator */}
                  {vectorStoreRunning && (
                    <div className="space-y-3 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                          <span className="font-medium text-blue-700 dark:text-blue-300">
                            Auto-sincronización en curso
                          </span>
                        </div>
                        <span className="text-2xl font-bold text-blue-600">{Math.round(vectorStoreProgress)}%</span>
                      </div>
                      <Progress value={vectorStoreProgress} className="h-3" />
                      <div className="flex justify-between text-sm text-blue-600 dark:text-blue-400">
                        <span>{vectorStoreDocsCreated.toLocaleString()} sincronizados</span>
                        <span>{vectorStoreRemaining.toLocaleString()} pendientes</span>
                      </div>
                    </div>
                  )}

                  {/* Result */}
                  {vectorStoreResult && !vectorStoreRunning && (
                    <div className={`p-4 rounded-lg border ${vectorStoreResult.success ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        {vectorStoreResult.success ? (
                          <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                        ) : (
                          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                        )}
                        <span className="font-medium">
                          {vectorStoreResult.success 
                            ? (vectorStoreResult.complete ? '✅ Sincronización completada' : 'Progreso guardado')
                            : 'Error en el proceso'}
                        </span>
                      </div>
                      {vectorStoreResult.success && (
                        <p className="text-sm text-green-600 dark:text-green-400">
                          {vectorStoreResult.message}
                        </p>
                      )}
                      {vectorStoreResult.error && (
                        <p className="text-sm text-red-600 dark:text-red-400">{vectorStoreResult.error}</p>
                      )}
                    </div>
                  )}

                  {/* Logs */}
                  {vectorStoreLogs.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label>Logs de procesamiento</Label>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => setVectorStoreLogs([])}
                          className="h-6 text-xs"
                        >
                          Limpiar
                        </Button>
                      </div>
                      <ScrollArea className="h-48 rounded-md border bg-muted/30 p-3">
                        <div className="space-y-1 font-mono text-xs">
                          {vectorStoreLogs.map((log, i) => (
                            <div key={i} className={log.includes('❌') ? 'text-red-500' : log.includes('✅') ? 'text-green-500' : log.includes('⏳') ? 'text-amber-500' : ''}>
                              {log}
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}

                  <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                    <p className="font-medium mb-1">ℹ️ ¿Cómo funciona?</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Solo añade documentos nuevos (nunca borra existentes)</li>
                      <li>Procesa en batches de 100 docs con auto-continuación</li>
                      <li>Incluye respuestas completas de ChatGPT, Perplexity, Gemini y DeepSeek</li>
                      <li>Mejora las respuestas del Agente Rix con más contexto</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ==================== CONVERSACIONES ==================== */}
          <TabsContent value="conversations">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold">Conversaciones de Usuarios</h2>
                {filterByUserId && (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-sm">
                      Filtrando: {filterByUserName}
                    </Badge>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => { setFilterByUserId(null); setFilterByUserName(null); }}
                      className="h-6 px-2 text-xs"
                    >
                      ✕ Quitar filtro
                    </Button>
                  </div>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={fetchConversations}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            {loadingConversations ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : conversations.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No hay conversaciones guardadas</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Conversations list */}
                <div className="space-y-3">
                  <h3 className="font-medium text-sm text-muted-foreground mb-2">
                    {filterByUserId 
                      ? `${conversations.filter(c => c.user_id === filterByUserId).length} conversaciones de ${filterByUserName}`
                      : `${conversations.length} conversaciones encontradas`
                    }
                  </h3>
                  <ScrollArea className="h-[600px]">
                    <div className="space-y-2 pr-4">
                      {conversations
                        .filter(c => !filterByUserId || c.user_id === filterByUserId)
                        .map((convo) => (
                        <Card 
                          key={convo.id} 
                          className={`cursor-pointer hover:shadow-md transition-shadow ${selectedConversation === convo.session_id ? 'border-primary ring-1 ring-primary' : ''}`}
                          onClick={() => fetchConversationMessages(convo.session_id)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">
                                  {convo.title || 'Sin título'}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {convo.user_name || convo.user_email}
                                </p>
                              </div>
                              <div className="flex items-center gap-1">
                                {convo.is_starred && (
                                  <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">★</Badge>
                                )}
                                <Badge variant="secondary" className="text-xs">
                                  {convo.messages_count || 0} msg
                                </Badge>
                              </div>
                            </div>
                            <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                              <span>
                                {convo.last_message_at 
                                  ? new Date(convo.last_message_at).toLocaleString('es-ES', { 
                                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' 
                                    })
                                  : 'Sin actividad'}
                              </span>
                              <Button variant="ghost" size="sm" className="h-6 px-2">
                                <Eye className="h-3 w-3" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                </div>

                {/* Messages viewer */}
                <div>
                  <h3 className="font-medium text-sm text-muted-foreground mb-2">
                    {selectedConversation ? 'Mensajes de la conversación' : 'Selecciona una conversación'}
                  </h3>
                  <Card className="h-[600px]">
                    <CardContent className="p-4 h-full">
                      {loadingMessages ? (
                        <div className="flex items-center justify-center h-full">
                          <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                      ) : !selectedConversation ? (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                          <MessageSquare className="h-12 w-12 mb-4 opacity-50" />
                          <p>Haz clic en una conversación para ver sus mensajes</p>
                        </div>
                      ) : conversationMessages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                          <AlertCircle className="h-12 w-12 mb-4 opacity-50" />
                          <p>No se encontraron mensajes para esta sesión</p>
                        </div>
                      ) : (
                        <ScrollArea className="h-full">
                          <div className="space-y-4 pr-4">
                            {conversationMessages.map((msg, idx) => (
                              <div 
                                key={msg.id || idx}
                                className={`p-3 rounded-lg ${
                                  msg.role === 'user' 
                                    ? 'bg-primary/10 ml-8' 
                                    : 'bg-muted mr-8'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <Badge variant={msg.role === 'user' ? 'default' : 'secondary'} className="text-xs">
                                    {msg.role === 'user' ? 'Usuario' : 'Agente Rix'}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {msg.created_at && new Date(msg.created_at).toLocaleTimeString('es-ES', {
                                      hour: '2-digit', minute: '2-digit'
                                    })}
                                  </span>
                                </div>
                                <p className="text-sm whitespace-pre-wrap line-clamp-6">
                                  {msg.content?.slice(0, 500)}{msg.content?.length > 500 ? '...' : ''}
                                </p>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ==================== MARKETING ==================== */}
          <TabsContent value="marketing">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Megaphone className="h-5 w-5 text-primary" />
                  Inbound Marketing por Perfil
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Envía notificaciones personalizadas al chat de cada usuario según su perfil
                </p>
              </div>
            </div>

            {personas.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <Target className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
                  <h3 className="text-lg font-medium mb-2">Primero analiza los perfiles</h3>
                  <p className="text-muted-foreground text-center max-w-md mb-4">
                    Para enviar notificaciones personalizadas, primero debes analizar los perfiles 
                    de usuario en la pestaña "Perfiles".
                  </p>
                  <Button onClick={() => setActiveTab('profiles')}>
                    <UserCircle className="h-4 w-4 mr-2" />
                    Ir a Perfiles
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Enviar notificaciones automáticas */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5" />
                      Notificaciones Automáticas por Perfil
                    </CardTitle>
                    <CardDescription>
                      Genera y envía notificaciones personalizadas según el estereotipo de cada usuario
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="text-sm font-medium">Seleccionar perfiles objetivo (opcional)</Label>
                      <p className="text-xs text-muted-foreground mb-2">
                        Deja vacío para enviar a todos los perfiles
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {personas.map((persona) => (
                          <Badge
                            key={persona.id}
                            variant={selectedMarketingPersonas.includes(persona.id) ? "default" : "outline"}
                            className="cursor-pointer transition-all"
                            style={selectedMarketingPersonas.includes(persona.id) ? { 
                              backgroundColor: persona.color,
                              borderColor: persona.color,
                            } : {}}
                            onClick={() => {
                              setSelectedMarketingPersonas(prev => 
                                prev.includes(persona.id) 
                                  ? prev.filter(p => p !== persona.id)
                                  : [...prev, persona.id]
                              );
                            }}
                          >
                            {persona.emoji} {persona.name} ({persona.userCount})
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <Button 
                      onClick={async () => {
                        setSendingNotifications(true);
                        try {
                          const { data, error } = await supabase.functions.invoke('generate-marketing-notifications', {
                            body: { 
                              action: 'generate_for_all',
                              targetPersonas: selectedMarketingPersonas.length > 0 ? selectedMarketingPersonas : undefined,
                            }
                          });
                          if (error) throw error;
                          setNotificationStats(data);
                          toast({ 
                            title: '✅ Notificaciones enviadas', 
                            description: `${data.notificationsSent} notificaciones a ${data.usersReached} usuarios` 
                          });
                        } catch (err: any) {
                          toast({ title: 'Error', description: err.message, variant: 'destructive' });
                        } finally {
                          setSendingNotifications(false);
                        }
                      }}
                      disabled={sendingNotifications}
                      className="w-full"
                    >
                      {sendingNotifications ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Enviando...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Enviar Notificaciones Personalizadas
                        </>
                      )}
                    </Button>

                    {notificationStats && (
                      <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-900">
                        <h4 className="font-medium text-green-800 dark:text-green-200 mb-2 flex items-center gap-2">
                          <CheckCircle className="h-4 w-4" />
                          Último envío
                        </h4>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">Notificaciones:</span>
                            <span className="ml-2 font-bold">{notificationStats.notificationsSent}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Usuarios:</span>
                            <span className="ml-2 font-bold">{notificationStats.usersReached}</span>
                          </div>
                        </div>
                        {notificationStats.byPersona.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-green-200 dark:border-green-800">
                            <p className="text-xs text-muted-foreground mb-1">Por perfil:</p>
                            <div className="flex flex-wrap gap-1">
                              {notificationStats.byPersona.map((p, idx) => (
                                <Badge key={idx} variant="outline" className="text-xs">
                                  {p.name}: {p.count}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Notificación personalizada */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bell className="h-5 w-5" />
                      Notificación Personalizada
                    </CardTitle>
                    <CardDescription>
                      Crea y envía una notificación manual a usuarios específicos
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label>Título</Label>
                      <Input 
                        placeholder="📢 Título de la notificación..."
                        value={customNotification.title}
                        onChange={(e) => setCustomNotification(prev => ({ ...prev, title: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>Contenido</Label>
                      <Textarea 
                        placeholder="Escribe el mensaje que verán los usuarios en su chat..."
                        value={customNotification.content}
                        onChange={(e) => setCustomNotification(prev => ({ ...prev, content: e.target.value }))}
                        rows={3}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Tipo</Label>
                        <Select 
                          value={customNotification.type}
                          onValueChange={(v) => setCustomNotification(prev => ({ ...prev, type: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="persona_tip">💡 Consejo</SelectItem>
                            <SelectItem value="newsroom">📰 Newsroom</SelectItem>
                            <SelectItem value="data_refresh">🔄 Datos</SelectItem>
                            <SelectItem value="company_alert">🏢 Empresa</SelectItem>
                            <SelectItem value="survey">📋 Encuesta</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Prioridad</Label>
                        <Select 
                          value={customNotification.priority}
                          onValueChange={(v) => setCustomNotification(prev => ({ ...prev, priority: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">Baja</SelectItem>
                            <SelectItem value="normal">Normal</SelectItem>
                            <SelectItem value="high">Alta</SelectItem>
                            <SelectItem value="urgent">Urgente</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <Button 
                      onClick={async () => {
                        if (!customNotification.title || !customNotification.content) {
                          toast({ title: 'Error', description: 'Completa título y contenido', variant: 'destructive' });
                          return;
                        }
                        setSendingNotifications(true);
                        try {
                          const { data, error } = await supabase.functions.invoke('generate-marketing-notifications', {
                            body: { 
                              action: 'send_custom',
                              customNotification,
                              targetPersonas: selectedMarketingPersonas.length > 0 ? selectedMarketingPersonas : undefined,
                            }
                          });
                          if (error) throw error;
                          toast({ 
                            title: '✅ Notificación enviada', 
                            description: `Enviada a ${data.notificationsSent} usuarios` 
                          });
                          setCustomNotification({ title: '', content: '', type: 'persona_tip', priority: 'normal' });
                        } catch (err: any) {
                          toast({ title: 'Error', description: err.message, variant: 'destructive' });
                        } finally {
                          setSendingNotifications(false);
                        }
                      }}
                      disabled={sendingNotifications || !customNotification.title || !customNotification.content}
                      className="w-full"
                      variant="secondary"
                    >
                      {sendingNotifications ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Enviando...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Enviar Notificación Manual
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>

                {/* Templates por perfil */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="h-5 w-5" />
                      Templates de Notificación por Perfil
                    </CardTitle>
                    <CardDescription>
                      Mensajes predefinidos que se envían automáticamente según el comportamiento del usuario
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {[
                        { 
                          emoji: '🚀', 
                          name: 'Usuario Intensivo', 
                          templates: [
                            '📰 Nuevo análisis semanal disponible',
                            '💡 Maximiza tu análisis con exportación PDF',
                            '🎯 Prueba el rol de Analista M&A'
                          ]
                        },
                        { 
                          emoji: '👤', 
                          name: 'Usuario Regular', 
                          templates: [
                            '📊 Descubre el enriquecimiento por rol',
                            '🔄 Datos actualizados esta semana',
                            '📄 Genera tu primer boletín ejecutivo'
                          ]
                        },
                        { 
                          emoji: '🌱', 
                          name: 'Usuario Casual', 
                          templates: [
                            '👋 ¡Bienvenido a RepIndex!',
                            '🎯 Empieza preguntando rankings',
                            '💬 El Agente Rix te ayuda'
                          ]
                        },
                        { 
                          emoji: '💤', 
                          name: 'Usuario Inactivo', 
                          templates: [
                            '🔔 Te echamos de menos',
                            '📰 Novedades de la semana',
                            '🚀 Vuelve a explorar'
                          ]
                        },
                        { 
                          emoji: '📄', 
                          name: 'Generador de Informes', 
                          templates: [
                            '📄 Optimiza tus informes comparativos',
                            '📊 Nuevos datos disponibles',
                            '🎯 Rol ejecutivo recomendado'
                          ]
                        },
                      ].map((profile, idx) => (
                        <div key={idx} className="p-4 border rounded-lg">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-2xl">{profile.emoji}</span>
                            <h4 className="font-medium">{profile.name}</h4>
                          </div>
                          <div className="space-y-1">
                            {profile.templates.map((t, tIdx) => (
                              <p key={tIdx} className="text-xs text-muted-foreground truncate">
                                {t}
                              </p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default Admin;
