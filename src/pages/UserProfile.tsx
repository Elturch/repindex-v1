import React, { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  User, 
  Building2, 
  Mail, 
  Calendar,
  MessageSquare,
  FileText,
  Star,
  Bell,
  Settings,
  BarChart3,
  Save,
  Loader2,
  Languages
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { CHAT_LANGUAGES, ChatLanguage, getSavedLanguage, saveLanguagePreference } from '@/lib/chatLanguages';
import { CHAT_ROLES } from '@/lib/chatRoles';

interface UserStats {
  totalConversations: number;
  starredConversations: number;
  totalDocuments: number;
  starredDocuments: number;
  lastActivity: string | null;
}

interface NotificationPreferences {
  enable_company_alerts: boolean;
  enable_data_refresh_alerts: boolean;
  enable_newsroom_alerts: boolean;
  enable_persona_tips: boolean;
  enable_inactivity_reminders: boolean;
}

interface RolePreferences {
  default_role_id: string | null;
  auto_enrich: boolean;
  favorite_roles: string[];
}

const UserProfile: React.FC = () => {
  const { user, profile, company } = useAuth();
  const { toast } = useToast();
  
  // Profile edit state
  const [fullName, setFullName] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  
  // Stats
  const [stats, setStats] = useState<UserStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  
  // Preferences
  const [chatLanguage, setChatLanguage] = useState<ChatLanguage>(() => getSavedLanguage());
  const [rolePrefs, setRolePrefs] = useState<RolePreferences>({
    default_role_id: null,
    auto_enrich: false,
    favorite_roles: []
  });
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);
  
  // Notifications
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>({
    enable_company_alerts: true,
    enable_data_refresh_alerts: true,
    enable_newsroom_alerts: true,
    enable_persona_tips: true,
    enable_inactivity_reminders: false
  });
  const [isSavingNotifs, setIsSavingNotifs] = useState(false);

  // Load profile data
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
    }
  }, [profile]);

  // Load stats
  useEffect(() => {
    if (user) {
      loadStats();
      loadRolePreferences();
      loadNotificationPreferences();
    }
  }, [user]);

  const loadStats = async () => {
    if (!user) return;
    setIsLoadingStats(true);
    
    try {
      // Fetch conversations count
      const { count: convCount } = await supabase
        .from('user_conversations')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_archived', false);

      const { count: starredConvCount } = await supabase
        .from('user_conversations')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_starred', true);

      // Fetch documents count
      const { count: docCount } = await supabase
        .from('user_documents')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_archived', false);

      const { count: starredDocCount } = await supabase
        .from('user_documents')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_starred', true);

      // Get last activity
      const { data: lastConv } = await supabase
        .from('user_conversations')
        .select('last_message_at')
        .eq('user_id', user.id)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .single();

      setStats({
        totalConversations: convCount || 0,
        starredConversations: starredConvCount || 0,
        totalDocuments: docCount || 0,
        starredDocuments: starredDocCount || 0,
        lastActivity: lastConv?.last_message_at || null
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setIsLoadingStats(false);
    }
  };

  const loadRolePreferences = async () => {
    if (!user) return;
    
    try {
      const { data } = await supabase
        .from('user_role_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (data) {
        setRolePrefs({
          default_role_id: data.default_role_id,
          auto_enrich: data.auto_enrich || false,
          favorite_roles: data.favorite_roles || []
        });
      }
    } catch (error) {
      // No preferences yet, use defaults
    }
  };

  const loadNotificationPreferences = async () => {
    if (!user) return;
    
    try {
      const { data } = await supabase
        .from('user_notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (data) {
        setNotifPrefs({
          enable_company_alerts: data.enable_company_alerts ?? true,
          enable_data_refresh_alerts: data.enable_data_refresh_alerts ?? true,
          enable_newsroom_alerts: data.enable_newsroom_alerts ?? true,
          enable_persona_tips: data.enable_persona_tips ?? true,
          enable_inactivity_reminders: data.enable_inactivity_reminders ?? false
        });
      }
    } catch (error) {
      // No preferences yet, use defaults
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setIsSavingProfile(true);
    
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ full_name: fullName })
        .eq('id', user.id);

      if (error) throw error;

      toast({
        title: "Perfil actualizado",
        description: "Tu nombre se ha guardado correctamente.",
      });
    } catch (error) {
      console.error('Error saving profile:', error);
      toast({
        title: "Error",
        description: "No se pudo guardar el perfil.",
        variant: "destructive",
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSavePreferences = async () => {
    if (!user) return;
    setIsSavingPrefs(true);
    
    try {
      // Save language to localStorage
      saveLanguagePreference(chatLanguage.code);
      // Upsert role preferences
      const { error } = await supabase
        .from('user_role_preferences')
        .upsert({
          user_id: user.id,
          default_role_id: rolePrefs.default_role_id,
          auto_enrich: rolePrefs.auto_enrich,
          favorite_roles: rolePrefs.favorite_roles,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      if (error) throw error;

      toast({
        title: "Preferencias guardadas",
        description: "Tus preferencias del chat se han actualizado.",
      });
    } catch (error) {
      console.error('Error saving preferences:', error);
      toast({
        title: "Error",
        description: "No se pudieron guardar las preferencias.",
        variant: "destructive",
      });
    } finally {
      setIsSavingPrefs(false);
    }
  };

  const handleSaveNotifications = async () => {
    if (!user) return;
    setIsSavingNotifs(true);
    
    try {
      const { error } = await supabase
        .from('user_notification_preferences')
        .upsert({
          user_id: user.id,
          ...notifPrefs,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      if (error) throw error;

      toast({
        title: "Notificaciones actualizadas",
        description: "Tus preferencias de notificación se han guardado.",
      });
    } catch (error) {
      console.error('Error saving notifications:', error);
      toast({
        title: "Error",
        description: "No se pudieron guardar las notificaciones.",
        variant: "destructive",
      });
    } finally {
      setIsSavingNotifs(false);
    }
  };

  return (
    <Layout title="Mi Perfil">
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Mi Perfil</h1>
          <p className="text-muted-foreground">
            Gestiona tu cuenta, preferencias y notificaciones
          </p>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Perfil</span>
            </TabsTrigger>
            <TabsTrigger value="preferences" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Preferencias</span>
            </TabsTrigger>
            <TabsTrigger value="stats" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Estadísticas</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              <span className="hidden sm:inline">Alertas</span>
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Datos Personales
                </CardTitle>
                <CardDescription>
                  Tu información básica de usuario
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="fullName">Nombre completo</Label>
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Tu nombre"
                    />
                  </div>
                  
                  <div className="grid gap-2">
                    <Label>Email</Label>
                    <div className="flex items-center gap-2 p-3 rounded-md bg-muted">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{profile?.email}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      El email no se puede cambiar
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="flex justify-end">
                  <Button onClick={handleSaveProfile} disabled={isSavingProfile}>
                    {isSavingProfile ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Guardar cambios
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Company Info Card */}
            {company && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Mi Empresa
                  </CardTitle>
                  <CardDescription>
                    Información de tu organización
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium">{company.company_name}</p>
                      {company.ticker && (
                        <Badge variant="secondary" className="mt-1">
                          {company.ticker}
                        </Badge>
                      )}
                    </div>
                    <Badge variant="outline">
                      {company.plan_type || 'Plan activo'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Preferences Tab */}
          <TabsContent value="preferences" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Languages className="h-5 w-5" />
                  Idioma del Chat
                </CardTitle>
                <CardDescription>
                  Elige el idioma en el que quieres interactuar con el Agente Rix
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Select
                  value={chatLanguage.code}
                  onValueChange={(code) => {
                    const lang = CHAT_LANGUAGES.find(l => l.code === code);
                    if (lang) setChatLanguage(lang);
                  }}
                >
                  <SelectTrigger className="w-full max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHAT_LANGUAGES.map((lang) => (
                      <SelectItem key={lang.code} value={lang.code}>
                        <span className="flex items-center gap-2">
                          <span>{lang.flag}</span>
                          <span>{lang.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Rol Profesional por Defecto
                </CardTitle>
                <CardDescription>
                  Selecciona tu rol para obtener respuestas más relevantes
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select
                  value={rolePrefs.default_role_id || 'none'}
                  onValueChange={(value) => setRolePrefs(prev => ({
                    ...prev,
                    default_role_id: value === 'none' ? null : value
                  }))}
                >
                  <SelectTrigger className="w-full max-w-xs">
                    <SelectValue placeholder="Sin rol predeterminado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin rol predeterminado</SelectItem>
                    {CHAT_ROLES.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        <span className="flex items-center gap-2">
                          <span>{role.emoji}</span>
                          <span>{role.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex items-center justify-between p-4 rounded-lg border">
                  <div>
                    <p className="font-medium">Enriquecimiento automático</p>
                    <p className="text-sm text-muted-foreground">
                      Aplicar automáticamente el rol a todas las respuestas
                    </p>
                  </div>
                  <Switch
                    checked={rolePrefs.auto_enrich}
                    onCheckedChange={(checked) => setRolePrefs(prev => ({
                      ...prev,
                      auto_enrich: checked
                    }))}
                    disabled={!rolePrefs.default_role_id}
                  />
                </div>

                <Separator />

                <div className="flex justify-end">
                  <Button onClick={handleSavePreferences} disabled={isSavingPrefs}>
                    {isSavingPrefs ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Guardar preferencias
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Stats Tab */}
          <TabsContent value="stats" className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 text-primary" />
                    {isLoadingStats ? (
                      <Skeleton className="h-8 w-12 mx-auto" />
                    ) : (
                      <p className="text-3xl font-bold">{stats?.totalConversations || 0}</p>
                    )}
                    <p className="text-sm text-muted-foreground">Conversaciones</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <Star className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
                    {isLoadingStats ? (
                      <Skeleton className="h-8 w-12 mx-auto" />
                    ) : (
                      <p className="text-3xl font-bold">{stats?.starredConversations || 0}</p>
                    )}
                    <p className="text-sm text-muted-foreground">Guardadas</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <FileText className="h-8 w-8 mx-auto mb-2 text-blue-500" />
                    {isLoadingStats ? (
                      <Skeleton className="h-8 w-12 mx-auto" />
                    ) : (
                      <p className="text-3xl font-bold">{stats?.totalDocuments || 0}</p>
                    )}
                    <p className="text-sm text-muted-foreground">Documentos</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <Calendar className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    {isLoadingStats ? (
                      <Skeleton className="h-8 w-12 mx-auto" />
                    ) : (
                      <p className="text-sm font-medium">
                        {stats?.lastActivity 
                          ? format(new Date(stats.lastActivity), 'dd MMM yyyy', { locale: es })
                          : 'Sin actividad'}
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground">Última actividad</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Resumen de Actividad</CardTitle>
                <CardDescription>
                  Tu uso de la plataforma RepIndex
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <MessageSquare className="h-5 w-5 text-muted-foreground" />
                      <span>Conversaciones activas</span>
                    </div>
                    <Badge variant="secondary">
                      {isLoadingStats ? '...' : stats?.totalConversations || 0}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <span>Boletines generados</span>
                    </div>
                    <Badge variant="secondary">
                      {isLoadingStats ? '...' : stats?.totalDocuments || 0}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <Star className="h-5 w-5 text-muted-foreground" />
                      <span>Elementos favoritos</span>
                    </div>
                    <Badge variant="secondary">
                      {isLoadingStats ? '...' : (stats?.starredConversations || 0) + (stats?.starredDocuments || 0)}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Preferencias de Notificaciones
                </CardTitle>
                <CardDescription>
                  Configura qué alertas quieres recibir
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg border">
                  <div>
                    <p className="font-medium">Alertas de empresas</p>
                    <p className="text-sm text-muted-foreground">
                      Cambios significativos en empresas que sigues
                    </p>
                  </div>
                  <Switch
                    checked={notifPrefs.enable_company_alerts}
                    onCheckedChange={(checked) => setNotifPrefs(prev => ({
                      ...prev,
                      enable_company_alerts: checked
                    }))}
                  />
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg border">
                  <div>
                    <p className="font-medium">Nuevos datos disponibles</p>
                    <p className="text-sm text-muted-foreground">
                      Aviso cuando se actualizan las lecturas semanales
                    </p>
                  </div>
                  <Switch
                    checked={notifPrefs.enable_data_refresh_alerts}
                    onCheckedChange={(checked) => setNotifPrefs(prev => ({
                      ...prev,
                      enable_data_refresh_alerts: checked
                    }))}
                  />
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg border">
                  <div>
                    <p className="font-medium">Newsroom</p>
                    <p className="text-sm text-muted-foreground">
                      Nuevas publicaciones en la sala de prensa
                    </p>
                  </div>
                  <Switch
                    checked={notifPrefs.enable_newsroom_alerts}
                    onCheckedChange={(checked) => setNotifPrefs(prev => ({
                      ...prev,
                      enable_newsroom_alerts: checked
                    }))}
                  />
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg border">
                  <div>
                    <p className="font-medium">Tips personalizados</p>
                    <p className="text-sm text-muted-foreground">
                      Sugerencias basadas en tu perfil de uso
                    </p>
                  </div>
                  <Switch
                    checked={notifPrefs.enable_persona_tips}
                    onCheckedChange={(checked) => setNotifPrefs(prev => ({
                      ...prev,
                      enable_persona_tips: checked
                    }))}
                  />
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg border">
                  <div>
                    <p className="font-medium">Recordatorios de inactividad</p>
                    <p className="text-sm text-muted-foreground">
                      Aviso si no usas la plataforma en un tiempo
                    </p>
                  </div>
                  <Switch
                    checked={notifPrefs.enable_inactivity_reminders}
                    onCheckedChange={(checked) => setNotifPrefs(prev => ({
                      ...prev,
                      enable_inactivity_reminders: checked
                    }))}
                  />
                </div>

                <Separator />

                <div className="flex justify-end">
                  <Button onClick={handleSaveNotifications} disabled={isSavingNotifs}>
                    {isSavingNotifs ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Guardar notificaciones
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default UserProfile;
