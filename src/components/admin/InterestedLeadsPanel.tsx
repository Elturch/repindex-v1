 import React, { useState, useEffect } from 'react';
 import { supabase } from '@/integrations/supabase/client';
 import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
 import { Button } from '@/components/ui/button';
 import { Badge } from '@/components/ui/badge';
 import { Textarea } from '@/components/ui/textarea';
 import { 
   Table, 
   TableBody, 
   TableCell, 
   TableHead, 
   TableHeader, 
   TableRow 
 } from '@/components/ui/table';
 import {
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
   DialogDescription,
 } from '@/components/ui/dialog';
 import { 
   Loader2, 
   RefreshCw, 
   UserPlus, 
   Check, 
   X, 
   Mail, 
   Trash2,
   MessageSquare,
   CheckCircle,
   XCircle,
   Clock,
   UserCheck
 } from 'lucide-react';
 import { useToast } from '@/hooks/use-toast';
 import { formatDistanceToNow } from 'date-fns';
 import { es } from 'date-fns/locale';
 
 interface Lead {
   id: string;
   email: string;
   contact_consent: boolean;
   consent_date: string;
   source: string;
   status: string;
   admin_notes: string | null;
   contacted_at: string | null;
   converted_at: string | null;
   created_at: string;
 }
 
 interface LeadStats {
   total: number;
   withConsent: number;
   withoutConsent: number;
   pending: number;
   contacted: number;
   converted: number;
   rejected: number;
 }
 
 export const InterestedLeadsPanel: React.FC = () => {
   const { toast } = useToast();
   const [leads, setLeads] = useState<Lead[]>([]);
   const [loading, setLoading] = useState(true);
   const [stats, setStats] = useState<LeadStats>({
     total: 0,
     withConsent: 0,
     withoutConsent: 0,
     pending: 0,
     contacted: 0,
     converted: 0,
     rejected: 0,
   });
   const [filterConsent, setFilterConsent] = useState<'all' | 'yes' | 'no'>('all');
   const [filterStatus, setFilterStatus] = useState<string>('all');
   const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
   const [noteText, setNoteText] = useState('');
   const [actionLoading, setActionLoading] = useState<string | null>(null);
 
   const fetchLeads = async () => {
     setLoading(true);
     try {
       const { data, error } = await supabase
         .from('interested_leads')
         .select('*')
         .order('created_at', { ascending: false });
 
       if (error) throw error;
 
       const leadsData = (data || []) as Lead[];
       setLeads(leadsData);
 
       // Calculate stats
       const newStats: LeadStats = {
         total: leadsData.length,
         withConsent: leadsData.filter(l => l.contact_consent).length,
         withoutConsent: leadsData.filter(l => !l.contact_consent).length,
         pending: leadsData.filter(l => l.status === 'pending').length,
         contacted: leadsData.filter(l => l.status === 'contacted').length,
         converted: leadsData.filter(l => l.status === 'converted').length,
         rejected: leadsData.filter(l => l.status === 'rejected').length,
       };
       setStats(newStats);
     } catch (error) {
       console.error('Error fetching leads:', error);
       toast({ title: 'Error', description: 'No se pudieron cargar los leads', variant: 'destructive' });
     } finally {
       setLoading(false);
     }
   };
 
   useEffect(() => {
     fetchLeads();
   }, []);
 
   const updateLeadStatus = async (leadId: string, status: string, extraFields?: Partial<Lead>) => {
     setActionLoading(leadId);
     try {
       const updates: Record<string, unknown> = { status, ...extraFields };
       
       if (status === 'contacted' && !extraFields?.contacted_at) {
         updates.contacted_at = new Date().toISOString();
       }
       if (status === 'converted' && !extraFields?.converted_at) {
         updates.converted_at = new Date().toISOString();
       }
 
       const { error } = await supabase
         .from('interested_leads')
         .update(updates)
         .eq('id', leadId);
 
       if (error) throw error;
 
       toast({ title: 'Actualizado', description: `Lead marcado como ${status}` });
       fetchLeads();
     } catch (error) {
       console.error('Error updating lead:', error);
       toast({ title: 'Error', description: 'No se pudo actualizar el lead', variant: 'destructive' });
     } finally {
       setActionLoading(null);
     }
   };
 
   const saveNote = async () => {
     if (!selectedLead) return;
     setActionLoading(selectedLead.id);
     try {
       const { error } = await supabase
         .from('interested_leads')
         .update({ admin_notes: noteText })
         .eq('id', selectedLead.id);
 
       if (error) throw error;
 
       toast({ title: 'Nota guardada' });
       setSelectedLead(null);
       setNoteText('');
       fetchLeads();
     } catch (error) {
       console.error('Error saving note:', error);
       toast({ title: 'Error', description: 'No se pudo guardar la nota', variant: 'destructive' });
     } finally {
       setActionLoading(null);
     }
   };
 
   const deleteLead = async (leadId: string) => {
     if (!confirm('¿Eliminar este lead permanentemente?')) return;
     setActionLoading(leadId);
     try {
       const { error } = await supabase
         .from('interested_leads')
         .delete()
         .eq('id', leadId);
 
       if (error) throw error;
 
       toast({ title: 'Lead eliminado' });
       fetchLeads();
     } catch (error) {
       console.error('Error deleting lead:', error);
       toast({ title: 'Error', description: 'No se pudo eliminar el lead', variant: 'destructive' });
     } finally {
       setActionLoading(null);
     }
   };
 
   const convertToUser = async (lead: Lead) => {
     setActionLoading(lead.id);
     try {
       // Call admin API to create user profile and send magic link
       const { error } = await supabase.functions.invoke('admin-api', {
         body: {
           action: 'invite_user',
           data: {
             email: lead.email,
             full_name: lead.email.split('@')[0],
             is_individual: true,
             send_magic_link: true,
           }
         }
       });
 
       if (error) throw error;
 
       // Update lead status to converted
       await updateLeadStatus(lead.id, 'converted', { converted_at: new Date().toISOString() });
 
       toast({ 
         title: 'Usuario creado', 
         description: `Se ha enviado un magic link a ${lead.email}` 
       });
     } catch (error: unknown) {
       console.error('Error converting lead:', error);
       const errorMessage = error instanceof Error ? error.message : 'No se pudo convertir el lead';
       toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
     } finally {
       setActionLoading(null);
     }
   };
 
   const filteredLeads = leads.filter(lead => {
     if (filterConsent === 'yes' && !lead.contact_consent) return false;
     if (filterConsent === 'no' && lead.contact_consent) return false;
     if (filterStatus !== 'all' && lead.status !== filterStatus) return false;
     return true;
   });
 
   const getStatusBadge = (status: string) => {
     switch (status) {
       case 'pending':
         return <Badge variant="outline" className="text-amber-600 border-amber-300"><Clock className="h-3 w-3 mr-1" />Pendiente</Badge>;
       case 'contacted':
         return <Badge variant="outline" className="text-blue-600 border-blue-300"><Mail className="h-3 w-3 mr-1" />Contactado</Badge>;
       case 'converted':
         return <Badge className="bg-green-600"><UserCheck className="h-3 w-3 mr-1" />Convertido</Badge>;
       case 'rejected':
         return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rechazado</Badge>;
       default:
         return <Badge variant="secondary">{status}</Badge>;
     }
   };
 
   return (
     <div className="space-y-6">
       {/* Stats Cards */}
       <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
         <Card className="bg-gradient-to-br from-background to-muted/30">
           <CardContent className="pt-4 pb-3 px-4">
             <div className="text-2xl font-bold">{stats.total}</div>
             <div className="text-xs text-muted-foreground">Total Leads</div>
           </CardContent>
         </Card>
         <Card className="bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/30 dark:to-green-900/20">
           <CardContent className="pt-4 pb-3 px-4">
             <div className="text-2xl font-bold text-green-600">{stats.withConsent}</div>
             <div className="text-xs text-muted-foreground">Con Consentimiento</div>
           </CardContent>
         </Card>
         <Card className="bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-950/30 dark:to-gray-900/20">
           <CardContent className="pt-4 pb-3 px-4">
             <div className="text-2xl font-bold text-gray-500">{stats.withoutConsent}</div>
             <div className="text-xs text-muted-foreground">Sin Consentimiento</div>
           </CardContent>
         </Card>
         <Card>
           <CardContent className="pt-4 pb-3 px-4">
             <div className="text-2xl font-bold text-amber-600">{stats.pending}</div>
             <div className="text-xs text-muted-foreground">Pendientes</div>
           </CardContent>
         </Card>
         <Card>
           <CardContent className="pt-4 pb-3 px-4">
             <div className="text-2xl font-bold text-blue-600">{stats.contacted}</div>
             <div className="text-xs text-muted-foreground">Contactados</div>
           </CardContent>
         </Card>
         <Card>
           <CardContent className="pt-4 pb-3 px-4">
             <div className="text-2xl font-bold text-green-600">{stats.converted}</div>
             <div className="text-xs text-muted-foreground">Convertidos</div>
           </CardContent>
         </Card>
         <Card>
           <CardContent className="pt-4 pb-3 px-4">
             <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
             <div className="text-xs text-muted-foreground">Rechazados</div>
           </CardContent>
         </Card>
       </div>
 
       {/* Conversion Rate */}
       {stats.total > 0 && (
         <Card>
           <CardContent className="py-4">
             <div className="flex items-center justify-between">
               <div>
                 <div className="text-sm font-medium">Tasa de Consentimiento</div>
                 <div className="text-2xl font-bold text-primary">
                   {Math.round((stats.withConsent / stats.total) * 100)}%
                 </div>
               </div>
               <div>
                 <div className="text-sm font-medium">Tasa de Conversión</div>
                 <div className="text-2xl font-bold text-green-600">
                   {stats.withConsent > 0 ? Math.round((stats.converted / stats.withConsent) * 100) : 0}%
                 </div>
               </div>
             </div>
           </CardContent>
         </Card>
       )}
 
       {/* Filters and Table */}
       <Card>
         <CardHeader className="pb-3">
           <div className="flex items-center justify-between">
             <div>
               <CardTitle className="flex items-center gap-2">
                 <UserPlus className="h-5 w-5" />
                 Leads Interesados
               </CardTitle>
               <CardDescription>
                 Usuarios que intentaron acceder sin estar registrados
               </CardDescription>
             </div>
             <Button variant="outline" size="sm" onClick={fetchLeads} disabled={loading}>
               <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
               Actualizar
             </Button>
           </div>
         </CardHeader>
         <CardContent>
           {/* Filters */}
           <div className="flex gap-2 mb-4 flex-wrap">
             <Button
               variant={filterConsent === 'all' ? 'default' : 'outline'}
               size="sm"
               onClick={() => setFilterConsent('all')}
             >
               Todos
             </Button>
             <Button
               variant={filterConsent === 'yes' ? 'default' : 'outline'}
               size="sm"
               onClick={() => setFilterConsent('yes')}
             >
               <Check className="h-3 w-3 mr-1" />
               Con consentimiento
             </Button>
             <Button
               variant={filterConsent === 'no' ? 'default' : 'outline'}
               size="sm"
               onClick={() => setFilterConsent('no')}
             >
               <X className="h-3 w-3 mr-1" />
               Sin consentimiento
             </Button>
             <div className="border-l mx-2" />
             <Button
               variant={filterStatus === 'all' ? 'secondary' : 'ghost'}
               size="sm"
               onClick={() => setFilterStatus('all')}
             >
               Cualquier estado
             </Button>
             <Button
               variant={filterStatus === 'pending' ? 'secondary' : 'ghost'}
               size="sm"
               onClick={() => setFilterStatus('pending')}
             >
               Pendientes
             </Button>
             <Button
               variant={filterStatus === 'contacted' ? 'secondary' : 'ghost'}
               size="sm"
               onClick={() => setFilterStatus('contacted')}
             >
               Contactados
             </Button>
           </div>
 
           {loading ? (
             <div className="flex items-center justify-center py-12">
               <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
             </div>
           ) : filteredLeads.length === 0 ? (
             <div className="text-center py-12 text-muted-foreground">
               <UserPlus className="h-12 w-12 mx-auto mb-4 opacity-30" />
               <p>No hay leads que coincidan con los filtros</p>
             </div>
           ) : (
             <Table>
               <TableHeader>
                 <TableRow>
                   <TableHead>Email</TableHead>
                   <TableHead>Consentimiento</TableHead>
                   <TableHead>Estado</TableHead>
                   <TableHead>Fecha</TableHead>
                   <TableHead>Notas</TableHead>
                   <TableHead className="text-right">Acciones</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {filteredLeads.map((lead) => (
                   <TableRow key={lead.id}>
                     <TableCell className="font-medium">{lead.email}</TableCell>
                     <TableCell>
                       {lead.contact_consent ? (
                         <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                           <CheckCircle className="h-3 w-3 mr-1" />
                           Sí
                         </Badge>
                       ) : (
                         <Badge variant="secondary" className="text-muted-foreground">
                           <XCircle className="h-3 w-3 mr-1" />
                           No
                         </Badge>
                       )}
                     </TableCell>
                     <TableCell>{getStatusBadge(lead.status)}</TableCell>
                     <TableCell className="text-sm text-muted-foreground">
                       {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true, locale: es })}
                     </TableCell>
                     <TableCell>
                       {lead.admin_notes ? (
                         <span className="text-xs text-muted-foreground truncate max-w-[150px] block">
                           {lead.admin_notes}
                         </span>
                       ) : (
                         <span className="text-xs text-muted-foreground/50">—</span>
                       )}
                     </TableCell>
                     <TableCell className="text-right">
                       <div className="flex gap-1 justify-end">
                         {lead.contact_consent && lead.status === 'pending' && (
                           <>
                             <Button
                               variant="outline"
                               size="sm"
                               onClick={() => updateLeadStatus(lead.id, 'contacted')}
                               disabled={actionLoading === lead.id}
                               title="Marcar como contactado"
                             >
                               {actionLoading === lead.id ? (
                                 <Loader2 className="h-3 w-3 animate-spin" />
                               ) : (
                                 <Mail className="h-3 w-3" />
                               )}
                             </Button>
                             <Button
                               variant="default"
                               size="sm"
                               onClick={() => convertToUser(lead)}
                               disabled={actionLoading === lead.id}
                               title="Convertir a usuario"
                             >
                               {actionLoading === lead.id ? (
                                 <Loader2 className="h-3 w-3 animate-spin" />
                               ) : (
                                 <UserPlus className="h-3 w-3" />
                               )}
                             </Button>
                           </>
                         )}
                         {lead.status === 'contacted' && (
                           <Button
                             variant="default"
                             size="sm"
                             onClick={() => convertToUser(lead)}
                             disabled={actionLoading === lead.id}
                             title="Convertir a usuario"
                           >
                             {actionLoading === lead.id ? (
                               <Loader2 className="h-3 w-3 animate-spin" />
                             ) : (
                               <UserPlus className="h-3 w-3" />
                             )}
                           </Button>
                         )}
                         <Button
                           variant="ghost"
                           size="sm"
                           onClick={() => {
                             setSelectedLead(lead);
                             setNoteText(lead.admin_notes || '');
                           }}
                           title="Añadir nota"
                         >
                           <MessageSquare className="h-3 w-3" />
                         </Button>
                         <Button
                           variant="ghost"
                           size="sm"
                           onClick={() => deleteLead(lead.id)}
                           disabled={actionLoading === lead.id}
                           title="Eliminar"
                           className="text-destructive hover:text-destructive"
                         >
                           <Trash2 className="h-3 w-3" />
                         </Button>
                       </div>
                     </TableCell>
                   </TableRow>
                 ))}
               </TableBody>
             </Table>
           )}
         </CardContent>
       </Card>
 
       {/* Note Dialog */}
       <Dialog open={!!selectedLead} onOpenChange={(open) => !open && setSelectedLead(null)}>
         <DialogContent>
           <DialogHeader>
             <DialogTitle>Nota para {selectedLead?.email}</DialogTitle>
             <DialogDescription>
               Añade notas internas sobre este lead
             </DialogDescription>
           </DialogHeader>
           <Textarea
             value={noteText}
             onChange={(e) => setNoteText(e.target.value)}
             placeholder="Escribe una nota..."
             rows={4}
           />
           <div className="flex justify-end gap-2">
             <Button variant="outline" onClick={() => setSelectedLead(null)}>
               Cancelar
             </Button>
             <Button onClick={saveNote} disabled={actionLoading === selectedLead?.id}>
               {actionLoading === selectedLead?.id ? (
                 <Loader2 className="h-4 w-4 animate-spin mr-2" />
               ) : null}
               Guardar nota
             </Button>
           </div>
         </DialogContent>
       </Dialog>
     </div>
   );
 };