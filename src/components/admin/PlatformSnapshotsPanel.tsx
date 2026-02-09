import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { BookOpen, Plus, Search, Eye, Loader2, Calendar, Tag, BarChart3, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Snapshot {
  id: string;
  version: string;
  title: string;
  summary: string;
  detailed_description: string;
  changes: string[];
  snapshot_type: string;
  tags: string[];
  metrics_at_snapshot: Record<string, any>;
  created_at: string;
  snapshot_date: string;
}

const SNAPSHOT_TYPES = [
  { value: 'feature', label: 'Feature', color: 'bg-blue-500/15 text-blue-700 border-blue-300' },
  { value: 'improvement', label: 'Mejora', color: 'bg-green-500/15 text-green-700 border-green-300' },
  { value: 'fix', label: 'Fix', color: 'bg-orange-500/15 text-orange-700 border-orange-300' },
  { value: 'architecture', label: 'Arquitectura', color: 'bg-purple-500/15 text-purple-700 border-purple-300' },
  { value: 'methodology', label: 'Metodología', color: 'bg-indigo-500/15 text-indigo-700 border-indigo-300' },
  { value: 'milestone', label: 'Hito', color: 'bg-amber-500/15 text-amber-700 border-amber-300' },
];

const getTypeBadge = (type: string) => {
  const found = SNAPSHOT_TYPES.find(t => t.value === type);
  return found || { value: type, label: type, color: 'bg-muted text-muted-foreground' };
};

export const PlatformSnapshotsPanel: React.FC = () => {
  const { toast } = useToast();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSnapshot, setSelectedSnapshot] = useState<Snapshot | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  const [form, setForm] = useState({
    version: '',
    title: '',
    summary: '',
    detailed_description: '',
    snapshot_type: 'feature',
    tags: '',
    changes: '',
  });

  const callAdminApi = async (action: string, data?: any) => {
    const { data: response, error } = await supabase.functions.invoke('admin-api', {
      body: { action, data },
    });
    if (error) throw error;
    if (response.error) throw new Error(response.error);
    return response;
  };

  const fetchSnapshots = async () => {
    setLoading(true);
    try {
      const { snapshots: data } = await callAdminApi('list_snapshots');
      setSnapshots(data || []);
    } catch (error: any) {
      console.error('Error fetching snapshots:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar los snapshots', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSnapshots(); }, []);

  const handleCreate = async () => {
    if (!form.version || !form.title || !form.summary || !form.detailed_description) {
      toast({ title: 'Campos requeridos', description: 'Completa versión, título, resumen y descripción', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await callAdminApi('create_snapshot', {
        version: form.version,
        title: form.title,
        summary: form.summary,
        detailed_description: form.detailed_description,
        snapshot_type: form.snapshot_type,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        changes: form.changes.split('\n').map(c => c.trim()).filter(Boolean),
      });
      toast({ title: 'Snapshot creado', description: `v${form.version} — ${form.title}` });
      setShowForm(false);
      setForm({ version: '', title: '', summary: '', detailed_description: '', snapshot_type: 'feature', tags: '', changes: '' });
      fetchSnapshots();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const filtered = snapshots.filter(s => {
    if (filterType !== 'all' && s.snapshot_type !== filterType) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return s.title.toLowerCase().includes(q) || s.summary.toLowerCase().includes(q) || s.version.includes(q) || (s.tags || []).some(t => t.toLowerCase().includes(q));
    }
    return true;
  });

  const metrics = selectedSnapshot?.metrics_at_snapshot || {};
  const metricsEntries = Object.entries(metrics).filter(([, v]) => v !== null && v !== undefined);

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Platform Snapshots</CardTitle>
              <Badge variant="secondary">{snapshots.length} registros</Badge>
            </div>
            <Button size="sm" onClick={() => setShowForm(!showForm)}>
              {showForm ? <><X className="h-4 w-4 mr-1" /> Cancelar</> : <><Plus className="h-4 w-4 mr-1" /> Nuevo Snapshot</>}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por título, versión, tags..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 h-9" />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                {SNAPSHOT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Create Form */}
      {showForm && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Nuevo Snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Versión *</Label>
                <Input placeholder="3.8.0" value={form.version} onChange={e => setForm({ ...form, version: e.target.value })} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Título *</Label>
                <Input placeholder="Nombre del hito" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={form.snapshot_type} onValueChange={v => setForm({ ...form, snapshot_type: v })}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SNAPSHOT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Resumen *</Label>
              <Input placeholder="Descripción en 1-2 frases" value={form.summary} onChange={e => setForm({ ...form, summary: e.target.value })} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Tags (separados por coma)</Label>
              <Input placeholder="RIX, pipeline, V2" value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Descripción detallada (Markdown) *</Label>
              <Textarea placeholder="## Arquitectura&#10;&#10;Detalle técnico completo..." value={form.detailed_description} onChange={e => setForm({ ...form, detailed_description: e.target.value })} rows={6} className="text-sm" />
            </div>
            <div>
              <Label className="text-xs">Cambios (uno por línea)</Label>
              <Textarea placeholder="Nuevo sistema de scoring&#10;Migración de tabla X" value={form.changes} onChange={e => setForm({ ...form, changes: e.target.value })} rows={3} className="text-sm" />
            </div>
            <Button onClick={handleCreate} disabled={saving} size="sm">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Guardar Snapshot
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No se encontraron snapshots</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Fecha</TableHead>
                  <TableHead className="w-[80px]">Versión</TableHead>
                  <TableHead className="w-[100px]">Tipo</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead className="hidden md:table-cell">Resumen</TableHead>
                  <TableHead className="w-[80px]">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(s => {
                  const typeBadge = getTypeBadge(s.snapshot_type);
                  return (
                    <TableRow key={s.id} className="cursor-pointer hover:bg-muted/60" onClick={() => setSelectedSnapshot(s)}>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {new Date(s.snapshot_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })}
                      </TableCell>
                      <TableCell><Badge variant="outline" className="font-mono text-xs">v{s.version}</Badge></TableCell>
                      <TableCell><span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${typeBadge.color}`}>{typeBadge.label}</span></TableCell>
                      <TableCell className="font-medium text-sm">{s.title}</TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[300px] truncate">{s.summary}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={e => { e.stopPropagation(); setSelectedSnapshot(s); }}>
                          <Eye className="h-3.5 w-3.5 mr-1" /> Abrir
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedSnapshot} onOpenChange={open => { if (!open) setSelectedSnapshot(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="font-mono">v{selectedSnapshot?.version}</Badge>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${getTypeBadge(selectedSnapshot?.snapshot_type || '').color}`}>
                {getTypeBadge(selectedSnapshot?.snapshot_type || '').label}
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {selectedSnapshot?.snapshot_date && new Date(selectedSnapshot.snapshot_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            </div>
            <DialogTitle className="text-xl">{selectedSnapshot?.title}</DialogTitle>
            <DialogDescription className="text-sm">{selectedSnapshot?.summary}</DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-5 pb-4">
              {/* Tags */}
              {selectedSnapshot?.tags && selectedSnapshot.tags.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                  {selectedSnapshot.tags.map(tag => (
                    <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                  ))}
                </div>
              )}

              {/* Metrics */}
              {metricsEntries.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {metricsEntries.map(([key, value]) => (
                    <div key={key} className="rounded-lg border bg-muted/30 p-2.5 text-center">
                      <div className="text-lg font-bold">{String(value)}</div>
                      <div className="text-[10px] text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Detailed Description (Markdown) */}
              <div className="prose prose-sm dark:prose-invert max-w-none
                prose-headings:text-foreground prose-p:text-foreground/90
                prose-table:text-sm prose-th:bg-muted/50 prose-th:p-2 prose-td:p-2 prose-td:border
                prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
                prose-pre:bg-muted prose-pre:border prose-pre:text-xs
                prose-blockquote:border-primary/40">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {selectedSnapshot?.detailed_description || ''}
                </ReactMarkdown>
              </div>

              {/* Changes List */}
              {selectedSnapshot?.changes && (selectedSnapshot.changes as string[]).length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                    <BarChart3 className="h-4 w-4 text-primary" /> Cambios implementados
                  </h4>
                  <ul className="space-y-1">
                    {(selectedSnapshot.changes as string[]).map((change, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="text-primary mt-1.5 text-[8px]">●</span>
                        <span className="text-foreground/80">{change}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};
