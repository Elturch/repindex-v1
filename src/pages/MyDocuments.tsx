import React, { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  FileText, 
  Download, 
  Star, 
  StarOff, 
  Trash2, 
  Search,
  Calendar,
  Building2,
  MessageSquare,
  FileDown,
  Loader2,
  FolderOpen
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';

interface UserDocument {
  id: string;
  document_type: 'bulletin' | 'chat_export' | 'report';
  title: string;
  company_name: string | null;
  ticker: string | null;
  content_html: string | null;
  content_markdown: string | null;
  is_starred: boolean;
  created_at: string;
}

const MyDocuments: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [documents, setDocuments] = useState<UserDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  useEffect(() => {
    if (user) {
      fetchDocuments();
    }
  }, [user]);

  const fetchDocuments = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_documents')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments(data as UserDocument[] || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los documentos.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleStar = async (docId: string, currentStarred: boolean) => {
    try {
      const { error } = await supabase
        .from('user_documents')
        .update({ is_starred: !currentStarred })
        .eq('id', docId);

      if (error) throw error;
      
      setDocuments(docs => 
        docs.map(d => d.id === docId ? { ...d, is_starred: !currentStarred } : d)
      );
    } catch (error) {
      console.error('Error toggling star:', error);
    }
  };

  const archiveDocument = async (docId: string) => {
    try {
      const { error } = await supabase
        .from('user_documents')
        .update({ is_archived: true })
        .eq('id', docId);

      if (error) throw error;
      
      setDocuments(docs => docs.filter(d => d.id !== docId));
      toast({
        title: "Documento archivado",
        description: "El documento se ha movido al archivo.",
      });
    } catch (error) {
      console.error('Error archiving document:', error);
      toast({
        title: "Error",
        description: "No se pudo archivar el documento.",
        variant: "destructive",
      });
    }
  };

  const downloadDocument = (doc: UserDocument) => {
    const content = doc.content_html || doc.content_markdown || '';
    const blob = new Blob([content], { type: doc.content_html ? 'text/html' : 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.title.replace(/\s+/g, '_')}.${doc.content_html ? 'html' : 'md'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getDocTypeIcon = (type: string) => {
    switch (type) {
      case 'bulletin':
        return <FileText className="h-5 w-5 text-primary" />;
      case 'chat_export':
        return <MessageSquare className="h-5 w-5 text-blue-500" />;
      case 'report':
        return <FileDown className="h-5 w-5 text-green-500" />;
      default:
        return <FileText className="h-5 w-5" />;
    }
  };

  const getDocTypeLabel = (type: string) => {
    switch (type) {
      case 'bulletin':
        return 'Boletín';
      case 'chat_export':
        return 'Export Chat';
      case 'report':
        return 'Informe';
      default:
        return type;
    }
  };

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (doc.company_name?.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesFilter = filterType === 'all' || doc.document_type === filterType;
    return matchesSearch && matchesFilter;
  });

  const starredDocs = filteredDocuments.filter(d => d.is_starred);
  const regularDocs = filteredDocuments.filter(d => !d.is_starred);

  return (
    <Layout title="Mis Documentos">
      <div className="container max-w-6xl mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Mis Documentos</h1>
          <p className="text-muted-foreground">
            Boletines, informes y exports de conversaciones guardados
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar documentos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant={filterType === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterType('all')}
            >
              Todos
            </Button>
            <Button
              variant={filterType === 'bulletin' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterType('bulletin')}
            >
              Boletines
            </Button>
            <Button
              variant={filterType === 'chat_export' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterType('chat_export')}
            >
              Chats
            </Button>
            <Button
              variant={filterType === 'report' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterType('report')}
            >
              Informes
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredDocuments.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Sin documentos</h3>
              <p className="text-muted-foreground text-center max-w-sm">
                {searchQuery 
                  ? 'No se encontraron documentos con esa búsqueda.' 
                  : 'Aquí aparecerán los boletines e informes que generes desde el chat.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Starred documents */}
            {starredDocs.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  Destacados
                </h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {starredDocs.map(doc => (
                    <DocumentCard
                      key={doc.id}
                      document={doc}
                      onToggleStar={toggleStar}
                      onArchive={archiveDocument}
                      onDownload={downloadDocument}
                      getDocTypeIcon={getDocTypeIcon}
                      getDocTypeLabel={getDocTypeLabel}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Regular documents */}
            {regularDocs.length > 0 && (
              <div>
                {starredDocs.length > 0 && (
                  <h2 className="text-sm font-medium text-muted-foreground mb-3">
                    Todos los documentos
                  </h2>
                )}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {regularDocs.map(doc => (
                    <DocumentCard
                      key={doc.id}
                      document={doc}
                      onToggleStar={toggleStar}
                      onArchive={archiveDocument}
                      onDownload={downloadDocument}
                      getDocTypeIcon={getDocTypeIcon}
                      getDocTypeLabel={getDocTypeLabel}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

interface DocumentCardProps {
  document: UserDocument;
  onToggleStar: (id: string, starred: boolean) => void;
  onArchive: (id: string) => void;
  onDownload: (doc: UserDocument) => void;
  getDocTypeIcon: (type: string) => React.ReactNode;
  getDocTypeLabel: (type: string) => string;
}

const DocumentCard: React.FC<DocumentCardProps> = ({
  document: doc,
  onToggleStar,
  onArchive,
  onDownload,
  getDocTypeIcon,
  getDocTypeLabel,
}) => {
  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {getDocTypeIcon(doc.document_type)}
            <Badge variant="secondary" className="text-xs">
              {getDocTypeLabel(doc.document_type)}
            </Badge>
          </div>
          <button
            onClick={() => onToggleStar(doc.id, doc.is_starred)}
            className="opacity-0 group-hover:opacity-100 transition-opacity"
          >
            {doc.is_starred ? (
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
            ) : (
              <StarOff className="h-4 w-4 text-muted-foreground hover:text-yellow-400" />
            )}
          </button>
        </div>
        <CardTitle className="text-base line-clamp-2 mt-2">
          {doc.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {doc.company_name && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              <span>{doc.company_name}</span>
              {doc.ticker && (
                <Badge variant="outline" className="text-xs">
                  {doc.ticker}
                </Badge>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            <span>
              {format(new Date(doc.created_at), "d 'de' MMMM, yyyy", { locale: es })}
            </span>
          </div>
          
          <div className="flex items-center gap-2 pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => onDownload(doc)}
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              Descargar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onArchive(doc.id)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default MyDocuments;
