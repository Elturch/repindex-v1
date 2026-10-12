import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ThemeProvider } from "next-themes";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider } from "@/contexts/AuthContext";
import { ChatProvider } from "@/contexts/ChatContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
// FloatingChat oculto por solicitud del usuario
// import { FloatingChat } from "@/components/chat/FloatingChat";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SweepInProgressBanner } from "@/components/SweepInProgressBanner";
import { Dashboard } from "./pages/Dashboard";
import { RixRunDetail } from "./pages/RixRunDetail";
import InsertRixResults from "./pages/InsertRixResults";
import ChatIntelligence from "./pages/ChatIntelligence";
import RixReports from "./pages/RixReports";
import RixViewer from "./pages/RixViewer";
import { MarketEvolution } from "./pages/MarketEvolution";
import NotFound from "./pages/NotFound";
import Landing from "./pages/Landing";
import WeeklyNews from "./pages/WeeklyNews";
import WarRoom from "./pages/WarRoom";
import NewsArticleDetail from "./pages/NewsArticleDetail";
import NewsArchive from "./pages/NewsArchive";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import MyDocuments from "./pages/MyDocuments";
import MyConversations from "./pages/MyConversations";
import UserProfile from "./pages/UserProfile";
import Admin from "./pages/Admin";
import Methodology from "./pages/Methodology";
import TermsAndConditions from "./pages/legal/TermsAndConditions";
import CookiePolicy from "./pages/legal/CookiePolicy";
import PrivacyPolicy from "./pages/legal/PrivacyPolicy";
import GdprForm from "./pages/legal/GdprForm";
import ComplaintsForm from "./pages/legal/ComplaintsForm";
import Qualification from "./pages/Qualification";
import SkillsAdmin from "./pages/SkillsAdmin";
import { isDevOrPreview } from "@/lib/env";

const queryClient = new QueryClient();

// SSO handoff desde el hub "Pasaporte": si la URL trae ?pt=<token>,
// lo canjeamos por una sesión vía la edge function pasaporte-sso.
// Aditivo y silencioso: cualquier fallo deja la app tal cual.
const usePasaporteHandoff = () => {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pt = params.get('pt');
    if (!pt) return;

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('pasaporte-sso', {
          body: { token: pt },
        });
        if (!error && data?.ok && data?.token_hash) {
          await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: data.token_hash });
        }
      } catch {
        // Handoff fallido: no romper la carga de la app
      } finally {
        // Limpiar ?pt de la URL conservando ruta y resto de query
        params.delete('pt');
        const qs = params.toString();
        const newUrl = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash;
        window.history.replaceState(null, '', newUrl);
      }
    })();
  }, []);
};

const App = () => {
  usePasaporteHandoff();

  return (
  <ErrorBoundary>
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
        <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <ChatProvider>
              <SweepInProgressBanner />
              <Routes>
                {/* Public routes */}
                <Route path="/" element={<Landing />} />
                <Route path="/noticias" element={<WeeklyNews />} />
                <Route path="/war-room" element={<WarRoom />} />
                <Route path="/noticias/archivo" element={<NewsArchive />} />
                <Route path="/noticias/:slug" element={<NewsArticleDetail />} />
                <Route path="/metodologia" element={<Methodology />} />
                <Route path="/termos" element={<TermsAndConditions />} />
                <Route path="/cookies" element={<CookiePolicy />} />
                <Route path="/privacidade" element={<PrivacyPolicy />} />
                <Route path="/rgpd" element={<GdprForm />} />
                <Route path="/reclamacoes" element={<ComplaintsForm />} />
                <Route path="/cualificacion/:token" element={<Qualification />} />
                <Route path="/login" element={<Login />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                
                {/* Public routes */}
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/chat" element={<ChatIntelligence />} />
                <Route path="/market-evolution" element={<MarketEvolution />} />
                <Route path="/rix-run/:id" element={<RixRunDetail />} />
                <Route path="/mis-documentos" element={<MyDocuments />} />
                <Route path="/mis-conversaciones" element={<MyConversations />} />
                <Route path="/perfil" element={<UserProfile />} />
                
                {/* Protected routes — solo informes y visor requieren login */}
                <Route path="/informes" element={
                  <ProtectedRoute><RixReports /></ProtectedRoute>
                } />
                <Route path="/visor" element={
                  <ProtectedRoute><RixViewer /></ProtectedRoute>
                } />
                
                {/* Admin routes - only available in Preview/development */}
                {isDevOrPreview() && (
                  <>
                    <Route path="/insert-rix" element={<InsertRixResults />} />
                    <Route path="/admin" element={<Admin />} />
                    <Route path="/admin/skills" element={<SkillsAdmin />} />
                  </>
                )}
                
                {/* Catch-all */}
                <Route path="*" element={<NotFound />} />
              </Routes>
              {/* <FloatingChat /> oculto */}
            </ChatProvider>
          </AuthProvider>
        </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </HelmetProvider>
  </ErrorBoundary>
);

export default App;
