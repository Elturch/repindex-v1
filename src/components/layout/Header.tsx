import { Sun, Moon, MessageCircle, LayoutDashboard, TrendingUp, Newspaper } from "lucide-react";
import { useTheme } from "next-themes";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GlossaryDialog } from "@/components/ui/glossary-dialog";

export type AIFilter = "all" | "ChatGPT" | "Google Gemini" | "Perplexity" | "Deepseek" | "comparison";

interface HeaderProps {
  title?: string;
  className?: string;
}

export function Header({ title = "RepIndex.ai", className }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  return (
    <header className={cn(
      "sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
      className
    )}>
      <div className="container flex h-16 max-w-screen-2xl items-center justify-between">
        {/* Logo and Title */}
        <button 
          onClick={() => navigate("/")}
          className="flex items-center space-x-2 hover:opacity-80 transition-opacity cursor-pointer"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded bg-primary text-primary-foreground">
            <span className="text-sm font-bold">R</span>
          </div>
          <span className="font-bold text-lg">
            {title}
          </span>
        </button>

        {/* Right side buttons */}
        <div className="flex items-center space-x-2">
          {/* Navigation Buttons */}
          <Button
            variant={location.pathname === "/dashboard" ? "default" : "ghost"}
            size="sm"
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2"
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Button>
          
          <Button
            variant={location.pathname === "/chat" ? "default" : "ghost"}
            size="sm"
            onClick={() => navigate("/chat")}
            className="flex items-center gap-2"
          >
            <MessageCircle className="h-4 w-4" />
            Chat IA
          </Button>
          
          <Button
            variant={location.pathname === "/market-evolution" ? "default" : "ghost"}
            size="sm"
            onClick={() => navigate("/market-evolution")}
            className="flex items-center gap-2"
          >
            <TrendingUp className="h-4 w-4" />
            Evolución del Mercado
          </Button>
          
          <Button
            variant={location.pathname === "/noticias" ? "default" : "ghost"}
            size="sm"
            onClick={() => navigate("/noticias")}
            className="flex items-center gap-2"
          >
            <Newspaper className="h-4 w-4" />
            Noticias
          </Button>
          
          <GlossaryDialog />
          
          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>
        </div>
      </div>
    </header>
  );
}