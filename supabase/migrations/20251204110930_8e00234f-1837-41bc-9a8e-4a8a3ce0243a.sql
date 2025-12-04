-- =====================================================
-- SISTEMA DE AUTENTICACIÓN Y ESPACIO PERSONAL REPINDEX
-- =====================================================

-- 1. ENUM para roles de aplicación
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'user');

-- 2. Tabla de empresas cliente (contratantes)
CREATE TABLE public.client_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  ticker text, -- Opcional: solo si es empresa analizada en RepIndex
  contact_email text,
  contact_phone text,
  
  -- Datos de facturación
  billing_name text, -- Razón social
  billing_address text,
  billing_city text,
  billing_postal_code text,
  billing_country text DEFAULT 'España',
  tax_id text, -- CIF/NIF
  
  -- Contrato y plan
  plan_type text DEFAULT 'basic' CHECK (plan_type IN ('basic', 'premium', 'enterprise')),
  monthly_fee numeric(10,2) DEFAULT 0,
  contract_start date,
  contract_end date,
  
  -- Estado y metadata
  is_active boolean DEFAULT true,
  notes text,
  billing_metadata jsonb DEFAULT '{}',
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Tabla de perfiles de usuario
CREATE TABLE public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES client_companies(id) ON DELETE SET NULL,
  email text NOT NULL,
  full_name text,
  avatar_url text,
  
  -- Tipo de usuario
  is_individual boolean DEFAULT false, -- true si es particular sin empresa
  is_active boolean DEFAULT true,
  
  -- Tracking
  last_login timestamptz,
  login_count integer DEFAULT 0,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4. Tabla de roles de usuario (seguridad)
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, role)
);

-- 5. Tabla de conversaciones del usuario
CREATE TABLE public.user_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  session_id text NOT NULL,
  title text DEFAULT 'Nueva conversación',
  
  -- Control de visibilidad
  is_archived boolean DEFAULT false, -- Soft delete para el usuario
  is_starred boolean DEFAULT false, -- Favoritos
  
  -- Metadata
  messages_count integer DEFAULT 0,
  last_message_at timestamptz,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 6. Tabla de documentos del usuario (boletines, exports)
CREATE TABLE public.user_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  conversation_id uuid REFERENCES user_conversations(id) ON DELETE SET NULL,
  
  -- Tipo y contenido
  document_type text NOT NULL CHECK (document_type IN ('bulletin', 'chat_export', 'report')),
  title text NOT NULL,
  company_name text, -- Empresa del boletín si aplica
  ticker text,
  
  -- Contenido
  content_html text,
  content_markdown text,
  pdf_url text, -- URL en storage si se genera PDF
  
  -- Control de visibilidad
  is_archived boolean DEFAULT false, -- Soft delete para el usuario
  is_starred boolean DEFAULT false,
  
  -- Metadata
  metadata jsonb DEFAULT '{}',
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 7. Tabla de facturas
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES client_companies(id) ON DELETE CASCADE NOT NULL,
  
  -- Datos de factura
  invoice_number text NOT NULL UNIQUE,
  invoice_date date NOT NULL,
  due_date date,
  
  -- Importes
  subtotal numeric(10,2) NOT NULL,
  tax_rate numeric(5,2) DEFAULT 21.00,
  tax_amount numeric(10,2) NOT NULL,
  total_amount numeric(10,2) NOT NULL,
  
  -- Estado
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  paid_at timestamptz,
  
  -- Detalle
  line_items jsonb DEFAULT '[]',
  notes text,
  pdf_url text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 8. Añadir conversation_id a chat_intelligence_sessions existente
ALTER TABLE public.chat_intelligence_sessions 
ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES user_conversations(id) ON DELETE SET NULL;

ALTER TABLE public.chat_intelligence_sessions 
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- =====================================================
-- FUNCIONES
-- =====================================================

-- Función para verificar roles (SECURITY DEFINER para evitar recursión RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Función para crear perfil automáticamente al registrar usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  
  -- Asignar rol 'user' por defecto
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$$;

-- Trigger para crear perfil en nuevo usuario
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Función para actualizar last_login
CREATE OR REPLACE FUNCTION public.update_last_login()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_profiles
  SET 
    last_login = now(),
    login_count = login_count + 1,
    updated_at = now()
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

-- Función para actualizar updated_at en client_companies
CREATE OR REPLACE FUNCTION public.update_client_companies_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_client_companies_timestamp
  BEFORE UPDATE ON public.client_companies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_client_companies_updated_at();

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE public.client_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Políticas para client_companies
CREATE POLICY "Users can view own company"
ON public.client_companies FOR SELECT
TO authenticated
USING (
  id IN (SELECT company_id FROM public.user_profiles WHERE id = auth.uid())
);

-- Políticas para user_profiles
CREATE POLICY "Users can view own profile"
ON public.user_profiles FOR SELECT
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
ON public.user_profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Políticas para user_roles (solo lectura para usuarios)
CREATE POLICY "Users can view own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Políticas para user_conversations
CREATE POLICY "Users can view own non-archived conversations"
ON public.user_conversations FOR SELECT
TO authenticated
USING (user_id = auth.uid() AND is_archived = false);

CREATE POLICY "Users can insert own conversations"
ON public.user_conversations FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own conversations"
ON public.user_conversations FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Políticas para user_documents
CREATE POLICY "Users can view own non-archived documents"
ON public.user_documents FOR SELECT
TO authenticated
USING (user_id = auth.uid() AND is_archived = false);

CREATE POLICY "Users can insert own documents"
ON public.user_documents FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own documents"
ON public.user_documents FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Políticas para invoices (solo lectura para usuarios de la empresa)
CREATE POLICY "Users can view company invoices"
ON public.invoices FOR SELECT
TO authenticated
USING (
  company_id IN (SELECT company_id FROM public.user_profiles WHERE id = auth.uid())
);

-- =====================================================
-- ÍNDICES
-- =====================================================

CREATE INDEX idx_user_profiles_company ON public.user_profiles(company_id);
CREATE INDEX idx_user_profiles_email ON public.user_profiles(email);
CREATE INDEX idx_user_conversations_user ON public.user_conversations(user_id);
CREATE INDEX idx_user_conversations_session ON public.user_conversations(session_id);
CREATE INDEX idx_user_documents_user ON public.user_documents(user_id);
CREATE INDEX idx_user_documents_type ON public.user_documents(document_type);
CREATE INDEX idx_invoices_company ON public.invoices(company_id);
CREATE INDEX idx_invoices_status ON public.invoices(status);
CREATE INDEX idx_chat_intelligence_sessions_user ON public.chat_intelligence_sessions(user_id);
CREATE INDEX idx_chat_intelligence_sessions_conversation ON public.chat_intelligence_sessions(conversation_id);