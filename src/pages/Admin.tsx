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
import { 
  Building2, 
  Users, 
  Plus, 
  Loader2, 
  CheckCircle,
  Mail,
  RefreshCw
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Company {
  id: string;
  company_name: string;
  ticker: string | null;
  contact_email: string | null;
  plan_type: string;
  is_active: boolean;
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
  const [activeTab, setActiveTab] = useState('companies');
  
  // Companies state
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [showCompanyForm, setShowCompanyForm] = useState(false);
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
    notes: '',
  });

  // Users state
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [showUserForm, setShowUserForm] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [userForm, setUserForm] = useState({
    email: '',
    full_name: '',
    company_id: '',
    is_individual: false,
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
        monthly_fee: companyForm.monthly_fee ? parseFloat(companyForm.monthly_fee) : 0,
      });
      toast({ title: 'Empresa creada', description: `${companyForm.company_name} añadida correctamente` });
      setShowCompanyForm(false);
      setCompanyForm({
        company_name: '', ticker: '', contact_email: '', contact_phone: '',
        billing_name: '', billing_address: '', billing_city: '', billing_postal_code: '',
        tax_id: '', plan_type: 'basic', monthly_fee: '', notes: '',
      });
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
      setUserForm({ email: '', full_name: '', company_id: '', is_individual: false, send_magic_link: true });
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
          <TabsList className="grid w-full max-w-md grid-cols-2 mb-6">
            <TabsTrigger value="companies" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Empresas
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Usuarios
            </TabsTrigger>
          </TabsList>

          {/* ==================== EMPRESAS ==================== */}
          <TabsContent value="companies">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Empresas Cliente</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={fetchCompanies}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button onClick={() => setShowCompanyForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva Empresa
                </Button>
              </div>
            </div>

            {showCompanyForm && (
              <Card className="mb-6 border-primary/50">
                <CardHeader>
                  <CardTitle className="text-lg">Nueva Empresa</CardTitle>
                  <CardDescription>Rellena los datos de la empresa cliente</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateCompany} className="space-y-4">
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
                        <Label htmlFor="plan_type">Plan</Label>
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
                        <Label htmlFor="tax_id">CIF/NIF</Label>
                        <Input
                          id="tax_id"
                          value={companyForm.tax_id}
                          onChange={(e) => setCompanyForm(f => ({ ...f, tax_id: e.target.value.toUpperCase() }))}
                          placeholder="B12345678"
                        />
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
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="notes">Notas</Label>
                      <Textarea
                        id="notes"
                        value={companyForm.notes}
                        onChange={(e) => setCompanyForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="Notas internas sobre la empresa..."
                        rows={2}
                      />
                    </div>
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
                  <Card key={company.id}>
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
                        <Badge variant="outline">{company.plan_type}</Badge>
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
                          value={userForm.company_id} 
                          onValueChange={(v) => setUserForm(f => ({ ...f, company_id: v, is_individual: v === '' }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar empresa..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Sin empresa (particular)</SelectItem>
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
                          onClick={() => handleSendMagicLink(user.id, user.email)}
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
