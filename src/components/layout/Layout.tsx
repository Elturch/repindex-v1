import { ReactNode } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { useActivityLogger } from "@/hooks/useActivityLogger";

interface LayoutProps {
  children: ReactNode;
  title?: string;
}

export function Layout({ children, title }: LayoutProps) {
  // Auto-track page views and user activity
  useActivityLogger();
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header title={title} />
      <main className="container mx-auto px-4 py-6 flex-1 print:px-0 print:py-0 print:max-w-none">
        {children}
      </main>
      <Footer />
    </div>
  );
}