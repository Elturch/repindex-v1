import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatGPTIcon } from "@/components/ui/chatgpt-icon";
import { PerplexityIcon } from "@/components/ui/perplexity-icon";

interface AIResponseDialogProps {
  modelName?: string;
  chatgptResponse?: string;
  perplexityResponse?: string;
  explanationResponse?: string;
  detailedExplanations?: string[];
  createdAt?: string;
  periodFrom?: string;
  periodTo?: string;
  buttonText?: string;
}

export default function AIResponseDialog({ 
  modelName, 
  chatgptResponse, 
  perplexityResponse,
  explanationResponse,
  detailedExplanations,
  createdAt,
  periodFrom,
  periodTo,
  buttonText
}: AIResponseDialogProps) {
  const isChatGPT = modelName?.toLowerCase().includes('chatgpt') || modelName?.toLowerCase().includes('gpt');
  const isPerplexity = modelName?.toLowerCase().includes('perplexity');
  
  // Determine response content with clear priority and no ambiguous fallbacks
  let responseContent = "";
  let displayButtonText = buttonText || "Ver Respuesta IA";
  let Icon = null;

  // Priority 1: If buttonText is provided, this is likely a specific request
  if (buttonText) {
    if (detailedExplanations && detailedExplanations.length > 0) {
      responseContent = detailedExplanations.join('\n\n');
      displayButtonText = buttonText;
      Icon = null;
    } else if (explanationResponse) {
      responseContent = explanationResponse;
      displayButtonText = buttonText;
      Icon = null;
    }
  } 
  // Priority 2: Model-specific responses (only if no custom buttonText)
  else if (isChatGPT && chatgptResponse) {
    responseContent = chatgptResponse;
    displayButtonText = "Así contestó ChatGPT";
    Icon = ChatGPTIcon;
  } else if (isPerplexity && perplexityResponse) {
    responseContent = perplexityResponse;
    displayButtonText = "Así contestó Perplexity";
    Icon = PerplexityIcon;
  } 
  // Priority 3: Generic model responses (fallback for model-specific)
  else if (chatgptResponse && !buttonText) {
    responseContent = chatgptResponse;
    displayButtonText = "Respuesta IA - ChatGPT";
    Icon = ChatGPTIcon;
  } else if (perplexityResponse && !buttonText) {
    responseContent = perplexityResponse;
    displayButtonText = "Respuesta IA - Perplexity";
    Icon = PerplexityIcon;
  }

  if (!responseContent) {
    return null;
  }

  const formatDateRange = (from?: string, to?: string) => {
    if (!from && !to) return "N/A";
    if (!to) return from ? new Date(from).toLocaleDateString() : "N/A";
    if (!from) return to ? new Date(to).toLocaleDateString() : "N/A";
    
    const fromDate = new Date(from).toLocaleDateString();
    const toDate = new Date(to).toLocaleDateString();
    return `${fromDate} - ${toDate}`;
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          {Icon && <Icon className="mr-2 h-4 w-4" />}
          {displayButtonText}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {Icon && <Icon className="h-5 w-5" />}
            {displayButtonText}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-full max-h-[60vh] pr-4">
          <div className="space-y-4">
            {/* Date Information */}
            <div className="bg-muted/50 p-3 rounded-lg space-y-2 text-sm">
              {createdAt && (
                <div>
                  <span className="font-medium text-muted-foreground">Fecha de análisis: </span>
                  <span>{new Date(createdAt).toLocaleString()}</span>
                </div>
              )}
              <div>
                <span className="font-medium text-muted-foreground">Período analizado: </span>
                <span>{formatDateRange(periodFrom, periodTo)}</span>
              </div>
            </div>
            
            {/* AI Response Content */}
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">
                {responseContent}
              </pre>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}