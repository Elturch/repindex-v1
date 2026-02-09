import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Newspaper, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface UserWithPressRole {
  id: string;
  email: string;
  full_name: string | null;
  hasPress: boolean;
}

export function RixPressUsersPanel() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserWithPressRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Get all users via admin-api
      const { data: response, error } = await supabase.functions.invoke('admin-api', {
        body: { action: 'list_users' },
      });
      if (error) throw error;

      const profiles = response.users || [];

      // Get all press roles via admin-api
      const { data: rolesResponse, error: rolesError } = await supabase.functions.invoke('admin-api', {
        body: { action: 'list_press_users' },
      });

      const pressUserIds = new Set<string>(
        (rolesResponse?.pressUserIds || []) as string[]
      );

      setUsers(
        profiles.map((p: any) => ({
          id: p.id,
          email: p.email,
          full_name: p.full_name,
          hasPress: pressUserIds.has(p.id),
        }))
      );
    } catch (err: any) {
      console.error('Error fetching press users:', err);
      toast({ title: 'Error', description: 'No se pudieron cargar los usuarios', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const togglePressRole = async (userId: string, enabled: boolean) => {
    setToggling(userId);
    try {
      const { data, error } = await supabase.functions.invoke('admin-api', {
        body: { action: 'toggle_press_role', data: { userId, enabled } },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setUsers(prev =>
        prev.map(u => (u.id === userId ? { ...u, hasPress: enabled } : u))
      );
      toast({
        title: enabled ? '✅ Rol Press activado' : '🔒 Rol Press desactivado',
        description: `El usuario ${enabled ? 'ahora puede' : 'ya no puede'} usar Rix Press`,
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setToggling(null);
    }
  };

  const pressCount = users.filter(u => u.hasPress).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-primary" />
            Rix Press — Gestión de Acceso
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Controla qué usuarios pueden generar notas de prensa con el Agente Rix
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary">{pressCount} usuario{pressCount !== 1 ? 's' : ''} con acceso</Badge>
          <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usuarios</CardTitle>
          <CardDescription>Activa el switch para dar acceso al modo Rix Press</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              {users.map(user => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-medium">{user.full_name || user.email}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                    {user.hasPress && (
                      <Badge className="bg-blue-600 text-white text-[10px]">
                        <Newspaper className="h-3 w-3 mr-1" />
                        Press
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {toggling === user.id && <Loader2 className="h-4 w-4 animate-spin" />}
                    <Switch
                      checked={user.hasPress}
                      onCheckedChange={(checked) => togglePressRole(user.id, checked)}
                      disabled={toggling === user.id}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
