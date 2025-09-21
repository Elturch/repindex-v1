import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const InsertPariResults = () => {
  const [jsonData, setJsonData] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleInsert = async () => {
    if (!jsonData.trim()) {
      toast({
        title: "Error",
        description: "Por favor introduce los datos JSON",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Parse the JSON data
      const lines = jsonData.trim().split('\n');
      const results = lines
        .filter(line => line.trim())
        .map(line => JSON.parse(line.trim()));

      console.log('Parsed results:', results);

      // Call the edge function
      const { data, error } = await supabase.functions.invoke('insert-pari-results', {
        body: { results }
      });

      if (error) throw error;

      toast({
        title: "Éxito",
        description: `Se insertaron ${data.inserted_count} registros correctamente`,
      });

      setJsonData('');
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: error.message || "Error al insertar los datos",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Insertar Resultados PARI</CardTitle>
          <CardDescription>
            Pega los resultados JSON (uno por línea) para insertarlos en la base de datos.
            Asegúrate de reemplazar los placeholders como {'{RUN_ID}'}, {'{MODEL_NAME}'}, etc.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Pega aquí los objetos JSON, uno por línea..."
            value={jsonData}
            onChange={(e) => setJsonData(e.target.value)}
            className="min-h-[300px] font-mono text-sm"
          />
          
          <div className="flex gap-2">
            <Button 
              onClick={handleInsert}
              disabled={loading || !jsonData.trim()}
            >
              {loading ? 'Insertando...' : 'Insertar Datos'}
            </Button>
            
            <Button 
              variant="outline"
              onClick={() => setJsonData('')}
              disabled={loading}
            >
              Limpiar
            </Button>
          </div>

          <div className="text-sm text-muted-foreground">
            <p className="font-medium mb-2">Nota importante:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Reemplaza todos los placeholders (ej: {'{RUN_ID}'} → "RUN-001-GPT4")</li>
              <li>Cada objeto JSON debe estar en una línea separada</li>
              <li>Asegúrate de que las fechas estén en formato YYYY-MM-DD</li>
              <li>Los tickers pueden ser null si no aplican</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default InsertPariResults;