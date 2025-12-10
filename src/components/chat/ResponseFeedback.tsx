import { useState } from "react";
import { ThumbsUp, ThumbsDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface ResponseFeedbackProps {
  sessionId: string;
  messageIndex: number;
  messageContent: string;
  userQuestion?: string;
  compact?: boolean;
}

export function ResponseFeedback({
  sessionId,
  messageIndex,
  messageContent,
  userQuestion,
  compact = false,
}: ResponseFeedbackProps) {
  const [rating, setRating] = useState<'positive' | 'negative' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const handleFeedback = async (newRating: 'positive' | 'negative') => {
    if (rating) return; // Already rated
    
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('chat_response_feedback')
        .insert({
          session_id: sessionId,
          message_index: messageIndex,
          message_content: messageContent,
          user_question: userQuestion,
          rating: newRating,
          user_id: user?.id || null,
          metadata: {
            rated_at: new Date().toISOString(),
            content_length: messageContent.length,
          }
        });

      if (error) throw error;

      setRating(newRating);
      toast({
        title: newRating === 'positive' ? "¡Gracias!" : "Gracias por tu feedback",
        description: newRating === 'positive' 
          ? "Tu valoración ayuda a mejorar el sistema" 
          : "Usaremos esto para mejorar las respuestas",
      });
    } catch (error) {
      console.error('Error saving feedback:', error);
      toast({
        title: "Error",
        description: "No se pudo guardar la valoración",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (rating) {
    return (
      <div className={`flex items-center gap-1.5 ${compact ? 'mt-1.5' : 'mt-2'} text-muted-foreground`}>
        <Check className="h-3 w-3 text-green-500" />
        <span className={`${compact ? 'text-[10px]' : 'text-xs'}`}>
          Valoración guardada
        </span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1 ${compact ? 'mt-1.5' : 'mt-2'}`}>
      <span className={`${compact ? 'text-[10px]' : 'text-xs'} text-muted-foreground mr-1`}>
        ¿Útil?
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => handleFeedback('positive')}
        disabled={isSubmitting}
        className={`${compact ? 'h-6 w-6 p-0' : 'h-7 w-7 p-0'} hover:bg-green-500/10 hover:text-green-500 transition-colors`}
        title="Respuesta útil"
      >
        <ThumbsUp className={`${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'}`} />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => handleFeedback('negative')}
        disabled={isSubmitting}
        className={`${compact ? 'h-6 w-6 p-0' : 'h-7 w-7 p-0'} hover:bg-red-500/10 hover:text-red-500 transition-colors`}
        title="Respuesta mejorable"
      >
        <ThumbsDown className={`${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'}`} />
      </Button>
    </div>
  );
}
