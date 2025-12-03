import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink, CheckCircle, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { MiniBarChart, MiniLineChart } from "./MiniCharts";

interface CompanyData {
  company_name: string;
  ticker: string;
  model_name: string;
  rix_score: number;
  batch_week: string;
  sector_category?: string;
}

interface DataVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  companies: string[];
  headline: string;
  category: string;
}

const MODEL_COLORS: Record<string, string> = {
  ChatGPT: "hsl(142, 76%, 36%)",
  Perplexity: "hsl(217, 91%, 60%)",
  Gemini: "hsl(47, 96%, 53%)",
  DeepSeek: "hsl(280, 67%, 60%)",
};

export function DataVerificationModal({ isOpen, onClose, companies, headline, category }: DataVerificationModalProps) {
  const [data, setData] = useState<CompanyData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && companies.length > 0) {
      fetchData();
    }
  }, [isOpen, companies]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Get the latest week's data for the mentioned companies
      const { data: latestWeek } = await supabase
        .from("rix_trends")
        .select("batch_week")
        .order("batch_week", { ascending: false })
        .limit(1);

      const currentWeek = latestWeek?.[0]?.batch_week;

      if (currentWeek) {
        // Search for companies by partial name match
        const companyQueries = companies.map(async (company) => {
          const { data } = await supabase
            .from("rix_trends")
            .select("*")
            .eq("batch_week", currentWeek)
            .ilike("company_name", `%${company}%`);
          return data || [];
        });

        const results = await Promise.all(companyQueries);
        const allData = results.flat();
        
        // Remove duplicates
        const uniqueData = allData.filter((item, index, self) =>
          index === self.findIndex((t) => t.company_name === item.company_name && t.model_name === item.model_name)
        );

        setData(uniqueData);
      }
    } catch (error) {
      console.error("Error fetching verification data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Group data by company
  const groupedByCompany = data.reduce((acc, item) => {
    if (!acc[item.company_name]) {
      acc[item.company_name] = [];
    }
    acc[item.company_name].push(item);
    return acc;
  }, {} as Record<string, CompanyData[]>);

  // Calculate averages per company
  const companyAverages = Object.entries(groupedByCompany).map(([company, items]) => ({
    company,
    ticker: items[0]?.ticker || "",
    sector: items[0]?.sector_category || "",
    avgScore: Math.round(items.reduce((sum, i) => sum + i.rix_score, 0) / items.length),
    scores: items,
  }));

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-serif">
            <CheckCircle className="h-5 w-5 text-primary" />
            Verificación de Datos
          </DialogTitle>
          <DialogDescription className="text-base">
            Datos reales de RepIndex para esta noticia
          </DialogDescription>
        </DialogHeader>

        {/* Story reference */}
        <div className="bg-muted/50 rounded-lg p-4 border-l-4 border-primary">
          <Badge variant="outline" className="mb-2">{category}</Badge>
          <h3 className="font-semibold text-foreground">{headline}</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Empresas mencionadas: {companies.join(", ")}
          </p>
        </div>

        {/* Data verification */}
        <div className="space-y-6 mt-4">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : companyAverages.length > 0 ? (
            <>
              {/* Summary chart */}
              <div className="bg-muted/30 rounded-xl p-6 border">
                <h4 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-4">
                  Puntuaciones RIX Verificadas
                </h4>
                <div className="flex justify-center">
                  <MiniBarChart 
                    data={companyAverages.map(c => ({
                      name: c.ticker || c.company.substring(0, 10),
                      value: c.avgScore,
                      fill: c.avgScore >= 70 ? "hsl(142, 76%, 36%)" : c.avgScore >= 50 ? "hsl(47, 96%, 53%)" : "hsl(0, 84%, 60%)"
                    }))}
                    width={Math.min(500, companyAverages.length * 100)}
                    height={150}
                    showLabels
                  />
                </div>
              </div>

              {/* Detailed breakdown per company */}
              {companyAverages.map(({ company, ticker, sector, avgScore, scores }) => (
                <div key={company} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold">{company}</h4>
                        <Badge variant="secondary">{ticker}</Badge>
                      </div>
                      {sector && (
                        <p className="text-xs text-muted-foreground">{sector}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-primary">{avgScore}</div>
                      <div className="text-xs text-muted-foreground">Media RIX</div>
                    </div>
                  </div>

                  {/* Scores by model */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {scores.map((score) => (
                      <div 
                        key={`${score.company_name}-${score.model_name}`}
                        className="bg-muted/30 rounded-lg p-3 text-center"
                      >
                        <div 
                          className="text-lg font-bold"
                          style={{ color: MODEL_COLORS[score.model_name] || "inherit" }}
                        >
                          {score.rix_score}
                        </div>
                        <div className="text-xs text-muted-foreground">{score.model_name}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Source verification */}
              <div className="flex items-center justify-between bg-green-50 dark:bg-green-950/30 rounded-lg p-4 border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="text-sm font-medium text-green-700 dark:text-green-400">
                    Datos verificados de la base de datos RepIndex
                  </span>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <a href="/dashboard" target="_blank" rel="noopener noreferrer" className="gap-2">
                    Ver Dashboard
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>No se encontraron datos para las empresas mencionadas.</p>
              <p className="text-sm mt-2">
                Las empresas pueden estar escritas de forma diferente en la base de datos.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
