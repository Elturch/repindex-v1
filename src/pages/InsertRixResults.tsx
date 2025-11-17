import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const InsertRixResults = () => {
  const [jsonData, setJsonData] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Helper function to validate target_name
  const validateResult = (result: any, index: number) => {
    const errors = [];
    
    if (!result.meta) {
      errors.push(`Resultado ${index + 1}: falta objeto 'meta'`);
    } else {
      const targetName = result.meta.target_name;
      if (!targetName || typeof targetName !== 'string' || !targetName.trim()) {
        errors.push(`Resultado ${index + 1}: 'meta.target_name' es requerido y no puede ser null, undefined, vacío o solo espacios. Valor recibido: ${JSON.stringify(targetName)}`);
      }
    }
    
    return errors;
  };

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
    let results: any[] = [];
    try {
      // Parse the JSON data
      const lines = jsonData.trim().split('\n');
      results = lines
        .filter(line => line.trim())
        .map(line => JSON.parse(line.trim()));

      console.log('Parsed results:', results);

      // Frontend validation
      const allErrors = [];
      results.forEach((result, index) => {
        const errors = validateResult(result, index);
        if (errors.length > 0) {
          allErrors.push(...errors);
          console.error(`Validation error for result ${index}:`, {
            result: result,
            target_name: result.meta?.target_name,
            target_name_type: typeof result.meta?.target_name,
            errors: errors
          });
        }
      });

      if (allErrors.length > 0) {
        toast({
          title: "Error de Validación",
          description: `Se encontraron errores en los datos:\n${allErrors.slice(0, 3).join('\n')}${allErrors.length > 3 ? `\n... y ${allErrors.length - 3} más` : ''}`,
          variant: "destructive",
        });
        console.error('All validation errors:', allErrors);
        return;
      }

      // Call the edge function
      const { data, error } = await supabase.functions.invoke('insert-rix-results', {
        body: { results }
      });

      if (error) throw error;

      toast({
        title: "Éxito",
        description: `Se insertaron ${typeof data.inserted_count === 'number' ? data.inserted_count.toFixed(2) : data.inserted_count} registros correctamente`,
      });

      setJsonData('');
    } catch (error) {
      console.error('Error completo:', error);
      console.error('Datos que causaron error:', results);
      
      let errorMessage = "Error al insertar los datos";
      if (error.message) {
        errorMessage = error.message;
        // Si el error menciona un constraint, dar más información
        if (error.message.includes('03_target_name') && error.message.includes('not-null')) {
          errorMessage = "Error: Uno de los registros tiene un 'target_name' vacío o nulo. Revisa los datos en la consola del navegador.";
        }
      }
      
      toast({
        title: "Error",
        description: errorMessage,
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
          <CardTitle>Insertar Resultados RIX</CardTitle>
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

          <div className="text-sm text-muted-foreground space-y-4">
            <div>
              <p className="font-medium mb-2">Nota importante:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Reemplaza todos los placeholders (ej: {'{RUN_ID}'} → "RUN-001-GPT4")</li>
                <li>Cada objeto JSON debe estar en una línea separada</li>
                <li>Asegúrate de que las fechas estén en formato YYYY-MM-DD</li>
                <li>Los tickers pueden ser null si no aplican</li>
                <li><strong>CRÍTICO:</strong> `meta.target_name` NO puede ser null, vacío o solo espacios</li>
              </ul>
            </div>
            
            <div>
              <p className="font-medium mb-2">Ejemplo de datos válidos:</p>
              <div className="bg-muted p-3 rounded text-xs font-mono overflow-x-auto">
                {`{"meta": {"target_name": "COMPANY_NAME", "model": "gpt-4", "date": "2024-01-15"}, "textual_summaries": {...}, "table_results": {...}}`}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default InsertRixResults;