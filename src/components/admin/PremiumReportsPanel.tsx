import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useCompanies } from '@/hooks/useCompanies';
import { AlertTriangle, ChevronDown, ChevronRight, ExternalLink, Loader2, Plus, RefreshCw, Users } from 'lucide-react';

interface Client { id: string; ticker: string; client_name: string; contact_name: string | null; is_active: boolean; notes: string | null; created_at: string; }
interface Recipient { id: string; client_id: string; user_id: string; is_active: boolean; created_at: string; }
interface Send { id: string; client_id: string; ticker: string; week_start: string; status: string; emails_sent: string[] | null; pdf_signed_url: string | null; test_mode: boolean; error_message: string | null; created_at: string; }
interface UserRow { id: string; email: string; full_name: string | null; }

const call = async (action: string, data?: Record<string, unknown>) => {
  const { data: res, error } = await supabase.functions.invoke('admin-api-data', { body: { action, data } });
  if (error) throw error;
  if (res?.error) throw new Error(res.error);
  return res;
};

const statusBadge = (s: string) => {
  const map: Record<string, { label: string; cls: string }> = {
    sent: { label: 'Enviado', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' },
    error: { label: 'Error', cls: 'bg-destructive/15 text-destructive border-destructive/30' },
    skipped: { label: 'Omitido', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30' },
  };
  const m = map[s] ?? { label: s, cls: '' };
  return <Badge variant="outline" className={m.cls}>{m.label}</Badge>;
};

export function PremiumReportsPanel() {
  const { toast } = useToast();
  const { data: companies = [] } = useCompanies();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [sends, setSends] = useState<Send[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ ticker: '', client_name: '', notes: '' });

  const load = async () => {
    setLoading(true);
    try {
      const [ov, us] = await Promise.all([call('premium_overview'), call('premium_list_users')]);
      setClients(ov.clients); setRecipients(ov.recipients); setSends(ov.sends); setUsers(us.users);
    } catch (e) {
      toast({ title: 'Error al cargar', description: (e as Error).message, variant: 'destructive' });
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const activeIssuers = useMemo(() => companies.filter(c => c.status === 'active'), [companies]);
  const activeCount = (clientId: string) => recipients.filter(r => r.client_id === clientId && r.is_active).length;

  const toggleClient = async (c: Client, v: boolean) => {
    setBusy(c.id);
    try { await call('premium_set_client_active', { id: c.id, is_active: v }); setClients(cs => cs.map(x => x.id === c.id ? { ...x, is_active: v } : x)); }
    catch (e) { toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  const toggleRecipient = async (clientId: string, userId: string, v: boolean) => {
    const key = `${clientId}:${userId}`;
    setBusy(key);
    try {
      await call('premium_set_recipient', { client_id: clientId, user_id: userId, is_active: v });
      setRecipients(rs => {
        const ex = rs.find(r => r.client_id === clientId && r.user_id === userId);
        if (ex) return rs.map(r => r === ex ? { ...r, is_active: v } : r);
        return [...rs, { id: key, client_id: clientId, user_id: userId, is_active: v, created_at: new Date().toISOString() }];
      });
    } catch (e) { toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  const createClient = async () => {
    setBusy('create');
    try {
      await call('premium_create_client', form);
      setAddOpen(false); setForm({ ticker: '', client_name: '', notes: '' });
      toast({ title: 'Empresa añadida' });
      load();
    } catch (e) { toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  const filteredUsers = (clientId: string) => {
    const q = search.trim().toLowerCase();
    const list = users.filter(u => !q || u.email.toLowerCase().includes(q) || (u.full_name ?? '').toLowerCase().includes(q));
    const isOn = (u: UserRow) => recipients.some(r => r.client_id === clientId && r.user_id === u.id && r.is_active);
    return list.sort((a, b) => Number(isOn(b)) - Number(isOn(a))).slice(0, q ? 100 : 30);
  };

  const userById = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Informes premium</h2>
          <p className="text-sm text-muted-foreground">Gobernanza de destinatarios del informe semanal por empresa. El envío lo realiza el proceso automático de los lunes.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />Actualizar</Button>
          <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-2" />Añadir empresa</Button>
        </div>
      </div>

      <Tabs defaultValue="clients">
        <TabsList>
          <TabsTrigger value="clients">Empresas y destinatarios</TabsTrigger>
          <TabsTrigger value="sends">Histórico de envíos</TabsTrigger>
        </TabsList>

        <TabsContent value="clients" className="space-y-3">
          {loading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div> :
            clients.length === 0 ? <p className="text-sm text-muted-foreground py-6">No hay empresas cliente.</p> :
            clients.map(c => {
              const n = activeCount(c.id);
              const open = expanded === c.id;
              return (
                <Card key={c.id}>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between gap-4">
                      <button className="flex items-center gap-2 text-left flex-1" onClick={() => { setExpanded(open ? null : c.id); setSearch(''); }}>
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <div>
                          <CardTitle className="text-base">{c.client_name} <span className="text-muted-foreground font-normal text-sm">· {c.ticker}</span></CardTitle>
                          <CardDescription className="flex items-center gap-2 mt-1">
                            <Users className="h-3.5 w-3.5" />{n} destinatario{n === 1 ? '' : 's'} activo{n === 1 ? '' : 's'}
                            {c.notes && <span className="truncate max-w-md">· {c.notes}</span>}
                          </CardDescription>
                        </div>
                      </button>
                      {c.is_active && n === 0 && (
                        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 gap-1">
                          <AlertTriangle className="h-3.5 w-3.5" />No recibirá el informe del lunes
                        </Badge>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{c.is_active ? 'Activa' : 'Pausada'}</span>
                        <Switch checked={c.is_active} disabled={busy === c.id} onCheckedChange={v => toggleClient(c, v)} />
                      </div>
                    </div>
                  </CardHeader>
                  {open && (
                    <CardContent className="space-y-3">
                      <Input placeholder="Buscar usuario por nombre o email…" value={search} onChange={e => setSearch(e.target.value)} />
                      <div className="border rounded-md divide-y max-h-96 overflow-y-auto">
                        {filteredUsers(c.id).map(u => {
                          const on = recipients.some(r => r.client_id === c.id && r.user_id === u.id && r.is_active);
                          const k = `${c.id}:${u.id}`;
                          return (
                            <div key={u.id} className="flex items-center justify-between px-3 py-2">
                              <div>
                                <div className="text-sm font-medium">{u.full_name || '—'}</div>
                                <div className="text-xs text-muted-foreground">{u.email}</div>
                              </div>
                              <Switch checked={on} disabled={busy === k} onCheckedChange={v => toggleRecipient(c.id, u.id, v)} />
                            </div>
                          );
                        })}
                      </div>
                      {recipients.some(r => r.client_id === c.id && r.is_active && !userById.has(r.user_id)) && (
                        <p className="text-xs text-amber-600">Hay destinatarios activos cuyo usuario ya no está activo o no tiene email.</p>
                      )}
                      <p className="text-xs text-muted-foreground">Desmarcar no borra el registro: queda inactivo para conservar el historial.</p>
                    </CardContent>
                  )}
                </Card>
              );
            })}
        </TabsContent>

        <TabsContent value="sends">
          <Card>
            <CardContent className="pt-4">
              {sends.length === 0 ? <p className="text-sm text-muted-foreground">Sin envíos registrados.</p> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Semana</TableHead><TableHead>Empresa</TableHead><TableHead>Estado</TableHead>
                      <TableHead>Emails</TableHead><TableHead>PDF</TableHead><TableHead>Detalle</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sends.map(s => {
                      const cl = clients.find(c => c.id === s.client_id);
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="whitespace-nowrap">{new Date(s.week_start).toLocaleDateString('es-ES')}</TableCell>
                          <TableCell>{cl?.client_name ?? s.ticker} <span className="text-muted-foreground text-xs">{s.ticker}</span></TableCell>
                          <TableCell className="space-x-1">{statusBadge(s.status)}{s.test_mode && <Badge variant="secondary">TEST</Badge>}</TableCell>
                          <TableCell title={(s.emails_sent ?? []).join(', ')}>{s.emails_sent?.length ?? 0}</TableCell>
                          <TableCell>{s.pdf_signed_url ? <a href={s.pdf_signed_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary text-sm hover:underline">Ver <ExternalLink className="h-3 w-3" /></a> : '—'}</TableCell>
                          <TableCell className="text-xs text-destructive max-w-xs">{s.error_message ?? ''}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Añadir empresa cliente</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Empresa del catálogo</Label>
              <Select value={form.ticker} onValueChange={v => {
                const iss = activeIssuers.find(i => i.ticker === v);
                setForm(f => ({ ...f, ticker: v, client_name: f.client_name || iss?.issuer_name || '' }));
              }}>
                <SelectTrigger><SelectValue placeholder="Selecciona un ticker" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {activeIssuers.map(i => <SelectItem key={i.ticker} value={i.ticker}>{i.issuer_name} ({i.ticker})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Nombre del cliente</Label>
              <Input value={form.client_name} maxLength={200} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Notas</Label>
              <Textarea value={form.notes} maxLength={2000} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button onClick={createClient} disabled={!form.ticker || !form.client_name.trim() || busy === 'create'}>
              {busy === 'create' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Añadir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
