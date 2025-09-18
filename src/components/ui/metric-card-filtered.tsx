import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AIFilter } from "@/components/layout/Header";

interface MetricCardFilteredProps {
  label: string;
  scoreChatGPT: number;
  scorePerplexity: number;
  deltaPercent?: number;
  deltaAbs?: number;
  aiFilter?: AIFilter;
  className?: string;
}

export function MetricCardFiltered({ 
  label, 
  scoreChatGPT, 
  scorePerplexity, 
  deltaPercent,
  deltaAbs,
  aiFilter = "all",
  className 
}: MetricCardFilteredProps) {
  const winner = scoreChatGPT > scorePerplexity ? "ChatGPT" : 
                scorePerplexity > scoreChatGPT ? "Perplexity" : "Tie";

  const getScoreColor = (score: number, isWinner: boolean, isDimmed: boolean) => {
    if (isDimmed) return "text-muted-foreground";
    if (isWinner) {
      return score >= 80 ? "text-excellent" : 
             score >= 60 ? "text-good" : 
             score >= 40 ? "text-needs-improvement" : "text-insufficient";
    }
    return "text-muted-foreground";
  };

  const showChatGPT = aiFilter === "all" || aiFilter === "chatgpt";
  const showPerplexity = aiFilter === "all" || aiFilter === "perplexity";
  const chatGPTDimmed = aiFilter === "perplexity";
  const perplexityDimmed = aiFilter === "chatgpt";

  return (
    <Card className={cn("relative", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {showChatGPT && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">ChatGPT</span>
            <span className={cn(
              "font-bold",
              getScoreColor(scoreChatGPT, winner === "ChatGPT", chatGPTDimmed)
            )}>
              {scoreChatGPT}
            </span>
          </div>
        )}
        {showPerplexity && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Perplexity</span>
            <span className={cn(
              "font-bold",
              getScoreColor(scorePerplexity, winner === "Perplexity", perplexityDimmed)
            )}>
              {scorePerplexity}
            </span>
          </div>
        )}
        {aiFilter === "all" && deltaPercent !== undefined && (
          <div className="flex items-center justify-between pt-1 border-t">
            <span className="text-xs text-muted-foreground">Δ%</span>
            <Badge variant={deltaPercent > 0 ? "default" : "secondary"} className="text-xs">
              {deltaPercent > 0 ? "+" : ""}{deltaPercent.toFixed(1)}%
            </Badge>
          </div>
        )}
      </CardContent>
      {aiFilter === "all" && winner !== "Tie" && (
        <div className={cn(
          "absolute top-2 right-2 h-2 w-2 rounded-full",
          winner === "ChatGPT" ? "bg-chatgpt" : "bg-perplexity"
        )} />
      )}
    </Card>
  );
}