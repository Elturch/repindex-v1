import { useCallback, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useReportExport } from "@/contexts/ReportExportContext";
import { buildDeterministicReportHtml } from "@/lib/reports/buildDeterministicReportHtml";
import { downloadReportPdf } from "@/lib/reports/downloadReportPdf";

interface Props {
  fallbackLabel: string;
}

export function DeterministicPdfButton({ fallbackLabel }: Props) {
  const { payload, analysisMarkdown } = useReportExport();
  const [busy, setBusy] = useState(false);

  const onClick = useCallback(async () => {
    if (busy) return;
    if (!payload) {
      toast({
        title: "Informe todavía cargando",
        description: "Espera a que terminen de aparecer los datos y vuelve a intentarlo.",
      });
      return;
    }
    setBusy(true);
    try {
      const html = buildDeterministicReportHtml({
        kind: payload.kind,
        datapack: payload.datapack,
        analysisMarkdown,
      });

      const label =
        payload.kind === "profile"
          ? (payload.datapack as any).entity?.name || fallbackLabel
          : ((payload.datapack as any).entities ?? [])
              .map((e: { ticker: string }) => e.ticker)
              .join("-") || fallbackLabel;
      const week =
        (payload.datapack as any).latest_week ||
        new Date().toISOString().slice(0, 10);
      const safe = String(label)
        .replace(/[^\p{L}\p{N}\-_ ]+/gu, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 80) || "informe";
      const filename = `RepIndex-${safe}-${week}.pdf`;

      await downloadReportPdf(html, filename);
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
  }, [busy, payload, analysisMarkdown, fallbackLabel]);

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={onClick}
      disabled={busy || !payload}
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