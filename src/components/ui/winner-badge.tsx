import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface WinnerBadgeProps {
  winner: "ChatGPT" | "Perplexity" | "Tie" | null;
  className?: string;
}

export function WinnerBadge({ winner, className }: WinnerBadgeProps) {
  if (!winner) return null;

  const getVariantStyle = (winner: string) => {
    switch (winner) {
      case "ChatGPT":
        return "bg-chatgpt text-chatgpt-foreground hover:bg-chatgpt/80";
      case "Perplexity":
        return "bg-perplexity text-perplexity-foreground hover:bg-perplexity/80";
      case "Tie":
        return "bg-neutral text-neutral-foreground hover:bg-neutral/80";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <Badge 
      className={cn(
        getVariantStyle(winner),
        "border-transparent",
        className
      )}
    >
      {winner}
    </Badge>
  );
}