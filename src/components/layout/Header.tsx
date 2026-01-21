import { useState } from "react";
import { Sun, Moon, Bot, LayoutDashboard, TrendingUp, Newspaper, FileText, MessagesSquare, LogOut, Building2, Menu, User, Beaker } from "lucide-react";
import { isDevOrPreview } from "@/lib/env";
import repindexLogoText from "@/assets/repindex-logo-text-source.png";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export type AIFilter = "all" | "ChatGPT" | "Google Gemini" | "Perplexity" | "Deepseek" | "comparison";

interface HeaderProps {
  title?: string;
  className?: string;
}

const getNavItems = () => {
  const items = [
    { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard, protected: true },
    { path: "/chat", label: "Agente Rix", icon: Bot, protected: true },
    { path: "/market-evolution", label: "Evolución", icon: TrendingUp, protected: true },
    { path: "/noticias", label: "Newsroom", icon: Newspaper, protected: false },
  ];
  
  if (isDevOrPreview()) {
    items.push({ path: "/dashboard-v2", label: "V2 Lab", icon: Beaker, protected: true });
  }
  
  return items;
};

export function Header({ title = "RepIndex.ai", className }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, profile, company, signOut, isLoading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navItems = getNavItems();

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

  const handleNavClick = (item: typeof navItems[0]) => {
    if (item.protected && !isAuthenticated) {
      navigate("/login");
    } else {
      navigate(item.path);
    }
    setMobileMenuOpen(false);
  };

  return (
    <header className={cn(
      "sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 dark:bg-black dark:supports-[backdrop-filter]:bg-black print:hidden",
      className
    )}>
      <div className="container flex h-18 max-w-screen-2xl items-center justify-between px-4">
        {/* Logo and Title */}
        <button 
          onClick={() => navigate("/")}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer flex-shrink-0 isolate"
        >
          <img 
            src={repindexLogoText} 
            alt="RepIndex.ai" 
            className={cn(
              "h-10 grayscale",
              theme === "dark" ? "invert mix-blend-screen" : "mix-blend-multiply"
            )}
          />
        </button>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Button
                key={item.path}
                variant={isActive ? "default" : "ghost"}
                size="sm"
                onClick={() => handleNavClick(item)}
                className="flex items-center gap-2"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Button>
            );
          })}
        </nav>

        {/* Right side actions */}
        <div className="flex items-center gap-2">
          <GlossaryDialog />
          
          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-9 w-9"
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
                  <DropdownMenuItem onClick={() => navigate('/perfil')}>
                    <User className="mr-2 h-4 w-4" />
                    Mi Perfil
                  </DropdownMenuItem>
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
                className="hidden sm:flex"
              >
                Acceder
              </Button>
            )
          )}

          {/* Mobile Menu */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden h-9 w-9">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <img 
                    src={repindexLogoText} 
                    alt="RepIndex.ai" 
                    className={cn(
                      "h-8 grayscale",
                      theme === "dark" ? "invert mix-blend-screen" : "mix-blend-multiply"
                    )}
                  />
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-2 mt-6">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <Button
                      key={item.path}
                      variant={isActive ? "default" : "ghost"}
                      onClick={() => handleNavClick(item)}
                      className="justify-start gap-3 h-11"
                    >
                      <Icon className="h-5 w-5" />
                      {item.label}
                    </Button>
                  );
                })}
                
                {!isAuthenticated && (
                  <>
                    <div className="h-px bg-border my-2" />
                    <Button
                      variant="default"
                      onClick={() => {
                        navigate("/login");
                        setMobileMenuOpen(false);
                      }}
                      className="justify-start gap-3 h-11"
                    >
                      Acceder
                    </Button>
                  </>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
