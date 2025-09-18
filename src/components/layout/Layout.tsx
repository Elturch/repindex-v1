import { ReactNode } from "react";
import { Header } from "./Header";

interface LayoutProps {
  children: ReactNode;
  title?: string;
  onSearch?: (query: string) => void;
}

export function Layout({ children, title, onSearch }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <Header title={title} onSearch={onSearch} />
      <main className="container mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}