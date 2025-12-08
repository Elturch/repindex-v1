import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Send, 
  Loader2, 
  Users, 
  Building2, 
  UserCircle, 
  Target,
  Sparkles,
  CheckCircle,
  Search,
  Mail,
  Filter,
  FileText,
  Clock,
  XCircle,
  Trash2,
  RefreshCw
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  company_id: string | null;
  client_companies: { id: string; company_name: string } | null;
}

interface Company {
  id: string;
  company_name: string;
  is_active: boolean;
}

interface UserPersona {
  id: string;
  name: string;
  emoji: string;
  userCount: number;
  color: string;
}

interface DraftNotification {
  id: string;
  title: string;
  content: string;
  notification_type: string;
  priority: string;
  status: string;
  created_at: string;
  user_id: string;
  metadata: any;
}

interface Props {
  users: UserProfile[];
  companies: Company[];
  personas: UserPersona[];
}

type TargetingMode = 'individual' | 'company' | 'persona' | 'custom' | 'all';
type ViewMode = 'compose' | 'drafts';

const DirectMessageSystem: React.FC<Props> = ({ users, companies, personas }) => {
  const { toast } = useToast();
  
  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('compose');
  
  // Drafts state
  const [drafts, setDrafts] = useState<DraftNotification[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  // Targeting state
  const [targetingMode, setTargetingMode] = useState<TargetingMode>('persona');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [selectedPersonas, setSelectedPersonas] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Message state
  const [messageTitle, setMessageTitle] = useState('');
  const [messageContent, setMessageContent] = useState('');
  const [messageType, setMessageType] = useState('persona_tip');
  const [messagePriority, setMessagePriority] = useState('normal');
  const [useAI, setUseAI] = useState(false);
  const [aiPrompt, setAIPrompt] = useState('');
  
  // UI state
  const [saving, setSaving] = useState(false);
  const [lastSaveResult, setLastSaveResult] = useState<{
    success: boolean;
    count: number;
    timestamp: string;
  } | null>(null);

  // Load drafts on mount and when view changes
  useEffect(() => {
    if (viewMode === 'drafts') {
      loadDrafts();
    }
  }, [viewMode]);

  const loadDrafts = async () => {
    setLoadingDrafts(true);
    try {
      const { data, error } = await supabase
        .from('user_notifications')
        .select('*')
        .eq('status', 'draft')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setDrafts(data || []);
    } catch (err: any) {
      console.error('Error loading drafts:', err);
      toast({ title: 'Error', description: 'No se pudieron cargar los borradores', variant: 'destructive' });
    } finally {
      setLoadingDrafts(false);
    }
  };

  // Filter users based on search
  const filteredUsers = useMemo(() => {
    if (!searchQuery) return users;
    const q = searchQuery.toLowerCase();
    return users.filter(u => 
      u.email.toLowerCase().includes(q) ||
      u.full_name?.toLowerCase().includes(q) ||
      u.client_companies?.company_name.toLowerCase().includes(q)
    );
  }, [users, searchQuery]);

  // Get users by company
  const usersByCompany = useMemo(() => {
    const map = new Map<string, UserProfile[]>();
    users.forEach(u => {
      if (u.company_id) {
        const existing = map.get(u.company_id) || [];
        existing.push(u);
        map.set(u.company_id, existing);
      }
    });
    return map;
  }, [users]);

  // Calculate target count
  const targetCount = useMemo(() => {
    switch (targetingMode) {
      case 'individual':
        return selectedUsers.length;
      case 'company':
        return selectedCompanies.reduce((acc, companyId) => 
          acc + (usersByCompany.get(companyId)?.length || 0), 0
        );
      case 'persona':
        return selectedPersonas.reduce((acc, personaId) => {
          const persona = personas.find(p => p.id === personaId);
          return acc + (persona?.userCount || 0);
        }, 0);
      case 'custom':
        return selectedUsers.length;
      case 'all':
        return users.length;
      default:
        return 0;
    }
  }, [targetingMode, selectedUsers, selectedCompanies, selectedPersonas, personas, users, usersByCompany]);

  // Get target user IDs based on targeting mode
  const getTargetUserIds = (): string[] => {
    let targetUserIds: string[] = [];
    
    switch (targetingMode) {
      case 'individual':
      case 'custom':
        targetUserIds = selectedUsers;
        break;
      case 'company':
        selectedCompanies.forEach(companyId => {
          const companyUsers = usersByCompany.get(companyId) || [];
          targetUserIds.push(...companyUsers.map(u => u.id));
        });
        break;
      case 'all':
        targetUserIds = users.map(u => u.id);
        break;
      case 'persona':
        // For persona, we need to get users with that persona assignment
        // This is handled by the edge function, so we return empty and pass personas separately
        break;
    }
    
    return targetUserIds;
  };

  // Save as draft (creates notifications with status='draft')
  const handleSaveDraft = async () => {
    if (!messageTitle || !messageContent) {
      toast({ title: 'Error', description: 'Completa título y contenido', variant: 'destructive' });
      return;
    }

    if (targetCount === 0) {
      toast({ title: 'Error', description: 'Selecciona al menos un destinatario', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const targetUserIds = getTargetUserIds();

      // For persona targeting, get users from snapshots
      if (targetingMode === 'persona' && selectedPersonas.length > 0) {
        const { data: personaUsers } = await supabase
          .from('user_activity_snapshots')
          .select('user_id')
          .in('persona_id', selectedPersonas);
        
        if (personaUsers) {
          targetUserIds.push(...personaUsers.map(u => u.user_id));
        }
      }

      // Deduplicate
      const uniqueUserIds = [...new Set(targetUserIds)];

      if (uniqueUserIds.length === 0) {
        toast({ title: 'Error', description: 'No hay usuarios válidos para el targeting seleccionado', variant: 'destructive' });
        setSaving(false);
        return;
      }

      // Get current admin user
      const { data: { user } } = await supabase.auth.getUser();

      // Create draft notifications for each user
      const notifications = uniqueUserIds.map(userId => ({
        user_id: userId,
        title: messageTitle,
        content: messageContent,
        notification_type: messageType,
        priority: messagePriority,
        status: 'draft',
        created_by: user?.id,
        metadata: {
          targeting_mode: targetingMode,
          ai_generated: useAI,
          ai_prompt: useAI ? aiPrompt : undefined,
        }
      }));

      const { error } = await supabase
        .from('user_notifications')
        .insert(notifications);

      if (error) throw error;

      setLastSaveResult({
        success: true,
        count: uniqueUserIds.length,
        timestamp: new Date().toISOString(),
      });

      toast({
        title: '📝 Borrador guardado',
        description: `${uniqueUserIds.length} mensaje(s) guardados como borrador pendiente de aprobación`,
      });

      // Reset form
      setMessageTitle('');
      setMessageContent('');
      setAIPrompt('');
      setSelectedUsers([]);
      setSelectedCompanies([]);
      setSelectedPersonas([]);
    } catch (err: any) {
      console.error('Error saving draft:', err);
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Approve and send drafts
  const handleApproveDrafts = async (notificationIds: string[]) => {
    if (notificationIds.length === 0) return;
    
    setApprovingId(notificationIds[0]);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('user_notifications')
        .update({
          status: 'sent',
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
        })
        .in('id', notificationIds);

      if (error) throw error;

      toast({
        title: '✅ Mensajes aprobados y enviados',
        description: `${notificationIds.length} mensaje(s) enviados a usuarios`,
      });

      // Reload drafts
      loadDrafts();
    } catch (err: any) {
      console.error('Error approving drafts:', err);
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setApprovingId(null);
    }
  };

  // Delete draft
  const handleDeleteDraft = async (notificationId: string) => {
    setDeletingId(notificationId);
    try {
      const { error } = await supabase
        .from('user_notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;

      toast({
        title: '🗑️ Borrador eliminado',
      });

      // Reload drafts
      loadDrafts();
    } catch (err: any) {
      console.error('Error deleting draft:', err);
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  // Approve all drafts with same title
  const handleApproveAllByTitle = async (title: string) => {
    const matchingDrafts = drafts.filter(d => d.title === title);
    const ids = matchingDrafts.map(d => d.id);
    await handleApproveDrafts(ids);
  };

  const toggleUser = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const toggleCompany = (companyId: string) => {
    setSelectedCompanies(prev =>
      prev.includes(companyId)
        ? prev.filter(id => id !== companyId)
        : [...prev, companyId]
    );
  };

  const togglePersona = (personaId: string) => {
    setSelectedPersonas(prev =>
      prev.includes(personaId)
        ? prev.filter(id => id !== personaId)
        : [...prev, personaId]
    );
  };

  // Group drafts by title for batch approval
  const draftsByTitle = useMemo(() => {
    const map = new Map<string, DraftNotification[]>();
    drafts.forEach(d => {
      const existing = map.get(d.title) || [];
      existing.push(d);
      map.set(d.title, existing);
    });
    return Array.from(map.entries());
  }, [drafts]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Mensajes Directos (DM)
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Crea borradores y apruébalos antes de enviar
          </p>
        </div>
        
        {/* View mode toggle */}
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'compose' ? 'default' : 'outline'}
            onClick={() => setViewMode('compose')}
            size="sm"
          >
            <FileText className="h-4 w-4 mr-2" />
            Componer
          </Button>
          <Button
            variant={viewMode === 'drafts' ? 'default' : 'outline'}
            onClick={() => setViewMode('drafts')}
            size="sm"
          >
            <Clock className="h-4 w-4 mr-2" />
            Borradores
            {drafts.length > 0 && (
              <Badge variant="secondary" className="ml-2">{draftsByTitle.length}</Badge>
            )}
          </Button>
        </div>
      </div>

      {viewMode === 'drafts' ? (
        /* DRAFTS VIEW */
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Borradores Pendientes
                </CardTitle>
                <CardDescription>
                  Revisa y aprueba los mensajes antes de enviarlos
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={loadDrafts} disabled={loadingDrafts}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loadingDrafts ? 'animate-spin' : ''}`} />
                Actualizar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingDrafts ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : draftsByTitle.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No hay borradores pendientes</p>
                <Button 
                  variant="link" 
                  onClick={() => setViewMode('compose')}
                  className="mt-2"
                >
                  Crear un nuevo mensaje
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {draftsByTitle.map(([title, notifications]) => (
                  <div 
                    key={title} 
                    className="p-4 border rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium truncate">{title}</h4>
                          <Badge variant="secondary">
                            {notifications.length} destinatario(s)
                          </Badge>
                          <Badge variant="outline" className="capitalize">
                            {notifications[0].notification_type.replace('_', ' ')}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {notifications[0].content}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          Creado: {new Date(notifications[0].created_at).toLocaleString('es-ES')}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteDraft(notifications[0].id)}
                          disabled={deletingId === notifications[0].id}
                        >
                          {deletingId === notifications[0].id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-destructive" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleApproveAllByTitle(title)}
                          disabled={approvingId !== null}
                        >
                          {approvingId && notifications.some(n => n.id === approvingId) ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <CheckCircle className="h-4 w-4 mr-2" />
                          )}
                          Aprobar y Enviar
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        /* COMPOSE VIEW */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT: Targeting */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Destinatarios
              </CardTitle>
              <CardDescription>
                Selecciona a quién enviar el mensaje
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Targeting Mode Tabs */}
              <Tabs value={targetingMode} onValueChange={(v) => setTargetingMode(v as TargetingMode)}>
                <TabsList className="grid grid-cols-5 w-full">
                  <TabsTrigger value="persona" className="text-xs">
                    <UserCircle className="h-3 w-3 mr-1" />
                    Perfil
                  </TabsTrigger>
                  <TabsTrigger value="company" className="text-xs">
                    <Building2 className="h-3 w-3 mr-1" />
                    Empresa
                  </TabsTrigger>
                  <TabsTrigger value="individual" className="text-xs">
                    <Users className="h-3 w-3 mr-1" />
                    Individual
                  </TabsTrigger>
                  <TabsTrigger value="custom" className="text-xs">
                    <Filter className="h-3 w-3 mr-1" />
                    Custom
                  </TabsTrigger>
                  <TabsTrigger value="all" className="text-xs">
                    Todos
                  </TabsTrigger>
                </TabsList>

                {/* Persona targeting */}
                <TabsContent value="persona" className="mt-4">
                  <p className="text-sm text-muted-foreground mb-3">
                    Enviar a todos los usuarios de un perfil/estereotipo
                  </p>
                  {personas.length === 0 ? (
                    <p className="text-sm text-amber-600">
                      ⚠️ Primero analiza los perfiles de usuario en la pestaña "Perfiles"
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {personas.map(persona => (
                        <Badge
                          key={persona.id}
                          variant={selectedPersonas.includes(persona.id) ? "default" : "outline"}
                          className="cursor-pointer transition-all py-2 px-3"
                          style={selectedPersonas.includes(persona.id) ? {
                            backgroundColor: persona.color,
                            borderColor: persona.color,
                          } : {}}
                          onClick={() => togglePersona(persona.id)}
                        >
                          {persona.emoji} {persona.name}
                          <span className="ml-1 opacity-70">({persona.userCount})</span>
                        </Badge>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Company targeting */}
                <TabsContent value="company" className="mt-4">
                  <p className="text-sm text-muted-foreground mb-3">
                    Enviar a todos los usuarios de una empresa
                  </p>
                  <ScrollArea className="h-[200px]">
                    <div className="space-y-2">
                      {companies.filter(c => c.is_active).map(company => {
                        const userCount = usersByCompany.get(company.id)?.length || 0;
                        return (
                          <div 
                            key={company.id}
                            className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                              selectedCompanies.includes(company.id) 
                                ? 'border-primary bg-primary/5' 
                                : 'hover:bg-muted/50'
                            }`}
                            onClick={() => toggleCompany(company.id)}
                          >
                            <div className="flex items-center gap-2">
                              <Checkbox 
                                checked={selectedCompanies.includes(company.id)}
                                onCheckedChange={() => toggleCompany(company.id)}
                              />
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{company.company_name}</span>
                            </div>
                            <Badge variant="secondary">{userCount} usuarios</Badge>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* Individual targeting */}
                <TabsContent value="individual" className="mt-4">
                  <p className="text-sm text-muted-foreground mb-3">
                    Enviar a un usuario específico
                  </p>
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por email o nombre..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <ScrollArea className="h-[180px]">
                    <div className="space-y-1">
                      {filteredUsers.slice(0, 20).map(user => (
                        <div
                          key={user.id}
                          className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-all ${
                            selectedUsers.includes(user.id)
                              ? 'bg-primary/10 border border-primary'
                              : 'hover:bg-muted'
                          }`}
                          onClick={() => toggleUser(user.id)}
                        >
                          <Checkbox 
                            checked={selectedUsers.includes(user.id)}
                            onCheckedChange={() => toggleUser(user.id)}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {user.full_name || user.email}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {user.email}
                              {user.client_companies && ` • ${user.client_companies.company_name}`}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* Custom targeting (multi-select users) */}
                <TabsContent value="custom" className="mt-4">
                  <p className="text-sm text-muted-foreground mb-3">
                    Selecciona múltiples usuarios manualmente
                  </p>
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar usuarios..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  {selectedUsers.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {selectedUsers.map(userId => {
                        const user = users.find(u => u.id === userId);
                        return (
                          <Badge 
                            key={userId} 
                            variant="secondary"
                            className="cursor-pointer"
                            onClick={() => toggleUser(userId)}
                          >
                            {user?.full_name || user?.email} ✕
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                  <ScrollArea className="h-[140px]">
                    <div className="space-y-1">
                      {filteredUsers.map(user => (
                        <div
                          key={user.id}
                          className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-all ${
                            selectedUsers.includes(user.id)
                              ? 'bg-primary/10'
                              : 'hover:bg-muted'
                          }`}
                          onClick={() => toggleUser(user.id)}
                        >
                          <Checkbox 
                            checked={selectedUsers.includes(user.id)}
                            onCheckedChange={() => toggleUser(user.id)}
                          />
                          <span className="text-sm truncate">
                            {user.full_name || user.email}
                          </span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* All users */}
                <TabsContent value="all" className="mt-4">
                  <div className="p-6 text-center bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                    <Users className="h-12 w-12 text-amber-500 mx-auto mb-3" />
                    <h4 className="font-medium text-amber-800 dark:text-amber-200">
                      Enviar a todos los usuarios
                    </h4>
                    <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                      El mensaje se enviará a los {users.length} usuarios activos
                    </p>
                  </div>
                </TabsContent>
              </Tabs>

              {/* Target count indicator */}
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <span className="text-sm text-muted-foreground">Destinatarios seleccionados:</span>
                <Badge variant={targetCount > 0 ? "default" : "secondary"} className="text-lg px-3">
                  {targetCount}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* RIGHT: Message composition */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Componer Mensaje
              </CardTitle>
              <CardDescription>
                Escribe el mensaje (se guardará como borrador)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* AI Toggle */}
              <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-medium">Generar con IA</span>
                </div>
                <Switch checked={useAI} onCheckedChange={setUseAI} />
              </div>

              {useAI && (
                <div>
                  <Label>Prompt para IA</Label>
                  <Textarea
                    placeholder="Describe qué tipo de mensaje quieres generar. Ej: 'Un mensaje motivando a usar la función de boletines ejecutivos'"
                    value={aiPrompt}
                    onChange={(e) => setAIPrompt(e.target.value)}
                    rows={2}
                  />
                </div>
              )}

              <div>
                <Label>Título del mensaje</Label>
                <Input
                  placeholder="📢 Título con emoji..."
                  value={messageTitle}
                  onChange={(e) => setMessageTitle(e.target.value)}
                />
              </div>

              <div>
                <Label>Contenido</Label>
                <Textarea
                  placeholder="Escribe el mensaje que verán los usuarios..."
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tipo</Label>
                  <Select value={messageType} onValueChange={setMessageType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="persona_tip">💡 Consejo</SelectItem>
                      <SelectItem value="newsroom">📰 Newsroom</SelectItem>
                      <SelectItem value="data_refresh">🔄 Datos</SelectItem>
                      <SelectItem value="company_alert">🏢 Empresa</SelectItem>
                      <SelectItem value="feature_discovery">🚀 Funcionalidad</SelectItem>
                      <SelectItem value="engagement">📊 Engagement</SelectItem>
                      <SelectItem value="survey">📋 Encuesta</SelectItem>
                      <SelectItem value="announcement">📣 Anuncio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Prioridad</Label>
                  <Select value={messagePriority} onValueChange={setMessagePriority}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">🔵 Baja</SelectItem>
                      <SelectItem value="normal">🟢 Normal</SelectItem>
                      <SelectItem value="high">🟠 Alta</SelectItem>
                      <SelectItem value="urgent">🔴 Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Info box about draft workflow */}
              <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  📝 Los mensajes se guardan como <strong>borrador</strong> y requieren aprobación antes de enviarse a los usuarios.
                </p>
              </div>

              <Button
                onClick={handleSaveDraft}
                disabled={saving || targetCount === 0 || !messageTitle || !messageContent}
                className="w-full"
                size="lg"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Guardar Borrador ({targetCount} destinatario(s))
                  </>
                )}
              </Button>

              {lastSaveResult && lastSaveResult.success && (
                <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-900">
                  <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200">
                    <FileText className="h-4 w-4" />
                    <span className="font-medium">Borrador guardado</span>
                  </div>
                  <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                    {lastSaveResult.count} mensaje(s) pendientes de aprobación
                  </p>
                  <Button 
                    variant="link" 
                    size="sm" 
                    className="mt-1 p-0 h-auto text-blue-600"
                    onClick={() => setViewMode('drafts')}
                  >
                    Ver borradores →
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default DirectMessageSystem;
