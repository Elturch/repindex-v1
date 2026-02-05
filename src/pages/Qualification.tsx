import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, CheckCircle, AlertCircle, Building2, Briefcase, Search, X } from 'lucide-react';
import { useCompanies } from '@/hooks/useCompanies';
import { useSectorCategories } from '@/hooks/useSectorCategories';
import { CHAT_ROLES, ROLE_CATEGORIES } from '@/lib/chatRoles';
import { useToast } from '@/hooks/use-toast';
import repindexLogo from '@/assets/repindex-logo.png';

type FormStatus = 'loading' | 'valid' | 'expired' | 'used' | 'error' | 'submitted';

export default function Qualification() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  
  const [status, setStatus] = useState<FormStatus>('loading');
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState('');
  
  // Form state
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [companySearch, setCompanySearch] = useState('');
  
  // Data hooks
  const { data: companies, isLoading: companiesLoading } = useCompanies();
  const { data: sectorCategories, isLoading: sectorsLoading } = useSectorCategories();

  useEffect(() => {
    validateToken();
  }, [token]);

  const validateToken = async () => {
    if (!token) {
      setStatus('error');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('lead_qualification_responses')
        .select('*, interested_leads(email)')
        .eq('token', token)
        .single();

      if (error || !data) {
        setStatus('error');
        return;
      }

      if (data.submitted_at) {
        setStatus('used');
        return;
      }

      if (new Date(data.token_expires_at) < new Date()) {
        setStatus('expired');
        return;
      }

      setEmail(data.interested_leads?.email || '');
      setStatus('valid');
    } catch (err) {
      console.error('Error validating token:', err);
      setStatus('error');
    }
  };

  const handleSubmit = async () => {
    if (selectedCompanies.length === 0) {
      toast({ title: 'Error', description: 'Selecciona al menos una empresa de interés', variant: 'destructive' });
      return;
    }
    if (!selectedRole) {
      toast({ title: 'Error', description: 'Selecciona tu perfil profesional', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('submit-qualification-form', {
        body: {
          token,
          companiesInterested: selectedCompanies,
          sectorsInterested: selectedSectors,
          roleType: selectedRole,
          additionalNotes,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setStatus('submitted');
      toast({ title: '¡Formulario enviado!', description: 'Nos pondremos en contacto contigo pronto.' });
    } catch (err) {
      console.error('Error submitting form:', err);
      toast({ 
        title: 'Error', 
        description: err instanceof Error ? err.message : 'No se pudo enviar el formulario', 
        variant: 'destructive' 
      });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleCompany = (ticker: string) => {
    setSelectedCompanies(prev => 
      prev.includes(ticker) 
        ? prev.filter(t => t !== ticker)
        : [...prev, ticker]
    );
  };

  const toggleSector = (sector: string) => {
    setSelectedSectors(prev => 
      prev.includes(sector) 
        ? prev.filter(s => s !== sector)
        : [...prev, sector]
    );
  };

  const filteredCompanies = companies?.filter(c => 
    c.issuer_name.toLowerCase().includes(companySearch.toLowerCase()) ||
    c.ticker.toLowerCase().includes(companySearch.toLowerCase())
  ) || [];

  // Render different states
  if (status === 'loading' || companiesLoading || sectorsLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Cargando formulario...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'expired' || status === 'error' || status === 'used') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="h-16 w-16 text-amber-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              {status === 'used' ? 'Formulario ya enviado' : 'Enlace no válido'}
            </h2>
            <p className="text-muted-foreground mb-6">
              {status === 'used' 
                ? 'Ya has completado este formulario. Nos pondremos en contacto contigo pronto.'
                : status === 'expired'
                ? 'Este enlace ha expirado. Por favor, contacta con nosotros para solicitar uno nuevo.'
                : 'El enlace no es válido. Por favor, verifica que lo has copiado correctamente.'}
            </p>
            <a 
              href="mailto:info@repindex.ai" 
              className="text-primary hover:underline"
            >
              Contactar: info@repindex.ai
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'submitted') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">¡Gracias por tu interés!</h2>
            <p className="text-muted-foreground mb-6">
              Hemos recibido tu formulario de cualificación. Nuestro equipo revisará tus datos y se pondrá en contacto contigo pronto.
            </p>
            <Link to="/" className="text-primary hover:underline">
              Volver a RepIndex
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Valid form state - show the qualification form
  const roles = CHAT_ROLES.filter(r => r.id !== 'general');
  const groupedRoles = Object.entries(ROLE_CATEGORIES).map(([key, label]) => ({
    category: key,
    label,
    roles: roles.filter(r => r.category === key),
  })).filter(g => g.roles.length > 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <img src={repindexLogo} alt="RepIndex" className="h-12 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Formulario de Cualificación
          </h1>
          <p className="text-muted-foreground">
            Completa este formulario para personalizar tu experiencia en RepIndex
          </p>
          {email && (
            <Badge variant="outline" className="mt-2">
              {email}
            </Badge>
          )}
        </div>

        <div className="space-y-6">
          {/* Companies Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Empresas de interés
              </CardTitle>
              <CardDescription>
                Selecciona las empresas sobre las que te gustaría recibir informes de reputación
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Search */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar empresa por nombre o ticker..."
                  value={companySearch}
                  onChange={(e) => setCompanySearch(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Selected companies */}
              {selectedCompanies.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4 p-3 bg-muted/50 rounded-lg">
                  {selectedCompanies.map(ticker => {
                    const company = companies?.find(c => c.ticker === ticker);
                    return (
                      <Badge 
                        key={ticker} 
                        variant="secondary"
                        className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                        onClick={() => toggleCompany(ticker)}
                      >
                        {company?.issuer_name || ticker}
                        <X className="h-3 w-3 ml-1" />
                      </Badge>
                    );
                  })}
                </div>
              )}

              {/* Company list */}
              <div className="max-h-64 overflow-y-auto border rounded-lg">
                {filteredCompanies.slice(0, 50).map(company => (
                  <div 
                    key={company.ticker}
                    className={`flex items-center gap-3 p-3 border-b last:border-b-0 cursor-pointer hover:bg-muted/50 transition-colors ${
                      selectedCompanies.includes(company.ticker) ? 'bg-primary/10' : ''
                    }`}
                    onClick={() => toggleCompany(company.ticker)}
                  >
                    <Checkbox 
                      checked={selectedCompanies.includes(company.ticker)}
                      onCheckedChange={() => toggleCompany(company.ticker)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{company.issuer_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {company.ticker} · {company.sector_category || 'Sin sector'}
                      </div>
                    </div>
                  </div>
                ))}
                {filteredCompanies.length === 0 && (
                  <div className="p-4 text-center text-muted-foreground">
                    No se encontraron empresas
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {selectedCompanies.length} empresas seleccionadas
              </p>
            </CardContent>
          </Card>

          {/* Sectors Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Sectores de interés</CardTitle>
              <CardDescription>
                Selecciona los sectores que más te interesan (opcional)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {sectorCategories?.map(sector => (
                  <div 
                    key={sector.sector_category}
                    className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors ${
                      selectedSectors.includes(sector.sector_category) ? 'bg-primary/10 border-primary' : ''
                    }`}
                    onClick={() => toggleSector(sector.sector_category)}
                  >
                    <Checkbox 
                      checked={selectedSectors.includes(sector.sector_category)}
                      onCheckedChange={() => toggleSector(sector.sector_category)}
                    />
                    <span className="text-sm">{sector.sector_category}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Role Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                Tu perfil profesional
              </CardTitle>
              <CardDescription>
                Selecciona el rol que mejor describe tu posición para personalizar los informes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona tu perfil..." />
                </SelectTrigger>
                <SelectContent>
                  {groupedRoles.map(group => (
                    <React.Fragment key={group.category}>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted">
                        {group.label}
                      </div>
                      {group.roles.map(role => (
                        <SelectItem key={role.id} value={role.id}>
                          <span className="flex items-center gap-2">
                            <span>{role.emoji}</span>
                            <span>{role.name}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </React.Fragment>
                  ))}
                </SelectContent>
              </Select>
              {selectedRole && (
                <p className="text-xs text-muted-foreground mt-2">
                  {CHAT_ROLES.find(r => r.id === selectedRole)?.shortDescription}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Additional Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Comentarios adicionales</CardTitle>
              <CardDescription>
                ¿Hay algo más que quieras contarnos? (opcional)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Por ejemplo: qué tipo de informes te interesan más, preguntas específicas, etc."
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
                rows={4}
                maxLength={1000}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {additionalNotes.length}/1000 caracteres
              </p>
            </CardContent>
          </Card>

          {/* Submit Button */}
          <Button 
            className="w-full py-6 text-lg"
            onClick={handleSubmit}
            disabled={submitting || selectedCompanies.length === 0 || !selectedRole}
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Enviando...
              </>
            ) : (
              'Enviar formulario'
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Al enviar este formulario, aceptas que RepIndex procese tus datos para personalizar tu experiencia.
            <br />
            Puedes ejercer tus derechos ARCO contactando a{' '}
            <a href="mailto:info@repindex.ai" className="text-primary hover:underline">info@repindex.ai</a>
          </p>
        </div>
      </div>
    </div>
  );
}
