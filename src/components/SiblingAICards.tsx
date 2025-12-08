import React from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChatGPTIcon } from "@/components/ui/chatgpt-icon";
import { GeminiIcon } from "@/components/ui/gemini-icon";
import { PerplexityIcon } from "@/components/ui/perplexity-icon";
import { DeepseekIcon } from "@/components/ui/deepseek-icon";
import { ArrowRight } from "lucide-react";

interface SiblingRixRun {
  id: string;
  model_name: string;
  rix_score: number;
  target_name: string;
  ticker: string;
}

interface SiblingAICardsProps {
  siblings: SiblingRixRun[];
  companyName: string;
  isLoading?: boolean;
}

const getModelIcon = (modelName: string) => {
  const name = modelName.toLowerCase();
  if (name.includes("chatgpt") || name.includes("gpt")) {
    return ChatGPTIcon;
  }
  if (name.includes("gemini") || name.includes("google")) {
    return GeminiIcon;
  }
  if (name.includes("perplexity")) {
    return PerplexityIcon;
  }
  if (name.includes("deepseek")) {
    return DeepseekIcon;
  }
  return ChatGPTIcon;
};

const getScoreColor = (score: number) => {
  if (score >= 70) return "text-good";
  if (score >= 40) return "text-needs-improvement";
  return "text-insufficient";
};

const getScoreBgColor = (score: number) => {
  if (score >= 70) return "bg-good/10";
  if (score >= 40) return "bg-needs-improvement/10";
  return "bg-insufficient/10";
};

export function SiblingAICards({ siblings, companyName, isLoading }: SiblingAICardsProps) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Otras evaluaciones
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-14 bg-muted/50 rounded-lg animate-pulse"
            />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!siblings || siblings.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Otras evaluaciones de {companyName}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {siblings.map((sibling) => {
          const Icon = getModelIcon(sibling.model_name);
          const scoreColor = getScoreColor(sibling.rix_score);
          const bgColor = getScoreBgColor(sibling.rix_score);

          return (
            <div
              key={sibling.id}
              onClick={() => navigate(`/rix-run/${sibling.id}`)}
              className={`
                flex items-center justify-between p-3 rounded-lg cursor-pointer
                transition-all duration-200 hover:shadow-md hover:scale-[1.02]
                ${bgColor} hover:bg-accent/50 border border-transparent hover:border-border
                group
              `}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 flex items-center justify-center">
                  <Icon className="w-6 h-6" />
                </div>
                <span className="font-medium text-sm">
                  {sibling.model_name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xl font-bold ${scoreColor}`}>
                  {sibling.rix_score}
                </span>
                <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
