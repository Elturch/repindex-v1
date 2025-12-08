import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { 
  Bell, Mail, MousePointer, XCircle, CheckCircle, Clock, Users,
  RefreshCw, TrendingUp, BarChart3, Target, AlertTriangle
} from 'lucide-react';
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';

interface Notification {
  id: string;
  user_id: string;
  title: string;
  content: string;
  notification_type: string;
  priority: string;
  is_read: boolean;
  is_dismissed: boolean;
  created_at: string;
  read_at: string | null;
  dismissed_at: string | null;
}

interface NotificationAnalytic {
  id: string;
  user_id: string;
  notification_id: string | null;
  campaign_id: string | null;
  event_type: string;
  event_data: unknown;
  created_at: string;
}

interface EngagementScore {
  user_id: string;
  lifecycle_stage: string | null;
  engagement_score: number | null;
  notifications_sent_24h: number | null;
  notifications_sent_7d: number | null;
  notifications_sent_30d: number | null;
}

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

const LIFECYCLE_LABELS: Record<string, string> = {
  power_user: '⭐ Power User',
  engaged: '🔥 Engaged',
  active: '✅ Active',
  new: '🆕 New',
  at_risk: '⚠️ At Risk',
  churned: '❌ Churned'
};

const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  newsroom: '📰 Newsroom',
  data_refresh: '📊 Data Refresh',
  inactivity: '⏰ Inactividad',
  company_alert: '🏢 Alerta Empresa',
  persona_tip: '💡 Tip Personalizado',
  feature_discovery: '🎯 Feature Discovery',
  engagement: '💬 Engagement',
  survey: '📝 Encuesta'
};

export function InboundDashboard() {
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [analytics, setAnalytics] = useState<NotificationAnalytic[]>([]);
  const [engagementScores, setEngagementScores] = useState<EngagementScore[]>([]);
  const [userProfiles, setUserProfiles] = useState<Record<string, UserProfile>>({});
  
  const fetchData = async () => {
    setLoading(true);
    try {
      const startDate = subDays(new Date(), 30);

      // Fetch notifications
      const { data: notifs } = await supabase
        .from('user_notifications')
        .select('*')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(1000);
      setNotifications(notifs || []);

      // Fetch analytics
      const { data: analyt } = await supabase
        .from('notification_analytics')
        .select('*')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(2000);
      setAnalytics(analyt || []);

      // Fetch engagement scores
      const { data: scores } = await supabase
        .from('user_engagement_scores')
        .select('*');
      setEngagementScores(scores || []);

      // Fetch user profiles
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, email, full_name');
      const profileMap: Record<string, UserProfile> = {};
      profiles?.forEach(p => { profileMap[p.id] = p; });
      setUserProfiles(profileMap);

    } catch (error) {
      console.error('Error fetching inbound data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Computed metrics
  const metrics = useMemo(() => {
    const total = notifications.length;
    const read = notifications.filter(n => n.is_read).length;
    const dismissed = notifications.filter(n => n.is_dismissed).length;
    const clicked = analytics.filter(a => a.event_type === 'clicked').length;
    
    const delivered24h = notifications.filter(n => 
      new Date(n.created_at) >= subDays(new Date(), 1)
    ).length;
    const delivered7d = notifications.filter(n => 
      new Date(n.created_at) >= subDays(new Date(), 7)
    ).length;
    
    return {
      total,
      delivered24h,
      delivered7d,
      read,
      dismissed,
      clicked,
      openRate: total > 0 ? ((read / total) * 100).toFixed(1) : '0',
      ctr: read > 0 ? ((clicked / read) * 100).toFixed(1) : '0',
      dismissRate: total > 0 ? ((dismissed / total) * 100).toFixed(1) : '0'
    };
  }, [notifications, analytics]);

  // Notifications by type
  const byTypeData = useMemo(() => {
    const counts: Record<string, { sent: number; read: number; clicked: number }> = {};
    
    notifications.forEach(n => {
      if (!counts[n.notification_type]) {
        counts[n.notification_type] = { sent: 0, read: 0, clicked: 0 };
      }
      counts[n.notification_type].sent++;
      if (n.is_read) counts[n.notification_type].read++;
    });
    
    analytics.filter(a => a.event_type === 'clicked').forEach(a => {
      const notif = notifications.find(n => n.id === a.notification_id);
      if (notif && counts[notif.notification_type]) {
        counts[notif.notification_type].clicked++;
      }
    });
    
    return Object.entries(counts).map(([type, data]) => ({
      type: NOTIFICATION_TYPE_LABELS[type] || type,
      ...data,
      openRate: data.sent > 0 ? Math.round((data.read / data.sent) * 100) : 0
    })).sort((a, b) => b.sent - a.sent);
  }, [notifications, analytics]);

  // Weekly trend
  const weeklyTrend = useMemo(() => {
    const days: { date: string; sent: number; opened: number; clicked: number }[] = [];
    
    for (let i = 6; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const dayStart = startOfDay(date);
      const dayEnd = endOfDay(date);
      
      const dayNotifs = notifications.filter(n => {
        const d = new Date(n.created_at);
        return d >= dayStart && d <= dayEnd;
      });
      
      const dayClicks = analytics.filter(a => {
        const d = new Date(a.created_at);
        return d >= dayStart && d <= dayEnd && a.event_type === 'clicked';
      });
      
      days.push({
        date: format(date, 'EEE', { locale: es }),
        sent: dayNotifs.length,
        opened: dayNotifs.filter(n => n.is_read).length,
        clicked: dayClicks.length
      });
    }
    
    return days;
  }, [notifications, analytics]);

  // Lifecycle breakdown
  const lifecycleData = useMemo(() => {
    const stages: Record<string, { users: number; sent: number; read: number }> = {};
    
    engagementScores.forEach(e => {
      const stage = e.lifecycle_stage || 'unknown';
      if (!stages[stage]) {
        stages[stage] = { users: 0, sent: 0, read: 0 };
      }
      stages[stage].users++;
      stages[stage].sent += (e.notifications_sent_30d || 0);
    });
    
    // Add read counts from notifications
    notifications.forEach(n => {
      const score = engagementScores.find(e => e.user_id === n.user_id);
      const stage = score?.lifecycle_stage || 'unknown';
      if (stages[stage] && n.is_read) {
        stages[stage].read++;
      }
    });
    
    return Object.entries(stages)
      .filter(([stage]) => stage !== 'unknown')
      .map(([stage, data]) => ({
        stage: LIFECYCLE_LABELS[stage] || stage,
        ...data,
        openRate: data.sent > 0 ? Math.round((data.read / data.sent) * 100) : 0
      }))
      .sort((a, b) => b.users - a.users);
  }, [engagementScores, notifications]);

  // Recent notifications
  const recentNotifications = useMemo(() => {
    return notifications.slice(0, 50).map(n => ({
      ...n,
      userName: userProfiles[n.user_id]?.full_name || userProfiles[n.user_id]?.email || 'Unknown'
    }));
  }, [notifications, userProfiles]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Inbound Marketing</h2>
          <p className="text-muted-foreground">Métricas de notificaciones y engagement</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">Enviadas (30d)</span>
            </div>
            <p className="text-2xl font-bold mt-1">{metrics.total}</p>
            <p className="text-xs text-muted-foreground">{metrics.delivered24h} hoy / {metrics.delivered7d} esta semana</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Open Rate</span>
            </div>
            <p className="text-2xl font-bold mt-1">{metrics.openRate}%</p>
            <p className="text-xs text-muted-foreground">{metrics.read} leídas</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <MousePointer className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">CTR</span>
            </div>
            <p className="text-2xl font-bold mt-1">{metrics.ctr}%</p>
            <p className="text-xs text-muted-foreground">{metrics.clicked} clicks</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="text-sm text-muted-foreground">Dismiss Rate</span>
            </div>
            <p className="text-2xl font-bold mt-1">{metrics.dismissRate}%</p>
            <p className="text-xs text-muted-foreground">{metrics.dismissed} descartadas</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-chart-4" />
              <span className="text-sm text-muted-foreground">Usuarios Tracked</span>
            </div>
            <p className="text-2xl font-bold mt-1">{engagementScores.length}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-chart-5" />
              <span className="text-sm text-muted-foreground">Tipos Usados</span>
            </div>
            <p className="text-2xl font-bold mt-1">{byTypeData.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Tendencia Semanal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={weeklyTrend}>
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
                <Line type="monotone" dataKey="sent" name="Enviadas" stroke="hsl(var(--primary))" strokeWidth={2} />
                <Line type="monotone" dataKey="opened" name="Abiertas" stroke="hsl(var(--chart-2))" strokeWidth={2} />
                <Line type="monotone" dataKey="clicked" name="Clicks" stroke="hsl(var(--chart-3))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* By Type */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Por Tipo de Notificación
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={byTypeData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" className="text-xs" />
                <YAxis type="category" dataKey="type" className="text-xs" width={120} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }} 
                />
                <Legend />
                <Bar dataKey="sent" name="Enviadas" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                <Bar dataKey="read" name="Leídas" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Lifecycle & Recent */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lifecycle Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" />
              Métricas por Lifecycle Stage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {lifecycleData.map(stage => (
                <div key={stage.stage} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{stage.stage}</span>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-muted-foreground">{stage.users} usuarios</span>
                      <Badge variant={stage.openRate >= 50 ? 'default' : 'secondary'}>
                        {stage.openRate}% open
                      </Badge>
                    </div>
                  </div>
                  <Progress value={stage.openRate} className="h-2" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{stage.sent} enviadas</span>
                    <span>{stage.read} leídas</span>
                  </div>
                </div>
              ))}
              {lifecycleData.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No hay datos de lifecycle
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notificaciones Recientes
            </CardTitle>
            <CardDescription>Últimas 50 notificaciones enviadas</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[350px]">
              <div className="space-y-2">
                {recentNotifications.map(notif => (
                  <div key={notif.id} className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
                    <div className="mt-1">
                      {notif.is_read ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : notif.is_dismissed ? (
                        <XCircle className="h-4 w-4 text-red-500" />
                      ) : (
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{notif.userName}</span>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {NOTIFICATION_TYPE_LABELS[notif.notification_type] || notif.notification_type}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{notif.title}</p>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(notif.created_at), "dd/MM HH:mm", { locale: es })}
                    </div>
                  </div>
                ))}
                {recentNotifications.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No hay notificaciones recientes
                  </p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Fatigue Configuration Display */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Configuración de Fatigue Management
          </CardTitle>
          <CardDescription>Límites actuales por lifecycle stage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { stage: 'power_user', perDay: 2, perWeek: 8, minHours: 4 },
              { stage: 'engaged', perDay: 2, perWeek: 6, minHours: 6 },
              { stage: 'active', perDay: 1, perWeek: 4, minHours: 8 },
              { stage: 'new', perDay: 1, perWeek: 3, minHours: 12 },
              { stage: 'at_risk', perDay: 1, perWeek: 2, minHours: 24 },
              { stage: 'churned', perDay: 0, perWeek: 1, minHours: 72 }
            ].map(config => (
              <div key={config.stage} className="p-3 bg-muted/50 rounded-lg">
                <p className="text-sm font-medium">{LIFECYCLE_LABELS[config.stage]}</p>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <p>{config.perDay}/día</p>
                  <p>{config.perWeek}/semana</p>
                  <p>Min {config.minHours}h entre</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
