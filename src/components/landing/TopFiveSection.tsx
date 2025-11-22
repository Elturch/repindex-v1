import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLandingTopFives } from "@/hooks/useLandingTopFives";
import { ChatGPTIcon } from "@/components/ui/chatgpt-icon";
import { GeminiIcon } from "@/components/ui/gemini-icon";
import { PerplexityIcon } from "@/components/ui/perplexity-icon";
import { DeepseekIcon } from "@/components/ui/deepseek-icon";
import { AlertCircle, TrendingUp, TrendingDown } from "lucide-react";

interface TopCompany {
  empresa: string;
  ticker: string;
  rix: number;
  ai: string;
}

function TopTable({ 
  data, 
  title, 
  showWarning = false 
}: { 
  data: TopCompany[]; 
  title: string; 
  showWarning?: boolean;
}) {
  const getAIColor = (ai: string) => {
    if (ai.includes("ChatGPT")) return "bg-chatgpt text-white";
    if (ai.includes("Gemini")) return "bg-gemini text-white";
    if (ai.includes("Perplexity")) return "bg-perplexity text-white";
    if (ai.includes("Deepseek")) return "bg-deepseek text-white";
    return "bg-neutral";
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
    >
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          {showWarning && <AlertCircle className="w-4 h-4 text-destructive" />}
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Ticker</TableHead>
                <TableHead className="text-right">RIX</TableHead>
                <TableHead>IA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((item, index) => (
                <motion.tr
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  whileHover={{ backgroundColor: "hsl(var(--accent) / 0.5)" }}
                  className="transition-colors"
                >
                  <TableCell className="font-medium">{item.empresa}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{item.ticker}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-bold">{item.rix}</TableCell>
                  <TableCell>
                    <Badge className={getAIColor(item.ai)}>{item.ai}</Badge>
                  </TableCell>
                </motion.tr>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </motion.div>
  );
}

export function TopFiveSection() {
  const { data, isLoading } = useLandingTopFives();

  if (isLoading) {
    return (
      <section className="py-20 px-4 bg-accent/5">
        <div className="container mx-auto max-w-7xl">
          <div className="text-center">
            <p className="text-muted-foreground">Cargando datos...</p>
          </div>
        </div>
      </section>
    );
  }

  if (!data) return null;

  return (
    <section className="py-20 px-4 bg-accent/5">
      <div className="container mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Top 5 Empresas
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Rankings actualizados de la última semana según diferentes criterios
          </p>
        </motion.div>

        <div className="space-y-8">
          {/* Top 5 by AI Model */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <Card className="p-6">
              <h3 className="text-xl font-semibold mb-4">Top 5 por Modelo de IA</h3>
              <Tabs defaultValue="chatgpt" className="w-full">
                <TabsList className="grid w-full grid-cols-4 mb-6">
                  <TabsTrigger value="chatgpt" className="flex items-center gap-2">
                    <ChatGPTIcon size={16} />
                    ChatGPT
                  </TabsTrigger>
                  <TabsTrigger value="gemini" className="flex items-center gap-2">
                    <GeminiIcon size={16} />
                    Gemini
                  </TabsTrigger>
                  <TabsTrigger value="perplexity" className="flex items-center gap-2">
                    <PerplexityIcon size={16} />
                    Perplexity
                  </TabsTrigger>
                  <TabsTrigger value="deepseek" className="flex items-center gap-2">
                    <DeepseekIcon size={16} />
                    Deepseek
                  </TabsTrigger>
                </TabsList>

                {Object.entries(data.topByAI).map(([model, companies]) => (
                  <TabsContent key={model} value={model}>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Empresa</TableHead>
                            <TableHead>Ticker</TableHead>
                            <TableHead className="text-right">RIX</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {companies.map((item, index) => (
                            <motion.tr
                              key={index}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: index * 0.05 }}
                            >
                              <TableCell className="font-medium">{item.empresa}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{item.ticker}</Badge>
                              </TableCell>
                              <TableCell className="text-right font-bold">{item.rix}</TableCell>
                            </motion.tr>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </Card>
          </motion.div>

          {/* Other Top 5s */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TopTable 
              data={data.topTraded} 
              title="Top 5 Cotizadas en Bolsa" 
            />
            <TopTable 
              data={data.topUntraded} 
              title="Top 5 No Cotizadas" 
            />
          </div>

          {data.topObsolete.length > 0 && (
            <TopTable 
              data={data.topObsolete} 
              title="Top 5 con Datos Obsoletos" 
              showWarning 
            />
          )}
        </div>
      </div>
    </section>
  );
}
