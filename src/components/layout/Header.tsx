import { Search, Sun, Moon, Filter } from "lucide-react";
import { useTheme } from "next-themes";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type AIFilter = "all" | "chatgpt" | "perplexity";

interface HeaderProps {
  title?: string;
  onSearch?: (query: string) => void;
  onAIFilterChange?: (filter: AIFilter) => void;
  aiFilter?: AIFilter;
  className?: string;
}

export function Header({ title = "RepIndex", onSearch, onAIFilterChange, aiFilter = "all", className }: HeaderProps) {
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  return (
    <header className={cn(
      "sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
      className
    )}>
      <div className="container flex h-16 max-w-screen-2xl items-center">
        {/* Logo and Title */}
        <div className="mr-4 flex">
          <div className="mr-6 flex items-center space-x-2">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-primary text-primary-foreground">
              <span className="text-sm font-bold">R</span>
            </div>
            <span className="hidden font-bold sm:inline-block">
              {title}
            </span>
          </div>
        </div>

        {/* Search Bar and Filters */}
        <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
          <div className="w-full flex-1 md:w-auto md:flex-none">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
              <Input
                placeholder="Buscar empresa..."
                className="pl-8 md:w-[300px] lg:w-[400px]"
                onChange={(e) => onSearch?.(e.target.value)}
              />
            </div>
          </div>

          {/* AI Filter */}
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={aiFilter} onValueChange={(value: AIFilter) => onAIFilterChange?.(value)}>
              <SelectTrigger className="w-[140px] bg-background border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-50 bg-background border-border shadow-lg">
                <SelectItem value="all">Ambos</SelectItem>
                <SelectItem value="chatgpt">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-chatgpt rounded-full"></div>
                    <span>ChatGPT</span>
                  </div>
                </SelectItem>
                <SelectItem value="perplexity">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-perplexity rounded-full"></div>
                    <span>Perplexity</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="ml-2"
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