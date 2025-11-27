-- Create table for chat intelligence sessions
CREATE TABLE chat_intelligence_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  company TEXT,
  week TEXT,
  analysis_type TEXT,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  suggested_questions JSONB,
  documents_found INTEGER DEFAULT 0,
  structured_data_found INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast session lookups
CREATE INDEX idx_chat_intel_session ON chat_intelligence_sessions(session_id, created_at);

-- Enable RLS
ALTER TABLE chat_intelligence_sessions ENABLE ROW LEVEL SECURITY;

-- Public access policies (no auth required)
CREATE POLICY "Acceso público lectura chat_intel" 
  ON chat_intelligence_sessions 
  FOR SELECT 
  USING (true);

CREATE POLICY "Acceso público inserción chat_intel" 
  ON chat_intelligence_sessions 
  FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Acceso público eliminación chat_intel" 
  ON chat_intelligence_sessions 
  FOR DELETE 
  USING (true);