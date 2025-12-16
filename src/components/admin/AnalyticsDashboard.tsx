import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { 
  Users, Eye, MessageCircle, FileText, Clock, Monitor, Smartphone, Tablet,
  RefreshCw, TrendingUp, Calendar, Activity
} from 'lucide-react';
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';

interface ActivityLog {
  id: string;
  user_id: string | null;
  session_id: string;
  event_type: string;
  event_data: unknown;
  page_path: string | null;
  device_type: string | null;
  browser: string | null;
  created_at: string;
  time_on_page_seconds: number | null;
}

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
}

interface UserActivitySummary {
  user_id: string;
  email: string;
  full_name: string | null;
  last_activity: string;
  sessions_today: number;
  page_views: number;
  chat_messages: number;
  documents: number;
  lifecycle_stage?: string;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export function AnalyticsDashboard() {
  const [loading, setLoading] = useState(true);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [userProfiles, setUserProfiles] = useState<Record<string, UserProfile>>({});
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month'>('week');
  
  const fetchData = async () => {
    setLoading(true);
    try {
      const daysBack = dateRange === 'today' ? 1 : dateRange === 'week' ? 7 : 30;
      const startDate = subDays(new Date(), daysBack);

      // Fetch activity logs
      const { data: logs, error: logsError } = await supabase
        .from('user_activity_logs')
        .select('*')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(5000);

      if (logsError) throw logsError;
      setActivityLogs(logs || []);

      // Fetch user profiles for mapping
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, email, full_name');
      
      const profileMap: Record<string, UserProfile> = {};
      profiles?.forEach(p => { profileMap[p.id] = p; });
      setUserProfiles(profileMap);

    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [dateRange]);

  // Computed metrics
  const metrics = useMemo(() => {
    const today = startOfDay(new Date());
    const todayLogs = activityLogs.filter(l => new Date(l.created_at) >= today);
    
    const uniqueUsers = new Set(activityLogs.filter(l => l.user_id).map(l => l.user_id)).size;
    const uniqueUsersToday = new Set(todayLogs.filter(l => l.user_id).map(l => l.user_id)).size;
    const uniqueSessions = new Set(activityLogs.map(l => l.session_id)).size;
    const pageViews = activityLogs.filter(l => l.event_type === 'page_view').length;
    const chatMessages = activityLogs.filter(l => l.event_type === 'chat_message').length;
    const documents = activityLogs.filter(l => l.event_type === 'document_generated').length;
    
    // Average session duration
    const sessionEnds = activityLogs.filter(l => l.event_type === 'session_end');
    const avgDuration = sessionEnds.length > 0
      ? Math.round(sessionEnds.reduce((sum, l) => sum + ((l.event_data as { duration_seconds?: number })?.duration_seconds || 0), 0) / sessionEnds.length)
      : 0;

    return { uniqueUsers, uniqueUsersToday, uniqueSessions, pageViews, chatMessages, documents, avgDuration };
  }, [activityLogs]);

  // Daily activity chart data
  const dailyData = useMemo(() => {
    const days = dateRange === 'today' ? 1 : dateRange === 'week' ? 7 : 30;
    const data: { date: string; sessions: number; views: number; authenticated: number }[] = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const dayStart = startOfDay(date);
      const dayEnd = endOfDay(date);
      
      const dayLogs = activityLogs.filter(l => {
        const logDate = new Date(l.created_at);
        return logDate >= dayStart && logDate <= dayEnd;
      });
      
      data.push({
        date: format(date, 'dd/MM', { locale: es }),
        sessions: new Set(dayLogs.map(l => l.session_id)).size,
        views: dayLogs.filter(l => l.event_type === 'page_view').length,
        authenticated: new Set(dayLogs.filter(l => l.user_id).map(l => l.user_id)).size
      });
    }
    
    return data;
  }, [activityLogs, dateRange]);

  // Hourly activity
  const hourlyData = useMemo(() => {
    const hours: { hour: string; events: number }[] = [];
    for (let h = 0; h < 24; h++) {
      const count = activityLogs.filter(l => new Date(l.created_at).getHours() === h).length;
      hours.push({ hour: `${h}:00`, events: count });
    }
    return hours;
  }, [activityLogs]);

  // Top pages
  const topPages = useMemo(() => {
    const pageCounts: Record<string, { views: number; users: Set<string> }> = {};
    activityLogs.filter(l => l.event_type === 'page_view' && l.page_path).forEach(l => {
      if (!pageCounts[l.page_path!]) {
        pageCounts[l.page_path!] = { views: 0, users: new Set() };
      }
      pageCounts[l.page_path!].views++;
      if (l.user_id) pageCounts[l.page_path!].users.add(l.user_id);
    });
    
    return Object.entries(pageCounts)
      .map(([path, data]) => ({ path, views: data.views, users: data.users.size }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);
  }, [activityLogs]);

  // Device breakdown
  const deviceData = useMemo(() => {
    const devices: Record<string, number> = { desktop: 0, mobile: 0, tablet: 0 };
    activityLogs.forEach(l => {
      if (l.device_type && devices[l.device_type] !== undefined) {
        devices[l.device_type]++;
      }
    });
    return Object.entries(devices).map(([name, value]) => ({ name, value }));
  }, [activityLogs]);

  // User activity summary
  const userSummaries = useMemo(() => {
    const summaries: Record<string, UserActivitySummary> = {};
    const today = startOfDay(new Date());
    
    activityLogs.forEach(l => {
      if (!l.user_id) return;
      
      if (!summaries[l.user_id]) {
        const profile = userProfiles[l.user_id];
        summaries[l.user_id] = {
          user_id: l.user_id,
          email: profile?.email || 'Unknown',
          full_name: profile?.full_name,
          last_activity: l.created_at,
          sessions_today: 0,
          page_views: 0,
          chat_messages: 0,
          documents: 0
        };
      }
      
      if (new Date(l.created_at) > new Date(summaries[l.user_id].last_activity)) {
        summaries[l.user_id].last_activity = l.created_at;
      }
      
      if (l.event_type === 'page_view') summaries[l.user_id].page_views++;
      if (l.event_type === 'chat_message') summaries[l.user_id].chat_messages++;
      if (l.event_type === 'document_generated') summaries[l.user_id].documents++;
      if (l.event_type === 'session_start' && new Date(l.created_at) >= today) {
        summaries[l.user_id].sessions_today++;
      }
    });
    
    return Object.values(summaries).sort((a, b) => 
      new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime()
    );
  }, [activityLogs, userProfiles]);

  // User detail logs
  const userDetailLogs = useMemo(() => {
    if (!selectedUser) return [];
    return activityLogs
      .filter(l => l.user_id === selectedUser)
      .slice(0, 100);
  }, [activityLogs, selectedUser]);

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'page_view': return <Eye className="h-3 w-3" />;
      case 'chat_message': return <MessageCircle className="h-3 w-3" />;
      case 'document_generated': return <FileText className="h-3 w-3" />;
      case 'session_start': return <Activity className="h-3 w-3 text-green-500" />;
      case 'session_end': return <Activity className="h-3 w-3 text-red-500" />;
      default: return <Activity className="h-3 w-3" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Analytics de Usuario</h2>
          <p className="text-muted-foreground">Actividad completa de usuarios en la plataforma</p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={dateRange} onValueChange={(v) => setDateRange(v as typeof dateRange)}>
            <TabsList>
              <TabsTrigger value="today">Hoy</TabsTrigger>
              <TabsTrigger value="week">7 días</TabsTrigger>
              <TabsTrigger value="month">30 días</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">Usuarios Únicos</span>
            </div>
            <p className="text-2xl font-bold mt-1">{metrics.uniqueUsers}</p>
            <p className="text-xs text-muted-foreground">{metrics.uniqueUsersToday} hoy</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-chart-2" />
              <span className="text-sm text-muted-foreground">Sesiones</span>
            </div>
            <p className="text-2xl font-bold mt-1">{metrics.uniqueSessions}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-chart-3" />
              <span className="text-sm text-muted-foreground">Páginas Vistas</span>
            </div>
            <p className="text-2xl font-bold mt-1">{metrics.pageViews}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-chart-4" />
              <span className="text-sm text-muted-foreground">Duración Media</span>
            </div>
            <p className="text-2xl font-bold mt-1">{formatDuration(metrics.avgDuration)}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-chart-5" />
              <span className="text-sm text-muted-foreground">Mensajes Chat</span>
            </div>
            <p className="text-2xl font-bold mt-1">{metrics.chatMessages}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">Documentos</span>
            </div>
            <p className="text-2xl font-bold mt-1">{metrics.documents}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Total Eventos</span>
            </div>
            <p className="text-2xl font-bold mt-1">{activityLogs.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Activity Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Actividad por Día
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }} 
                />
                <Legend />
                <Line type="monotone" dataKey="sessions" name="Sesiones" stroke="hsl(var(--primary))" strokeWidth={2} />
                <Line type="monotone" dataKey="views" name="Vistas" stroke="hsl(var(--chart-2))" strokeWidth={2} />
                <Line type="monotone" dataKey="authenticated" name="Usuarios Auth" stroke="hsl(var(--chart-3))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Hourly Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Actividad por Hora
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="hour" className="text-xs" interval={2} />
                <YAxis className="text-xs" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }} 
                />
                <Bar dataKey="events" name="Eventos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Second Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Pages */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Páginas Más Visitadas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topPages.map((page, i) => (
                <div key={page.path} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-muted-foreground w-6">{i + 1}.</span>
                    <code className="text-sm bg-muted px-2 py-1 rounded">{page.path}</code>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">{page.users} usuarios</span>
                    <Badge variant="secondary">{page.views} vistas</Badge>
                  </div>
                </div>
              ))}
              {topPages.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No hay datos de páginas</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Device Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Dispositivos</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={deviceData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {deviceData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-2">
              <div className="flex items-center gap-1">
                <Monitor className="h-4 w-4" />
                <span className="text-xs">Desktop</span>
              </div>
              <div className="flex items-center gap-1">
                <Smartphone className="h-4 w-4" />
                <span className="text-xs">Mobile</span>
              </div>
              <div className="flex items-center gap-1">
                <Tablet className="h-4 w-4" />
                <span className="text-xs">Tablet</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* User Activity Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Usuarios Activos
          </CardTitle>
          <CardDescription>Haz clic en un usuario para ver su actividad detallada</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <table className="w-full">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b text-left">
                  <th className="py-2 px-2 text-sm font-medium">Usuario</th>
                  <th className="py-2 px-2 text-sm font-medium">Última Actividad</th>
                  <th className="py-2 px-2 text-sm font-medium text-center">Sesiones Hoy</th>
                  <th className="py-2 px-2 text-sm font-medium text-center">Páginas</th>
                  <th className="py-2 px-2 text-sm font-medium text-center">Mensajes</th>
                  <th className="py-2 px-2 text-sm font-medium text-center">Docs</th>
                </tr>
              </thead>
              <tbody>
                {userSummaries.map(user => (
                  <tr 
                    key={user.user_id} 
                    className="border-b border-border/50 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => setSelectedUser(user.user_id)}
                  >
                    <td className="py-3 px-2">
                      <div>
                        <p className="font-medium text-sm">{user.full_name || 'Sin nombre'}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </td>
                    <td className="py-3 px-2 text-sm text-muted-foreground">
                      {format(new Date(user.last_activity), "dd/MM HH:mm", { locale: es })}
                    </td>
                    <td className="py-3 px-2 text-center">
                      <Badge variant="outline">{user.sessions_today}</Badge>
                    </td>
                    <td className="py-3 px-2 text-center text-sm">{user.page_views}</td>
                    <td className="py-3 px-2 text-center text-sm">{user.chat_messages}</td>
                    <td className="py-3 px-2 text-center text-sm">{user.documents}</td>
                  </tr>
                ))}
                {userSummaries.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      No hay datos de usuarios
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* User Detail Modal */}
      <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              Actividad de {userProfiles[selectedUser || '']?.full_name || userProfiles[selectedUser || '']?.email || 'Usuario'}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[500px] mt-4">
            <div className="space-y-2">
              {userDetailLogs.map(log => (
                <div key={log.id} className="flex items-start gap-3 py-2 border-b border-border/50">
                  <div className="mt-1">{getEventIcon(log.event_type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{log.event_type}</Badge>
                      {log.page_path && (
                        <code className="text-xs bg-muted px-1 rounded truncate max-w-[200px]">{log.page_path}</code>
                      )}
                    </div>
                    {Object.keys(log.event_data || {}).length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {JSON.stringify(log.event_data)}
                      </p>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(log.created_at), "dd/MM HH:mm:ss", { locale: es })}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
