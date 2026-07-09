import { useCallback, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { downloadDeterministicReportPdf } from "@/lib/reports/downloadReportPdf";
import type { RankingDatapackParams } from "@/hooks/useRankingDatapack";

interface Props {
  kind: "profile" | "comparison" | "ranking";
  tickers?: string[];
  rankingParams?: RankingDatapackParams | null;
  question?: string | null;
  from?: string | null;
  to?: string | null;
}

export function DeterministicPdfButton({ kind, tickers, rankingParams, question, from, to }: Props) {
  const [busy, setBusy] = useState(false);

  const onClick = useCallback(async () => {
    if (busy) return;
    if (kind !== "ranking" && (!tickers || tickers.length === 0)) {
      toast({
        title: "No se pudo generar el PDF",
        description: "El informe no tiene entidades seleccionadas.",
        variant: "destructive",
      });
      return;
    }
    if (kind === "ranking" && !rankingParams) {
      toast({
        title: "No se pudo generar el PDF",
        description: "El informe de ranking no tiene alcance definido.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      await downloadDeterministicReportPdf({
        kind,
        tickers: tickers ?? [],
        rankingParams: rankingParams ?? null,
        question: question ?? null,
        from: from ?? null,
        to: to ?? null,
      });
    } catch (err) {
      console.error("[pdf] generation failed", err);
      toast({
        title: "No se pudo generar el PDF",
        description: "Inténtalo de nuevo en unos segundos.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }, [busy, kind, tickers, rankingParams, question, from, to]);

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={onClick}
      disabled={busy}
    >
      {busy ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generando PDF…
        </>
      ) : (
        <>
          <Download className="h-3.5 w-3.5" /> Descargar PDF
        </>
      )}
    </Button>
  );
}