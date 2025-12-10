import { useState } from "react";
import { ThumbsUp, ThumbsDown, Check } from "lucide-react";
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
      <div className={`flex items-center gap-1 ${compact ? 'mt-1' : 'mt-1.5'} opacity-50`}>
        <Check className="h-2.5 w-2.5 text-muted-foreground" />
        <span className={`${compact ? 'text-[8px]' : 'text-[9px]'} text-muted-foreground`}>
          Gracias
        </span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-0.5 ${compact ? 'mt-1' : 'mt-1.5'} opacity-40 hover:opacity-100 transition-opacity`}>
      <span className={`${compact ? 'text-[9px]' : 'text-[10px]'} text-muted-foreground mr-0.5`}>
        ¿Útil?
      </span>
      <button
        onClick={() => handleFeedback('positive')}
        disabled={isSubmitting}
        className={`${compact ? 'p-0.5' : 'p-1'} text-muted-foreground/50 hover:text-green-600 transition-colors disabled:opacity-50`}
        title="Respuesta útil"
      >
        <ThumbsUp className={`${compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} stroke-[1.5]`} />
      </button>
      <button
        onClick={() => handleFeedback('negative')}
        disabled={isSubmitting}
        className={`${compact ? 'p-0.5' : 'p-1'} text-muted-foreground/50 hover:text-red-600 transition-colors disabled:opacity-50`}
        title="Respuesta mejorable"
      >
        <ThumbsDown className={`${compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} stroke-[1.5]`} />
      </button>
    </div>
  );
}
