-- Create sales_conversations table for Sales Intelligence Agent
CREATE TABLE public.sales_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  ticker TEXT,
  target_profile TEXT NOT NULL DEFAULT 'ceo',
  custom_context TEXT,
  messages JSONB NOT NULL DEFAULT '[]',
  message_ratings JSONB NOT NULL DEFAULT '{}',
  rix_questions TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  is_starred BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create sales_pptx_exports table for PPTX generation history
CREATE TABLE public.sales_pptx_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.sales_conversations(id) ON DELETE SET NULL,
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  target_profile TEXT NOT NULL,
  slides_count INTEGER NOT NULL DEFAULT 0,
  slide_designs JSONB NOT NULL DEFAULT '[]',
  high_rated_content TEXT[] DEFAULT '{}',
  file_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sales_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_pptx_exports ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Only admins can access
CREATE POLICY "Admins can manage sales conversations"
  ON public.sales_conversations FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage pptx exports"
  ON public.sales_pptx_exports FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_sales_conversation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sales_conversations_updated_at
  BEFORE UPDATE ON public.sales_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_sales_conversation_updated_at();

-- Create indexes for performance
CREATE INDEX idx_sales_conversations_admin_user ON public.sales_conversations(admin_user_id);
CREATE INDEX idx_sales_conversations_company ON public.sales_conversations(company_name);
CREATE INDEX idx_sales_conversations_starred ON public.sales_conversations(is_starred) WHERE is_starred = true;
CREATE INDEX idx_sales_pptx_exports_conversation ON public.sales_pptx_exports(conversation_id);
CREATE INDEX idx_sales_pptx_exports_admin_user ON public.sales_pptx_exports(admin_user_id);