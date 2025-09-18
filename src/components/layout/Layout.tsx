import { ReactNode } from "react";
import { Header, AIFilter } from "./Header";

interface LayoutProps {
  children: ReactNode;
  title?: string;
  onSearch?: (query: string) => void;
  onAIFilterChange?: (filter: AIFilter) => void;
  aiFilter?: AIFilter;
}

export function Layout({ children, title, onSearch, onAIFilterChange, aiFilter }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <Header 
        title={title} 
        onSearch={onSearch} 
        onAIFilterChange={onAIFilterChange}
        aiFilter={aiFilter}
      />
      <main className="container mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}