import { ReactNode } from "react";
import { Header } from "./Header";

interface LayoutProps {
  children: ReactNode;
  title?: string;
}

export function Layout({ children, title }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <Header title={title} />
      <main className="container mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}