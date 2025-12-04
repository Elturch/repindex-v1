import { Sun, Moon, MessageCircle, LayoutDashboard, TrendingUp, Newspaper, FileText, MessagesSquare, LogOut, User, Building2 } from "lucide-react";
import { useTheme } from "next-themes";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GlossaryDialog } from "@/components/ui/glossary-dialog";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export type AIFilter = "all" | "ChatGPT" | "Google Gemini" | "Perplexity" | "Deepseek" | "comparison";

interface HeaderProps {
  title?: string;
  className?: string;
}

export function Header({ title = "RepIndex.ai", className }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, profile, company, signOut, isLoading } = useAuth();

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  // Public pages only show limited navigation
  const isPublicPage = ['/', '/noticias', '/login'].includes(location.pathname);

  return (
    <header className={cn(
      "sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 print:hidden",
      className
    )}>
      <div className="container flex h-16 max-w-screen-2xl items-center justify-between">
        {/* Logo and Title */}
        <button 
          onClick={() => navigate("/")}
          className="flex items-center space-x-2 hover:opacity-80 transition-opacity cursor-pointer flex-shrink-0"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded bg-primary text-primary-foreground">
            <span className="text-sm font-bold">R</span>
          </div>
          <span className="font-bold text-lg hidden sm:inline">
            {title}
          </span>
        </button>

        {/* Right side buttons */}
        <div className="flex items-center space-x-2">
          {/* Navigation - always visible, but protected routes redirect to login if not authenticated */}
          <Button
            variant={location.pathname === "/dashboard" ? "default" : "ghost"}
            size="sm"
            onClick={() => isAuthenticated ? navigate("/dashboard") : navigate("/login")}
            className="flex items-center gap-2"
          >
            <LayoutDashboard className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </Button>
          
          <Button
            variant={location.pathname === "/chat" ? "default" : "ghost"}
            size="sm"
            onClick={() => isAuthenticated ? navigate("/chat") : navigate("/login")}
            className="flex items-center gap-2"
          >
            <MessageCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Chat IA</span>
          </Button>
          
          <Button
            variant={location.pathname === "/market-evolution" ? "default" : "ghost"}
            size="sm"
            onClick={() => isAuthenticated ? navigate("/market-evolution") : navigate("/login")}
            className="flex items-center gap-2"
          >
            <TrendingUp className="h-4 w-4" />
            <span className="hidden md:inline">Evolución</span>
          </Button>

          {/* Noticias - always visible and accessible */}
          <Button
            variant={location.pathname === "/noticias" ? "default" : "ghost"}
            size="sm"
            onClick={() => navigate("/noticias")}
            className="flex items-center gap-2"
          >
            <Newspaper className="h-4 w-4" />
            <span className="hidden sm:inline">Noticias</span>
          </Button>
          
          {isAuthenticated && <GlossaryDialog />}
          
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

          {/* Auth Section */}
          {!isLoading && (
            isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                        {getInitials(profile?.full_name)}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {profile?.full_name || 'Usuario'}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {profile?.email}
                      </p>
                      {company && (
                        <p className="text-xs leading-none text-muted-foreground flex items-center gap-1 mt-1">
                          <Building2 className="h-3 w-3" />
                          {company.company_name}
                        </p>
                      )}
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/mis-documentos')}>
                    <FileText className="mr-2 h-4 w-4" />
                    Mis Documentos
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/mis-conversaciones')}>
                    <MessagesSquare className="mr-2 h-4 w-4" />
                    Mis Conversaciones
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    Cerrar sesión
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                variant="default"
                size="sm"
                onClick={() => navigate("/login")}
              >
                Acceder
              </Button>
            )
          )}
        </div>
      </div>
    </header>
  );
}
