import React, { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { 
  Building2, 
  Users, 
  Plus, 
  Loader2, 
  CheckCircle,
  Mail,
  RefreshCw,
  Pencil,
  Gift
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Company {
  id: string;
  company_name: string;
  ticker: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  billing_name: string | null;
  tax_id: string | null;
  plan_type: string;
  monthly_fee: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  is_individual: boolean;
  is_active: boolean;
  company_id: string | null;
  created_at: string;
  client_companies: { id: string; company_name: string } | null;
}

const Admin: React.FC = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  
  // Companies state
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [showCompanyForm, setShowCompanyForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [savingCompany, setSavingCompany] = useState(false);
  const [companyForm, setCompanyForm] = useState({
    company_name: '',
    ticker: '',
    contact_email: '',
    contact_phone: '',
    billing_name: '',
    billing_address: '',
    billing_city: '',
    billing_postal_code: '',
    tax_id: '',
    plan_type: 'basic',
    monthly_fee: '',
    is_courtesy: false, // Plan gratuito de cortesía
    is_active: true,
    notes: '',
  });

  // Users state
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [savingUser, setSavingUser] = useState(false);
  const [userForm, setUserForm] = useState({
    email: '',
    full_name: '',
    company_id: '',
    is_individual: false,
    is_active: true,
    send_magic_link: true,
  });

  // Fetch data
  useEffect(() => {
    fetchCompanies();
    fetchUsers();
  }, []);

  const callAdminApi = async (action: string, data?: any) => {
    const { data: response, error } = await supabase.functions.invoke('admin-api', {
      body: { action, data },
    });
    if (error) throw error;
    if (response.error) throw new Error(response.error);
    return response;
  };

  const fetchCompanies = async () => {
    setLoadingCompanies(true);
    try {
      const { companies } = await callAdminApi('list_companies');
      setCompanies(companies || []);
    } catch (error) {
      console.error('Error fetching companies:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar las empresas', variant: 'destructive' });
    } finally {
      setLoadingCompanies(false);
    }
  };

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const { users } = await callAdminApi('list_users');
      setUsers(users || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar los usuarios', variant: 'destructive' });
    } finally {
      setLoadingUsers(false);
    }
  };

  const resetCompanyForm = () => {
    setCompanyForm({
      company_name: '', ticker: '', contact_email: '', contact_phone: '',
      billing_name: '', billing_address: '', billing_city: '', billing_postal_code: '',
      tax_id: '', plan_type: 'basic', monthly_fee: '', is_courtesy: false, is_active: true, notes: '',
    });
  };

  const openEditCompany = (company: Company) => {
    setEditingCompany(company);
    setCompanyForm({
      company_name: company.company_name,
      ticker: company.ticker || '',
      contact_email: company.contact_email || '',
      contact_phone: company.contact_phone || '',
      billing_name: company.billing_name || '',
      billing_address: '',
      billing_city: '',
      billing_postal_code: '',
      tax_id: company.tax_id || '',
      plan_type: company.plan_type,
      monthly_fee: company.monthly_fee?.toString() || '0',
      is_courtesy: company.monthly_fee === 0 && company.plan_type !== 'basic',
      is_active: company.is_active,
      notes: company.notes || '',
    });
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyForm.company_name.trim()) {
      toast({ title: 'Error', description: 'El nombre de la empresa es obligatorio', variant: 'destructive' });
      return;
    }

    setSavingCompany(true);
    try {
      await callAdminApi('create_company', {
        ...companyForm,
        monthly_fee: companyForm.is_courtesy ? 0 : (companyForm.monthly_fee ? parseFloat(companyForm.monthly_fee) : 0),
      });
      toast({ title: 'Empresa creada', description: `${companyForm.company_name} añadida correctamente` });
      setShowCompanyForm(false);
      resetCompanyForm();
      fetchCompanies();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSavingCompany(false);
    }
  };

  const handleUpdateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCompany) return;

    setSavingCompany(true);
    try {
      await callAdminApi('update_company', {
        id: editingCompany.id,
        company_name: companyForm.company_name,
        ticker: companyForm.ticker || null,
        contact_email: companyForm.contact_email || null,
        contact_phone: companyForm.contact_phone || null,
        billing_name: companyForm.billing_name || null,
        tax_id: companyForm.tax_id || null,
        plan_type: companyForm.plan_type,
        monthly_fee: companyForm.is_courtesy ? 0 : (companyForm.monthly_fee ? parseFloat(companyForm.monthly_fee) : 0),
        is_active: companyForm.is_active,
        notes: companyForm.notes || null,
      });
      toast({ title: 'Empresa actualizada', description: `${companyForm.company_name} guardada correctamente` });
      setEditingCompany(null);
      resetCompanyForm();
      fetchCompanies();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSavingCompany(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userForm.email.trim()) {
      toast({ title: 'Error', description: 'El email es obligatorio', variant: 'destructive' });
      return;
    }

    setSavingUser(true);
    try {
      await callAdminApi('create_user', {
        ...userForm,
        company_id: userForm.company_id || null,
      });
      toast({ 
        title: 'Usuario creado', 
        description: `${userForm.email} añadido correctamente${userForm.send_magic_link ? '. Magic link enviado.' : ''}` 
      });
      setShowUserForm(false);
      setUserForm({ email: '', full_name: '', company_id: '', is_individual: false, is_active: true, send_magic_link: true });
      fetchUsers();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSavingUser(false);
    }
  };

  const handleSendMagicLink = async (userId: string, email: string) => {
    try {
      await callAdminApi('send_magic_link', { user_id: userId });
      toast({ title: 'Magic Link enviado', description: `Enlace enviado a ${email}` });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const openEditUser = (user: UserProfile) => {
    setEditingUser(user);
    setUserForm({
      email: user.email,
      full_name: user.full_name || '',
      company_id: user.company_id || '',
      is_individual: user.is_individual,
      is_active: user.is_active,
      send_magic_link: false,
    });
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setSavingUser(true);
    try {
      await callAdminApi('update_user', {
        id: editingUser.id,
        full_name: userForm.full_name || null,
        company_id: userForm.company_id || null,
        is_active: userForm.is_active,
        is_individual: userForm.is_individual || !userForm.company_id,
      });
      toast({ title: 'Usuario actualizado', description: `${userForm.email} guardado correctamente` });
      setEditingUser(null);
      fetchUsers();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSavingUser(false);
    }
  };

  // Company form fields JSX (inline to prevent input focus loss)
  const companyFormFieldsJSX = (isEditing: boolean) => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="company_name">Nombre de la empresa *</Label>
          <Input
            id="company_name"
            value={companyForm.company_name}
            onChange={(e) => setCompanyForm(f => ({ ...f, company_name: e.target.value }))}
            placeholder="Acme Corp"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ticker">Ticker (si cotiza)</Label>
          <Input
            id="ticker"
            value={companyForm.ticker}
            onChange={(e) => setCompanyForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))}
            placeholder="ACM"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact_email">Email de contacto</Label>
          <Input
            id="contact_email"
            type="email"
            value={companyForm.contact_email}
            onChange={(e) => setCompanyForm(f => ({ ...f, contact_email: e.target.value }))}
            placeholder="contacto@empresa.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact_phone">Teléfono</Label>
          <Input
            id="contact_phone"
            value={companyForm.contact_phone}
            onChange={(e) => setCompanyForm(f => ({ ...f, contact_phone: e.target.value }))}
            placeholder="+34 600 000 000"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="billing_name">Razón social</Label>
          <Input
            id="billing_name"
            value={companyForm.billing_name}
            onChange={(e) => setCompanyForm(f => ({ ...f, billing_name: e.target.value }))}
            placeholder="Acme Corporation S.L."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tax_id">CIF/NIF</Label>
          <Input
            id="tax_id"
            value={companyForm.tax_id}
            onChange={(e) => setCompanyForm(f => ({ ...f, tax_id: e.target.value.toUpperCase() }))}
            placeholder="B12345678"
          />
        </div>
      </div>

      {/* Plan section */}
      <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
        <h4 className="font-medium">Plan y facturación</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="plan_type">Tipo de plan</Label>
            <Select value={companyForm.plan_type} onValueChange={(v) => setCompanyForm(f => ({ ...f, plan_type: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="basic">Basic</SelectItem>
                <SelectItem value="premium">Premium</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="monthly_fee">Cuota mensual (€)</Label>
            <Input
              id="monthly_fee"
              type="number"
              step="0.01"
              value={companyForm.monthly_fee}
              onChange={(e) => setCompanyForm(f => ({ ...f, monthly_fee: e.target.value }))}
              placeholder="0.00"
              disabled={companyForm.is_courtesy}
            />
          </div>
          <div className="space-y-2 flex items-end">
            <div className="flex items-center gap-2 p-2 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <Gift className="h-4 w-4 text-green-600 dark:text-green-400" />
              <Switch
                id="is_courtesy"
                checked={companyForm.is_courtesy}
                onCheckedChange={(v) => setCompanyForm(f => ({ ...f, is_courtesy: v, monthly_fee: v ? '0' : f.monthly_fee }))}
              />
              <Label htmlFor="is_courtesy" className="text-sm text-green-700 dark:text-green-300">
                Plan cortesía (0€)
              </Label>
            </div>
          </div>
        </div>
      </div>

      {isEditing && (
        <div className="flex items-center gap-2">
          <Switch
            id="is_active"
            checked={companyForm.is_active}
            onCheckedChange={(v) => setCompanyForm(f => ({ ...f, is_active: v }))}
          />
          <Label htmlFor="is_active">Empresa activa</Label>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="notes">Notas internas</Label>
        <Textarea
          id="notes"
          value={companyForm.notes}
          onChange={(e) => setCompanyForm(f => ({ ...f, notes: e.target.value }))}
          placeholder="Notas internas sobre la empresa..."
          rows={2}
        />
      </div>
    </div>
  );

  return (
    <Layout title="Admin - RepIndex">
      <div className="container max-w-6xl mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Panel de Administración</h1>
          <p className="text-muted-foreground">
            Gestión de empresas cliente y usuarios de RepIndex
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full max-w-xl grid-cols-3 mb-6">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Resumen
            </TabsTrigger>
            <TabsTrigger value="companies" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Empresas
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Usuarios
            </TabsTrigger>
          </TabsList>

          {/* ==================== RESUMEN ==================== */}
          <TabsContent value="overview">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Resumen de Clientes</h2>
              <Button variant="outline" size="sm" onClick={() => { fetchCompanies(); fetchUsers(); }}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            {(loadingCompanies || loadingUsers) ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Statistics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-bold text-primary">{companies.length}</p>
                      <p className="text-sm text-muted-foreground">Empresas</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-bold text-blue-600">{users.length}</p>
                      <p className="text-sm text-muted-foreground">Usuarios</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-bold text-green-600">{companies.filter(c => c.is_active).length}</p>
                      <p className="text-sm text-muted-foreground">Activas</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-bold text-amber-600">{users.filter(u => u.is_individual).length}</p>
                      <p className="text-sm text-muted-foreground">Particulares</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Companies with their users */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Empresas y sus usuarios</h3>
                  {companies.map((company) => {
                    const companyUsers = users.filter(u => u.company_id === company.id);
                    return (
                      <Card key={company.id} className={!company.is_active ? 'opacity-60' : ''}>
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                <Building2 className="h-5 w-5 text-primary" />
                              </div>
                              <div>
                                <CardTitle className="text-base">{company.company_name}</CardTitle>
                                <CardDescription>
                                  {company.contact_email || 'Sin email'}
                                  {company.ticker && ` · ${company.ticker}`}
                                </CardDescription>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={company.is_active ? 'default' : 'secondary'}>
                                {company.is_active ? 'Activa' : 'Inactiva'}
                              </Badge>
                              <Badge variant="outline" className={company.plan_type === 'premium' ? 'border-amber-500 text-amber-600' : company.plan_type === 'enterprise' ? 'border-purple-500 text-purple-600' : ''}>
                                {company.plan_type}
                              </Badge>
                              {company.monthly_fee === 0 && company.plan_type !== 'basic' && (
                                <Badge variant="outline" className="border-green-500 text-green-600">
                                  <Gift className="h-3 w-3 mr-1" />
                                  Cortesía
                                </Badge>
                              )}
                              <Button variant="ghost" size="sm" onClick={() => openEditCompany(company)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-2">
                          {companyUsers.length > 0 ? (
                            <div className="border rounded-lg divide-y">
                              {companyUsers.map((user) => (
                                <div key={user.id} className="flex items-center justify-between p-3 hover:bg-muted/30">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                      <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <div>
                                      <p className="font-medium text-sm">{user.full_name || 'Sin nombre'}</p>
                                      <p className="text-xs text-muted-foreground">{user.email}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant={user.is_active ? 'default' : 'secondary'} className="text-xs">
                                      {user.is_active ? 'Activo' : 'Inactivo'}
                                    </Badge>
                                    <Button variant="ghost" size="sm" onClick={() => openEditUser(user)} title="Editar usuario">
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => handleSendMagicLink(user.id, user.email)} title="Enviar Magic Link">
                                      <Mail className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground italic py-2">Sin usuarios asignados</p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}

                  {/* Individual users (Particulares) */}
                  {users.filter(u => u.is_individual || !u.company_id).length > 0 && (
                    <Card className="border-dashed">
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                            <Users className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                          </div>
                          <div>
                            <CardTitle className="text-base">Usuarios Particulares</CardTitle>
                            <CardDescription>Usuarios sin empresa asociada</CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-2">
                        <div className="border rounded-lg divide-y">
                          {users.filter(u => u.is_individual || !u.company_id).map((user) => (
                            <div key={user.id} className="flex items-center justify-between p-3 hover:bg-muted/30">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                                  <Users className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                </div>
                                <div>
                                  <p className="font-medium text-sm">{user.full_name || 'Sin nombre'}</p>
                                  <p className="text-xs text-muted-foreground">{user.email}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">Particular</Badge>
                                <Badge variant={user.is_active ? 'default' : 'secondary'} className="text-xs">
                                  {user.is_active ? 'Activo' : 'Inactivo'}
                                </Badge>
                                <Button variant="ghost" size="sm" onClick={() => openEditUser(user)} title="Editar usuario">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => handleSendMagicLink(user.id, user.email)} title="Enviar Magic Link">
                                  <Mail className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          {/* ==================== EMPRESAS ==================== */}
          <TabsContent value="companies">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Empresas Cliente</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={fetchCompanies}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button onClick={() => { resetCompanyForm(); setShowCompanyForm(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva Empresa
                </Button>
              </div>
            </div>

            {/* Create company form */}
            {showCompanyForm && (
              <Card className="mb-6 border-primary/50">
                <CardHeader>
                  <CardTitle className="text-lg">Nueva Empresa</CardTitle>
                  <CardDescription>Rellena los datos de la empresa cliente</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateCompany} className="space-y-4">
                    {companyFormFieldsJSX(false)}
                    <div className="flex gap-2 justify-end">
                      <Button type="button" variant="outline" onClick={() => setShowCompanyForm(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={savingCompany}>
                        {savingCompany ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                        Crear Empresa
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            {/* Edit company dialog */}
            <Dialog open={!!editingCompany} onOpenChange={(open) => !open && setEditingCompany(null)}>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Editar Empresa</DialogTitle>
                  <DialogDescription>Modifica los datos de {editingCompany?.company_name}</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleUpdateCompany} className="space-y-4">
                  {companyFormFieldsJSX(true)}
                  <div className="flex gap-2 justify-end">
                    <Button type="button" variant="outline" onClick={() => setEditingCompany(null)}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={savingCompany}>
                      {savingCompany ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                      Guardar Cambios
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>

            {loadingCompanies ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : companies.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No hay empresas registradas</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {companies.map((company) => (
                  <Card key={company.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{company.company_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {company.contact_email || 'Sin email'}
                            {company.ticker && ` · ${company.ticker}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={company.is_active ? 'default' : 'secondary'}>
                          {company.is_active ? 'Activa' : 'Inactiva'}
                        </Badge>
                        <Badge variant="outline" className={company.plan_type === 'premium' ? 'border-amber-500 text-amber-600' : company.plan_type === 'enterprise' ? 'border-purple-500 text-purple-600' : ''}>
                          {company.plan_type}
                        </Badge>
                        {company.monthly_fee === 0 && company.plan_type !== 'basic' && (
                          <Badge variant="outline" className="border-green-500 text-green-600">
                            <Gift className="h-3 w-3 mr-1" />
                            Cortesía
                          </Badge>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => openEditCompany(company)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ==================== USUARIOS ==================== */}
          <TabsContent value="users">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Usuarios</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={fetchUsers}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button onClick={() => setShowUserForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nuevo Usuario
                </Button>
              </div>
            </div>

            {showUserForm && (
              <Card className="mb-6 border-primary/50">
                <CardHeader>
                  <CardTitle className="text-lg">Nuevo Usuario</CardTitle>
                  <CardDescription>El usuario recibirá un Magic Link para acceder</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateUser} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="user_email">Email *</Label>
                        <Input
                          id="user_email"
                          type="email"
                          value={userForm.email}
                          onChange={(e) => setUserForm(f => ({ ...f, email: e.target.value }))}
                          placeholder="usuario@empresa.com"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="full_name">Nombre completo</Label>
                        <Input
                          id="full_name"
                          value={userForm.full_name}
                          onChange={(e) => setUserForm(f => ({ ...f, full_name: e.target.value }))}
                          placeholder="Juan García"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="user_company">Empresa</Label>
                        <Select 
                          value={userForm.company_id || "_none"} 
                          onValueChange={(v) => setUserForm(f => ({ ...f, company_id: v === "_none" ? "" : v, is_individual: v === "_none" }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar empresa..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">Sin empresa (particular)</SelectItem>
                            {companies.map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2 flex items-end">
                        <div className="flex items-center gap-2">
                          <Switch
                            id="send_magic_link"
                            checked={userForm.send_magic_link}
                            onCheckedChange={(v) => setUserForm(f => ({ ...f, send_magic_link: v }))}
                          />
                          <Label htmlFor="send_magic_link">Enviar Magic Link al crear</Label>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button type="button" variant="outline" onClick={() => setShowUserForm(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={savingUser}>
                        {savingUser ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                        Crear Usuario
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            {/* Edit user dialog */}
            <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Editar Usuario</DialogTitle>
                  <DialogDescription>Modifica los datos de {editingUser?.email}</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleUpdateUser} className="space-y-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input value={userForm.email} disabled className="bg-muted" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit_full_name">Nombre completo</Label>
                      <Input
                        id="edit_full_name"
                        value={userForm.full_name}
                        onChange={(e) => setUserForm(f => ({ ...f, full_name: e.target.value }))}
                        placeholder="Juan García"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit_user_company">Empresa</Label>
                      <Select 
                        value={userForm.company_id || "_none"} 
                        onValueChange={(v) => setUserForm(f => ({ ...f, company_id: v === "_none" ? "" : v, is_individual: v === "_none" }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar empresa..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Sin empresa (particular)</SelectItem>
                          {companies.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="edit_is_active"
                        checked={userForm.is_active}
                        onCheckedChange={(v) => setUserForm(f => ({ ...f, is_active: v }))}
                      />
                      <Label htmlFor="edit_is_active">Usuario activo</Label>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button type="button" variant="outline" onClick={() => setEditingUser(null)}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={savingUser}>
                      {savingUser ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                      Guardar Cambios
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>

            {loadingUsers ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : users.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Users className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No hay usuarios registrados</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {users.map((user) => (
                  <Card key={user.id}>
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                          <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <p className="font-medium">{user.full_name || user.email}</p>
                          <p className="text-sm text-muted-foreground">
                            {user.email}
                            {user.client_companies && ` · ${user.client_companies.company_name}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={user.is_active ? 'default' : 'secondary'}>
                          {user.is_active ? 'Activo' : 'Inactivo'}
                        </Badge>
                        {user.is_individual && <Badge variant="outline">Particular</Badge>}
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => openEditUser(user)}
                          title="Editar usuario"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleSendMagicLink(user.id, user.email)}
                          title="Enviar Magic Link"
                        >
                          <Mail className="h-4 w-4 mr-1" />
                          Enviar Link
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default Admin;
