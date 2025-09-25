import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatGPTIcon } from "@/components/ui/chatgpt-icon";
import { PerplexityIcon } from "@/components/ui/perplexity-icon";

interface AIResponseDialogProps {
  title: string;
  content: string;
  icon?: React.ComponentType<{ className?: string }>;
  createdAt?: string;
  periodFrom?: string;
  periodTo?: string;
}

export default function AIResponseDialog({ 
  title,
  content,
  icon: Icon,
  createdAt,
  periodFrom,
  periodTo,
}: AIResponseDialogProps) {
  if (!content) {
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
          {title}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {Icon && <Icon className="h-5 w-5" />}
            {title}
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
                {content}
              </pre>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}