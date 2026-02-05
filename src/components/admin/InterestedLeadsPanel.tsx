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
   
  Trash2,
  MessageSquare,
  CheckCircle,
  XCircle,
  Clock,
  UserCheck,
  Send,
  FileText,
  AlertTriangle,
  Star,
  Eye
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
  qualification_status?: string;
  qualification_score?: number;
}

interface QualificationResponse {
  id: string;
  lead_id: string;
  companies_interested: string[];
  sectors_interested: string[];
  role_type: string;
  additional_notes: string | null;
  contactability_score: number;
  submitted_at: string | null;
  form_sent_at: string;
  is_corporate_email: boolean;
  email_domain: string;
}

interface LeadStats {
  total: number;
  withConsent: number;
  withoutConsent: number;
  pending: number;
  formSent: number;
  formCompleted: number;
  rejectedEmail: number;
  converted: number;
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
    formSent: 0,
    formCompleted: 0,
    rejectedEmail: 0,
    converted: 0,
  });
  const [filterConsent, setFilterConsent] = useState<'all' | 'yes' | 'no'>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [noteText, setNoteText] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [qualificationDetails, setQualificationDetails] = useState<QualificationResponse | null>(null);
  const [showQualificationDialog, setShowQualificationDialog] = useState(false);

  const callAdminApiData = async (action: string, data?: Record<string, unknown>) => {
    const { data: response, error } = await supabase.functions.invoke('admin-api-data', {
      body: { action, data },
    });
    if (error) throw error;
    if (response?.error) throw new Error(response.error);
    return response;
  };

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const { leads } = await callAdminApiData('list_interested_leads');
      const leadsData = (leads || []) as Lead[];
      setLeads(leadsData);

      // Calculate stats
      const newStats: LeadStats = {
        total: leadsData.length,
        withConsent: leadsData.filter(l => l.contact_consent).length,
        withoutConsent: leadsData.filter(l => !l.contact_consent).length,
        pending: leadsData.filter(l => l.qualification_status === 'pending' || !l.qualification_status).length,
        formSent: leadsData.filter(l => l.qualification_status === 'form_sent').length,
        formCompleted: leadsData.filter(l => l.qualification_status === 'form_completed').length,
        rejectedEmail: leadsData.filter(l => l.qualification_status === 'rejected_email').length,
        converted: leadsData.filter(l => l.status === 'converted').length,
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

      await callAdminApiData('update_interested_lead', { id: leadId, updates });

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
      await callAdminApiData('update_interested_lead', {
        id: selectedLead.id,
        updates: { admin_notes: noteText },
      });

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
      await callAdminApiData('delete_interested_lead', { id: leadId });

      toast({ title: 'Lead eliminado' });
      fetchLeads();
    } catch (error) {
      console.error('Error deleting lead:', error);
      toast({ title: 'Error', description: 'No se pudo eliminar el lead', variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const sendQualificationForm = async (lead: Lead) => {
    setActionLoading(lead.id);
    try {
      const { data, error } = await supabase.functions.invoke('send-qualification-form', {
        body: { leadId: lead.id },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const message = data.isCorporate 
        ? `Formulario de cualificación enviado a ${lead.email}`
        : `Email de rechazo enviado a ${lead.email} (email no corporativo)`;

      toast({ 
        title: data.isCorporate ? 'Formulario enviado' : 'Email de rechazo enviado', 
        description: message,
      });
      fetchLeads();
    } catch (error) {
      console.error('Error sending qualification form:', error);
      const errorMessage = error instanceof Error ? error.message : 'No se pudo enviar el formulario';
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const viewQualificationDetails = async (lead: Lead) => {
    try {
      const { data, error } = await supabase
        .from('lead_qualification_responses')
        .select('*')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) throw error;
      
      setQualificationDetails(data as QualificationResponse);
      setShowQualificationDialog(true);
    } catch (error) {
      console.error('Error fetching qualification details:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar los detalles', variant: 'destructive' });
    }
  };

  const convertToUser = async (lead: Lead) => {
    if (lead.qualification_status !== 'form_completed') {
      toast({ 
        title: 'No permitido', 
        description: 'Solo se pueden convertir leads que hayan completado el formulario de cualificación',
        variant: 'destructive',
      });
      return;
    }

    setActionLoading(lead.id);
    try {
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
    if (filterStatus !== 'all') {
      if (filterStatus === 'pending' && lead.qualification_status !== 'pending' && lead.qualification_status) return false;
      if (filterStatus === 'form_sent' && lead.qualification_status !== 'form_sent') return false;
      if (filterStatus === 'form_completed' && lead.qualification_status !== 'form_completed') return false;
      if (filterStatus === 'rejected_email' && lead.qualification_status !== 'rejected_email') return false;
      if (filterStatus === 'converted' && lead.status !== 'converted') return false;
    }
    return true;
  });

  const getQualificationBadge = (lead: Lead) => {
    const qualStatus = lead.qualification_status || 'pending';
    const score = lead.qualification_score || 0;

    switch (qualStatus) {
      case 'pending':
        return (
          <Badge variant="outline" className="text-amber-600 border-amber-300">
            <Clock className="h-3 w-3 mr-1" />
            Pendiente
          </Badge>
        );
      case 'form_sent':
        return (
          <Badge variant="outline" className="text-blue-600 border-blue-300">
            <Send className="h-3 w-3 mr-1" />
            Formulario Enviado
          </Badge>
        );
      case 'form_completed':
        return (
          <Badge className={`${score >= 70 ? 'bg-green-600' : score >= 40 ? 'bg-amber-500' : 'bg-gray-500'}`}>
            <Star className="h-3 w-3 mr-1" />
            Cualificado ({score})
          </Badge>
        );
      case 'rejected_email':
        return (
          <Badge variant="outline" className="text-orange-600 border-orange-300">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Email Rechazado
          </Badge>
        );
      default:
        return <Badge variant="secondary">{qualStatus}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'converted':
        return <Badge className="bg-green-600"><UserCheck className="h-3 w-3 mr-1" />Convertido</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rechazado</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
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
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold text-amber-600">{stats.pending}</div>
            <div className="text-xs text-muted-foreground">Pendientes</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold text-blue-600">{stats.formSent}</div>
            <div className="text-xs text-muted-foreground">Form. Enviado</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold text-green-600">{stats.formCompleted}</div>
            <div className="text-xs text-muted-foreground">Cualificados</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold text-orange-600">{stats.rejectedEmail}</div>
            <div className="text-xs text-muted-foreground">Email Rechazado</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold text-primary">{stats.converted}</div>
            <div className="text-xs text-muted-foreground">Convertidos</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold text-muted-foreground">{stats.withoutConsent}</div>
            <div className="text-xs text-muted-foreground">Sin Consent.</div>
          </CardContent>
        </Card>
      </div>

      {/* Conversion Funnel */}
      {stats.total > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <div className="text-sm font-medium">Tasa de Consentimiento</div>
                <div className="text-2xl font-bold text-primary">
                  {Math.round((stats.withConsent / stats.total) * 100)}%
                </div>
              </div>
              <div>
                <div className="text-sm font-medium">Tasa de Cualificación</div>
                <div className="text-2xl font-bold text-blue-600">
                  {stats.formSent > 0 ? Math.round((stats.formCompleted / stats.formSent) * 100) : 0}%
                </div>
              </div>
              <div>
                <div className="text-sm font-medium">Tasa de Conversión</div>
                <div className="text-2xl font-bold text-green-600">
                  {stats.formCompleted > 0 ? Math.round((stats.converted / stats.formCompleted) * 100) : 0}%
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
                Gestión del funnel de cualificación de leads
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
              variant={filterStatus === 'form_sent' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setFilterStatus('form_sent')}
            >
              Form. Enviado
            </Button>
            <Button
              variant={filterStatus === 'form_completed' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setFilterStatus('form_completed')}
            >
              Cualificados
            </Button>
            <Button
              variant={filterStatus === 'rejected_email' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setFilterStatus('rejected_email')}
            >
              Email Rechazado
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
                  <TableHead>Cualificación</TableHead>
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
                    <TableCell>{getQualificationBadge(lead)}</TableCell>
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
                        {/* Show "Enviar Formulario" for pending leads with consent */}
                        {lead.contact_consent && 
                         (lead.qualification_status === 'pending' || !lead.qualification_status) &&
                         lead.status !== 'converted' && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => sendQualificationForm(lead)}
                            disabled={actionLoading === lead.id}
                            title="Enviar formulario de cualificación"
                          >
                            {actionLoading === lead.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <Send className="h-3 w-3 mr-1" />
                                Enviar Form.
                              </>
                            )}
                          </Button>
                        )}

                        {/* View qualification details for completed forms */}
                        {lead.qualification_status === 'form_completed' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => viewQualificationDetails(lead)}
                            title="Ver detalles de cualificación"
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                        )}

                        {/* Convert to user - only for form_completed */}
                        {lead.qualification_status === 'form_completed' && lead.status !== 'converted' && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => convertToUser(lead)}
                            disabled={actionLoading === lead.id}
                            title="Convertir a usuario"
                            className="bg-green-600 hover:bg-green-700"
                          >
                            {actionLoading === lead.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <UserPlus className="h-3 w-3" />
                            )}
                          </Button>
                        )}

                        {/* Resend form for rejected emails */}
                        {lead.qualification_status === 'rejected_email' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => sendQualificationForm(lead)}
                            disabled={actionLoading === lead.id}
                            title="Reenviar formulario"
                          >
                            {actionLoading === lead.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
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

      {/* Qualification Details Dialog */}
      <Dialog open={showQualificationDialog} onOpenChange={setShowQualificationDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Detalles de Cualificación
            </DialogTitle>
            <DialogDescription>
              Respuestas del formulario de cualificación
            </DialogDescription>
          </DialogHeader>
          {qualificationDetails && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Score de Contactabilidad</div>
                  <div className={`text-3xl font-bold ${
                    qualificationDetails.contactability_score >= 70 ? 'text-green-600' : 
                    qualificationDetails.contactability_score >= 40 ? 'text-amber-600' : 'text-gray-500'
                  }`}>
                    {qualificationDetails.contactability_score}/100
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Email Corporativo</div>
                  <Badge variant={qualificationDetails.is_corporate_email ? 'default' : 'secondary'}>
                    {qualificationDetails.is_corporate_email ? 'Sí' : 'No'} ({qualificationDetails.email_domain})
                  </Badge>
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-muted-foreground mb-2">Empresas de interés</div>
                <div className="flex flex-wrap gap-2">
                  {qualificationDetails.companies_interested.map(ticker => (
                    <Badge key={ticker} variant="outline">{ticker}</Badge>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-muted-foreground mb-2">Sectores de interés</div>
                <div className="flex flex-wrap gap-2">
                  {qualificationDetails.sectors_interested.map(sector => (
                    <Badge key={sector} variant="secondary">{sector}</Badge>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">Perfil</div>
                <div className="text-foreground">{qualificationDetails.role_type}</div>
              </div>

              {qualificationDetails.additional_notes && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Comentarios adicionales</div>
                  <div className="text-foreground bg-muted/50 p-3 rounded-lg italic">
                    "{qualificationDetails.additional_notes}"
                  </div>
                </div>
              )}

              <div className="text-xs text-muted-foreground">
                Formulario enviado: {new Date(qualificationDetails.form_sent_at).toLocaleString('es-ES')}
                {qualificationDetails.submitted_at && (
                  <> · Completado: {new Date(qualificationDetails.submitted_at).toLocaleString('es-ES')}</>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
