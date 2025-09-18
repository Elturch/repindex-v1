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
}

export function AIResponseDialog({ 
  modelName, 
  chatgptResponse, 
  perplexityResponse 
}: AIResponseDialogProps) {
  const isChatGPT = modelName?.toLowerCase().includes('chatgpt') || modelName?.toLowerCase().includes('gpt');
  const isPerplexity = modelName?.toLowerCase().includes('perplexity');
  
  // Determine which response to show based on model or available content
  let responseContent = "";
  let buttonText = "Ver Respuesta IA";
  let Icon = null;

  if (isChatGPT && chatgptResponse) {
    responseContent = chatgptResponse;
    buttonText = "Así contestó ChatGPT";
    Icon = ChatGPTIcon;
  } else if (isPerplexity && perplexityResponse) {
    responseContent = perplexityResponse;
    buttonText = "Así contestó Perplexity";
    Icon = PerplexityIcon;
  } else if (chatgptResponse) {
    responseContent = chatgptResponse;
    buttonText = "Así contestó ChatGPT";
    Icon = ChatGPTIcon;
  } else if (perplexityResponse) {
    responseContent = perplexityResponse;
    buttonText = "Así contestó Perplexity";
    Icon = PerplexityIcon;
  }

  if (!responseContent) {
    return null;
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          {Icon && <Icon className="mr-2 h-4 w-4" />}
          {buttonText}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {Icon && <Icon className="h-5 w-5" />}
            {buttonText}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-full max-h-[60vh] pr-4">
          <div className="space-y-4">
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