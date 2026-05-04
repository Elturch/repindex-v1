import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider } from "@/contexts/AuthContext";
import { ChatProvider } from "@/contexts/ChatContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { FloatingChat } from "@/components/chat/FloatingChat";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Dashboard } from "./pages/Dashboard";
import { RixRunDetail } from "./pages/RixRunDetail";
import InsertRixResults from "./pages/InsertRixResults";
import ChatIntelligence from "./pages/ChatIntelligence";
import { MarketEvolution } from "./pages/MarketEvolution";
import NotFound from "./pages/NotFound";
import Landing from "./pages/Landing";
import WeeklyNews from "./pages/WeeklyNews";
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

const App = () => (
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
              <Routes>
                {/* Public routes */}
                <Route path="/" element={<Landing />} />
                <Route path="/noticias" element={<WeeklyNews />} />
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
                
                {/* Protected routes */}
                <Route path="/dashboard" element={
                  <ProtectedRoute><Dashboard /></ProtectedRoute>
                } />
                <Route path="/chat" element={
                  <ProtectedRoute><ChatIntelligence /></ProtectedRoute>
                } />
                <Route path="/market-evolution" element={
                  <ProtectedRoute><MarketEvolution /></ProtectedRoute>
                } />
                <Route path="/rix-run/:id" element={
                  <ProtectedRoute><RixRunDetail /></ProtectedRoute>
                } />
                <Route path="/mis-documentos" element={
                  <ProtectedRoute><MyDocuments /></ProtectedRoute>
                } />
                <Route path="/mis-conversaciones" element={
                  <ProtectedRoute><MyConversations /></ProtectedRoute>
                } />
                <Route path="/perfil" element={
                  <ProtectedRoute><UserProfile /></ProtectedRoute>
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
              <FloatingChat />
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
