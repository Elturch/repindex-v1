import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { HelmetProvider } from "react-helmet-async";
import { Dashboard } from "./pages/Dashboard";
import { RixRunDetail } from "./pages/RixRunDetail";
import InsertRixResults from "./pages/InsertRixResults";
import ChatIntelligence from "./pages/ChatIntelligence";
import { MarketEvolution } from "./pages/MarketEvolution";
import NotFound from "./pages/NotFound";
import Landing from "./pages/Landing";
import WeeklyNews from "./pages/WeeklyNews";

const queryClient = new QueryClient();

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
        <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/chat" element={<ChatIntelligence />} />
            <Route path="/market-evolution" element={<MarketEvolution />} />
            <Route path="/noticias" element={<WeeklyNews />} />
            <Route path="/rix-run/:id" element={<RixRunDetail />} />
            <Route path="/insert-rix" element={<InsertRixResults />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
