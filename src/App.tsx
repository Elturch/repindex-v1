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
import Login from "./pages/Login";
import MyDocuments from "./pages/MyDocuments";
import MyConversations from "./pages/MyConversations";
import Admin from "./pages/Admin";
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
                <Route path="/login" element={<Login />} />
                
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
                
                {/* Admin routes - only available in Preview/development */}
                {isDevOrPreview() && (
                  <>
                    <Route path="/insert-rix" element={<InsertRixResults />} />
                    <Route path="/admin" element={<Admin />} />
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
