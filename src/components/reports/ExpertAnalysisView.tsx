import { useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Lock } from "lucide-react";
import { METRIC_BY_KEY, type MetricKey } from "@/lib/reports/metricGlossary";

/**
 * Renders the expert analysis markdown returned by report-analysis
 * using the branded layout of the mockup (repindex-PERFIL-maqueta.html).
 * Parses `## <title>` sections and dispatches to specialised renderers;
 * unknown sections fall back to styled markdown, so it never breaks.
 */

const EAV_CSS = `
.eav-panel *{box-sizing:border-box}
.eav-panel{
  --eav-primary:#1a73e8; --eav-primary-dark:#1a3a5c; --eav-teal:#20808d;
  --eav-text:#0f1419; --eav-text-light:#536471; --eav-text-muted:#8899a6;
  --eav-bg:#ffffff; --eav-bg-alt:#f7f9fa; --eav-bg-header:#f0f4f8;
  --eav-border:#e5e7eb; --eav-border-light:#f0f4f8;
  --eav-red:#dc2626; --eav-red-bg:#fef2f2;
  --eav-amber:#f97316; --eav-amber-bg:#fff7ed;
  --eav-green:#10a37f; --eav-green-bg:#ecfdf5;
  --eav-blue:#1a73e8; --eav-blue-bg:#eff6ff;
  --eav-track:#eef2f6;
  --eav-shadow:0 1px 2px rgba(16,20,25,.04),0 10px 30px rgba(16,20,25,.06);
  --eav-shadow-sm:0 1px 2px rgba(16,20,25,.05);
  font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  color:var(--eav-text); line-height:1.65; -webkit-font-smoothing:antialiased;
  background:var(--eav-bg); border:1px solid var(--eav-border); border-radius:18px; overflow:hidden;
  box-shadow:var(--eav-shadow); margin:0 auto;
}
.eav-panel .eav-ribbon{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 28px;background:linear-gradient(90deg,#12343f 0%,#20808d 100%);color:#fff}
.eav-panel .eav-ribbon-left{display:flex;align-items:center;gap:12px}
.eav-panel .eav-badge{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.14em;font-weight:600;text-transform:uppercase;padding:5px 10px;background:rgba(255,255,255,.14);border-radius:6px;color:#eafcff}
.eav-panel .eav-ribbon-title{font-size:13px;font-weight:600;letter-spacing:.02em}
.eav-panel .eav-ribbon-title small{display:block;font-size:11px;font-weight:400;color:#bfeaf0;letter-spacing:0}
.eav-panel .eav-lock{display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:500;color:#eafcff;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.18);padding:6px 11px;border-radius:999px;white-space:nowrap}
.eav-panel .eav-lock svg{width:13px;height:13px}
.eav-panel .eav-body{padding:26px 28px 10px}
.eav-panel .eav-section{padding:20px 0;border-top:1px solid var(--eav-border-light)}
.eav-panel .eav-section:first-child{border-top:none;padding-top:4px}
.eav-panel .eav-eyebrow{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;letter-spacing:.15em;text-transform:uppercase;color:var(--eav-teal);display:flex;align-items:center;gap:9px;margin-bottom:14px}
.eav-panel .eav-eyebrow::before{content:"";width:22px;height:2px;background:var(--eav-teal);border-radius:2px}
.eav-panel .eav-caption{font-size:12px;color:var(--eav-text-muted);margin-top:12px}

.eav-panel .eav-headline{font-size:24px;line-height:1.3;font-weight:700;letter-spacing:-.01em;color:var(--eav-primary-dark)}
.eav-panel .eav-headline b,.eav-panel .eav-headline strong{color:var(--eav-red)}

.eav-panel .eav-tldr{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.eav-panel .eav-kpi{background:#fff;border:1px solid var(--eav-border);border-radius:13px;padding:16px 15px 15px;position:relative;overflow:hidden;box-shadow:var(--eav-shadow-sm)}
.eav-panel .eav-kpi::before{content:"";position:absolute;left:0;top:0;right:0;height:3px}
.eav-panel .eav-kpi.red::before{background:var(--eav-red)}
.eav-panel .eav-kpi.amber::before{background:var(--eav-amber)}
.eav-panel .eav-kpi.green::before{background:var(--eav-green)}
.eav-panel .eav-kpi.blue::before{background:var(--eav-blue)}
.eav-panel .eav-kpi-k{font-size:13px;font-weight:700;color:var(--eav-text);margin-bottom:5px;line-height:1.3}
.eav-panel .eav-kpi-t{font-size:12.5px;color:var(--eav-text-light);line-height:1.5}

.eav-panel .eav-prose p{font-size:14.5px;color:var(--eav-text);margin:0 0 12px;max-width:72ch}
.eav-panel .eav-prose p:last-child{margin-bottom:0}
.eav-panel .eav-prose strong{color:var(--eav-text);font-weight:700}
.eav-panel .eav-tag{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600;padding:1px 7px;border-radius:6px;background:var(--eav-bg-header);color:var(--eav-primary-dark);white-space:nowrap}
.eav-panel .eav-prose ul,.eav-panel .eav-prose ol{margin:6px 0 12px 20px;padding:0}
.eav-panel .eav-prose li{font-size:14px;color:var(--eav-text);margin:4px 0}
.eav-panel .eav-prose h1,.eav-panel .eav-prose h2,.eav-panel .eav-prose h3{font-size:14px;font-weight:700;margin:10px 0 6px;color:var(--eav-primary-dark)}

.eav-panel .eav-mlegend{display:flex;gap:14px;flex-wrap:wrap;margin:-4px 0 14px;font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--eav-text-muted)}
.eav-panel .eav-mlegend span{display:inline-flex;align-items:center;gap:5px}
.eav-panel .eav-mlegend i{width:9px;height:9px;border-radius:3px;display:inline-block}
.eav-panel .eav-metrics{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
.eav-panel .eav-metric{background:#fff;border:1px solid var(--eav-border);border-radius:13px;padding:16px 17px;box-shadow:var(--eav-shadow-sm)}
.eav-panel .eav-m-head{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.eav-panel .eav-m-code{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600;padding:4px 9px;border-radius:7px;background:var(--eav-primary-dark);color:#fff;letter-spacing:.03em}
.eav-panel .eav-m-name{font-size:13.5px;font-weight:700;color:var(--eav-text)}
.eav-panel .eav-m-weight{margin-left:auto;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:500;color:var(--eav-text-muted);background:var(--eav-bg-header);padding:3px 8px;border-radius:6px}
.eav-panel .eav-m-score{display:flex;align-items:baseline;gap:10px;margin-bottom:8px}
.eav-panel .eav-m-num{font-size:30px;font-weight:700;line-height:1;letter-spacing:-.01em}
.eav-panel .eav-m-band{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;padding:3px 8px;border-radius:6px}
.eav-panel .eav-m-gauge{height:8px;background:var(--eav-track);border-radius:999px;overflow:hidden;margin-bottom:11px}
.eav-panel .eav-m-gauge>i{display:block;height:100%;border-radius:999px}
.eav-panel .eav-m-desc{font-size:13px;color:var(--eav-text-light);line-height:1.55}
.eav-panel .b-red .eav-m-num,.eav-panel .b-red .eav-m-band{color:var(--eav-red)} .eav-panel .b-red .eav-m-band{background:var(--eav-red-bg)} .eav-panel .b-red .eav-m-gauge>i{background:var(--eav-red)}
.eav-panel .b-amber .eav-m-num,.eav-panel .b-amber .eav-m-band{color:var(--eav-amber)} .eav-panel .b-amber .eav-m-band{background:var(--eav-amber-bg)} .eav-panel .b-amber .eav-m-gauge>i{background:var(--eav-amber)}
.eav-panel .b-blue .eav-m-num,.eav-panel .b-blue .eav-m-band{color:var(--eav-blue)} .eav-panel .b-blue .eav-m-band{background:var(--eav-blue-bg)} .eav-panel .b-blue .eav-m-gauge>i{background:var(--eav-blue)}
.eav-panel .b-green .eav-m-num,.eav-panel .b-green .eav-m-band{color:var(--eav-green)} .eav-panel .b-green .eav-m-band{background:var(--eav-green-bg)} .eav-panel .b-green .eav-m-gauge>i{background:var(--eav-green)}
.eav-panel .eav-metric.na{opacity:.72;background:var(--eav-bg-alt)}
.eav-panel .eav-metric.na .eav-m-code{background:var(--eav-text-muted)} .eav-panel .eav-metric.na .eav-m-num{color:var(--eav-text-muted);font-size:22px} .eav-panel .eav-metric.na .eav-m-band{color:var(--eav-text-muted);background:var(--eav-bg-header)} .eav-panel .eav-metric.na .eav-m-gauge>i{background:#cbd5e1;width:100%}

.eav-panel .eav-ro{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.eav-panel .eav-ro-col h3{display:flex;align-items:center;gap:9px;font-size:12px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;margin-bottom:13px}
.eav-panel .eav-ro-col.risk h3{color:var(--eav-red)}
.eav-panel .eav-ro-col.opp h3{color:var(--eav-green)}
.eav-panel .eav-item{border:1px solid var(--eav-border);border-radius:11px;padding:12px 14px;margin-bottom:10px;background:#fff;box-shadow:var(--eav-shadow-sm)}
.eav-panel .risk .eav-item{border-left:3px solid var(--eav-red)}
.eav-panel .opp .eav-item{border-left:3px solid var(--eav-green)}
.eav-panel .eav-item b{display:block;font-size:13px;color:var(--eav-text);margin-bottom:3px}
.eav-panel .eav-item span{font-size:12.5px;color:var(--eav-text-light);line-height:1.5}

.eav-panel .eav-recs{display:flex;flex-direction:column;gap:12px}
.eav-panel .eav-rec{display:grid;grid-template-columns:44px 1fr;gap:15px;align-items:start;border:1px solid var(--eav-border);border-radius:13px;padding:16px 18px;background:#fff;box-shadow:var(--eav-shadow-sm)}
.eav-panel .eav-rec.p1{background:linear-gradient(120deg,#eff6ff,#fff);border-color:#bfdbfe}
.eav-panel .eav-rec-n{width:44px;height:44px;border-radius:11px;background:var(--eav-primary-dark);color:#fff;display:flex;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:20px}
.eav-panel .eav-rec.p1 .eav-rec-n{background:var(--eav-primary)}
.eav-panel .eav-rec-title{font-size:15px;font-weight:700;color:var(--eav-text);margin-bottom:8px;line-height:1.35}
.eav-panel .eav-rec-why{display:flex;gap:9px;padding:10px 13px;background:var(--eav-bg-alt);border-left:3px solid var(--eav-teal);border-radius:0 9px 9px 0}
.eav-panel .eav-rec-why b{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--eav-teal);padding-top:2px;white-space:nowrap}
.eav-panel .eav-rec-why span{font-size:13px;color:var(--eav-text-light);line-height:1.5}

@media(max-width:760px){
  .eav-panel .eav-tldr{grid-template-columns:repeat(2,1fr)}
  .eav-panel .eav-metrics,.eav-panel .eav-ro{grid-template-columns:1fr}
}
`;

let eavInjected = false;
function ensureEavStyles(): void {
  if (typeof document === "undefined") return;
  if (eavInjected) return;
  if (document.getElementById("eav-styles")) {
    eavInjected = true;
    return;
  }
  const el = document.createElement("style");
  el.id = "eav-styles";
  el.textContent = EAV_CSS;
  document.head.appendChild(el);
  if (!document.getElementById("eav-fonts")) {
    const link = document.createElement("link");
    link.id = "eav-fonts";
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap";
    document.head.appendChild(link);
  }
  eavInjected = true;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[()·:.,;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type SectionKind =
  | "headline"
  | "tldr"
  | "prose"
  | "metrics"
  | "ro"
  | "recs"
  | "unknown";

function classify(title: string): SectionKind {
  const t = normalize(title);
  if (t.includes("titular ejecutivo")) return "headline";
  if (t.includes("esencial") && t.includes("20")) return "tldr";
  if (t.includes("que esta pasando") || t.startsWith("que pasa")) return "prose";
  if (t.includes("lectura por metrica")) return "metrics";
  if (t.includes("riesgo") && t.includes("oportunidad")) return "ro";
  if (t.includes("recomendacion")) return "recs";
  return "unknown";
}

interface Section {
  title: string;
  kind: SectionKind;
  body: string;
}

function splitSections(md: string): Section[] {
  const lines = (md ?? "").replace(/\r\n/g, "\n").split("\n");
  const out: Section[] = [];
  let cur: Section | null = null;
  const buf: string[] = [];
  const flush = () => {
    if (cur) {
      cur.body = buf.join("\n").trim();
      out.push(cur);
    }
  };
  for (const line of lines) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      flush();
      const title = m[1].trim();
      cur = { title, kind: classify(title), body: "" };
      buf.length = 0;
    } else {
      if (!cur) continue;
      buf.push(line);
    }
  }
  flush();
  return out;
}

function parseBullets(body: string): Array<{ label?: string; text: string }> {
  const items: Array<{ label?: string; text: string }> = [];
  const lines = body.split("\n");
  let acc: string | null = null;
  const push = (raw: string) => {
    const s = raw.trim();
    if (!s) return;
    const m = s.match(/^\*\*([^*]+?)\*\*\s*[:\u2014\-]\s*(.+)$/);
    if (m) items.push({ label: m[1].trim(), text: m[2].trim() });
    else {
      const m2 = s.match(/^([A-Z\u00C1\u00C9\u00CD\u00D3\u00DA\u00D1a-z\u00E1\u00E9\u00ED\u00F3\u00FA\u00F1][^:]{1,60}):\s+(.+)$/);
      if (m2) items.push({ label: m2[1].trim(), text: m2[2].trim() });
      else items.push({ text: s });
    }
  };
  for (const raw of lines) {
    const m = raw.match(/^\s*[-*\u2022]\s+(.*)$/);
    if (m) {
      if (acc !== null) push(acc);
      acc = m[1];
    } else if (acc !== null && raw.trim()) {
      acc += " " + raw.trim();
    } else if (acc !== null) {
      push(acc);
      acc = null;
    }
  }
  if (acc !== null) push(acc);
  return items;
}

const METRIC_CODES = ["NVM", "DRM", "SIM", "RMM", "CEM", "GAM", "DCM", "CXM"];

function bandForNum(v: number): "red" | "amber" | "blue" | "green" {
  if (v >= 80) return "green";
  if (v >= 60) return "blue";
  if (v >= 40) return "amber";
  return "red";
}
function bandLabel(b: "red" | "amber" | "blue" | "green"): string {
  return b === "green" ? "Fuerte" : b === "blue" ? "Sólido" : b === "amber" ? "Atención" : "Crítico";
}

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const parts: Array<{ b: boolean; t: string }> = [];
  let rest = text;
  const boldRe = /\*\*([^*]+?)\*\*/;
  while (rest.length) {
    const m = rest.match(boldRe);
    if (!m || m.index === undefined) {
      parts.push({ b: false, t: rest });
      break;
    }
    if (m.index > 0) parts.push({ b: false, t: rest.slice(0, m.index) });
    parts.push({ b: true, t: m[1] });
    rest = rest.slice(m.index + m[0].length);
  }
  const chipRe = new RegExp(
    `\\b(${METRIC_CODES.join("|")}|RIXc?)\\s*(\\d{1,3}(?:[.,]\\d+)?)`,
    "g",
  );
  const out: React.ReactNode[] = [];
  parts.forEach((p, i) => {
    if (p.b) {
      out.push(<strong key={`${keyBase}-b-${i}`}>{p.t}</strong>);
      return;
    }
    let last = 0;
    let match: RegExpExecArray | null;
    let k = 0;
    chipRe.lastIndex = 0;
    while ((match = chipRe.exec(p.t)) !== null) {
      if (match.index > last) out.push(p.t.slice(last, match.index));
      out.push(
        <span className="eav-tag" key={`${keyBase}-c-${i}-${k++}`}>
          {match[1]} {match[2]}
        </span>,
      );
      last = match.index + match[0].length;
    }
    if (last < p.t.length) out.push(p.t.slice(last));
  });
  return out;
}

function toneFor(label: string | undefined, text: string): "red" | "amber" | "green" | "blue" {
  const t = normalize(`${label ?? ""} ${text}`);
  if (/(fortaleza|lider|liderazgo|excelente|positivo|mejora|solid|fuerte)/.test(t)) return "green";
  if (/(riesgo|amenaza|controversia|volatil|alerta)/.test(t)) return "amber";
  if (/(debilidad|caida|deteriora|critico|erosion|frag|baja)/.test(t)) return "red";
  return "blue";
}

function HeadlineSection({ body }: { body: string }) {
  const first = body.split(/\n\s*\n/).map((s) => s.trim()).find(Boolean) ?? body.trim();
  return (
    <section className="eav-section">
      <div className="eav-eyebrow">Titular ejecutivo</div>
      <div className="eav-headline">{renderInline(first.replace(/\n/g, " "), "hl")}</div>
    </section>
  );
}

function TldrSection({ body }: { body: string }) {
  const items = parseBullets(body).slice(0, 6);
  if (items.length === 0) return <ProseSection title="Lo esencial en 20 segundos" body={body} />;
  return (
    <section className="eav-section">
      <div className="eav-eyebrow">Lo esencial en 20 segundos</div>
      <div className="eav-tldr">
        {items.map((it, i) => {
          const tone = toneFor(it.label, it.text);
          return (
            <div className={`eav-kpi ${tone}`} key={`kpi-${i}`}>
              {it.label && <div className="eav-kpi-k">{it.label}</div>}
              <div className="eav-kpi-t">{renderInline(it.text, `kpi-${i}`)}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ProseSection({ title, body }: { title: string; body: string }) {
  const paras = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return (
    <section className="eav-section">
      <div className="eav-eyebrow">{title}</div>
      <div className="eav-prose">
        {paras.map((p, i) => (
          <p key={`p-${i}`}>{renderInline(p.replace(/\n/g, " "), `pr-${i}`)}</p>
        ))}
      </div>
    </section>
  );
}

function MetricsSection({ body }: { body: string }) {
  const items = parseBullets(body);
  const rows: Array<{ code: string; name: string; value: number | null; desc: string }> = [];
  for (const it of items) {
    const source = it.label ? `${it.label}: ${it.text}` : it.text;
    const m = source.match(
      /^\s*([A-Z]{2,4})\s*(?:\(([^)]+)\))?\s*[:\u2014\-]?\s*(\d{1,3}(?:[.,]\d+)?|N\/A|NA)\s*[\u2014:.\-]?\s*(.*)$/i,
    );
    if (!m) continue;
    const codeRaw = m[1].toUpperCase();
    if (!METRIC_CODES.includes(codeRaw)) continue;
    const nameFromMd = (m[2] ?? "").trim();
    const rawVal = m[3];
    const desc = (m[4] ?? "").trim();
    const parsed = /n\/?a/i.test(rawVal) ? null : parseFloat(rawVal.replace(",", "."));
    const def = METRIC_BY_KEY[codeRaw.toLowerCase() as MetricKey];
    rows.push({
      code: codeRaw,
      name: nameFromMd || def?.name || codeRaw,
      value: parsed != null && Number.isFinite(parsed) ? parsed : null,
      desc,
    });
  }
  if (rows.length === 0) return <ProseSection title="Lectura por métrica" body={body} />;
  return (
    <section className="eav-section">
      <div className="eav-eyebrow">Lectura por métrica</div>
      <div className="eav-mlegend">
        <span><i style={{ background: "var(--eav-red)" }} />0–39 crítico</span>
        <span><i style={{ background: "var(--eav-amber)" }} />40–59 atención</span>
        <span><i style={{ background: "var(--eav-blue)" }} />60–79 sólido</span>
        <span><i style={{ background: "var(--eav-green)" }} />80–100 fuerte</span>
      </div>
      <div className="eav-metrics">
        {rows.map((r, i) => {
          const na = r.value == null;
          const band = na ? null : bandForNum(r.value as number);
          const bandCls = band ? `b-${band}` : "";
          const def = METRIC_BY_KEY[r.code.toLowerCase() as MetricKey];
          return (
            <div className={`eav-metric ${bandCls}${na ? " na" : ""}`} key={`m-${i}`}>
              <div className="eav-m-head">
                <span className="eav-m-code">{r.code}</span>
                <span className="eav-m-name">{r.name}</span>
                {def && <span className="eav-m-weight">peso {def.weight}%</span>}
              </div>
              <div className="eav-m-score">
                <span className="eav-m-num">{na ? "N/A" : Math.round(r.value as number)}</span>
                <span className="eav-m-band">{na ? "No aplica" : bandLabel(band as "red"|"amber"|"blue"|"green")}</span>
              </div>
              <div className="eav-m-gauge">
                <i style={{ width: na ? "100%" : `${Math.max(0, Math.min(100, r.value as number))}%` }} />
              </div>
              {r.desc && <div className="eav-m-desc">{renderInline(r.desc, `md-${i}`)}</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RoSection({ body }: { body: string }) {
  const subs = body.split(/\n(?=###\s+)/g).map((s) => s.trim()).filter(Boolean);
  let risksBody = "";
  let oppsBody = "";
  if (subs.length && subs[0].startsWith("###")) {
    for (const s of subs) {
      const hm = s.match(/^###\s+(.+?)\n([\s\S]*)$/);
      if (!hm) continue;
      const t = normalize(hm[1]);
      if (t.startsWith("riesgo")) risksBody = hm[2];
      else if (t.startsWith("oportunidad")) oppsBody = hm[2];
    }
  } else {
    const items = parseBullets(body);
    for (const it of items) {
      const isOpp =
        /oportun|fortale|palanca|construir|amplific|mejorar|liderazgo|potencial/i.test(
          `${it.label ?? ""} ${it.text}`,
        );
      const line = `- ${it.label ? `**${it.label}:** ` : ""}${it.text}`;
      if (isOpp) oppsBody += line + "\n";
      else risksBody += line + "\n";
    }
  }
  const riskItems = parseBullets(risksBody);
  const oppItems = parseBullets(oppsBody);
  return (
    <section className="eav-section">
      <div className="eav-eyebrow">Riesgos y oportunidades</div>
      <div className="eav-ro">
        <div className="eav-ro-col risk">
          <h3>Riesgos</h3>
          {riskItems.length === 0 && <div className="eav-caption">Sin riesgos destacados.</div>}
          {riskItems.map((it, i) => (
            <div className="eav-item" key={`r-${i}`}>
              {it.label && <b>{it.label}</b>}
              <span>{renderInline(it.text, `r-${i}`)}</span>
            </div>
          ))}
        </div>
        <div className="eav-ro-col opp">
          <h3>Oportunidades</h3>
          {oppItems.length === 0 && <div className="eav-caption">Sin oportunidades destacadas.</div>}
          {oppItems.map((it, i) => (
            <div className="eav-item" key={`o-${i}`}>
              {it.label && <b>{it.label}</b>}
              <span>{renderInline(it.text, `o-${i}`)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function RecsSection({ body }: { body: string }) {
  const lines = body.split("\n");
  const raws: string[] = [];
  let acc: string | null = null;
  const flush = () => {
    if (acc !== null) raws.push(acc.trim());
    acc = null;
  };
  for (const line of lines) {
    const m = line.match(/^\s*(?:\d+\.|[-*\u2022])\s+(.*)$/);
    if (m) {
      flush();
      acc = m[1];
    } else if (acc !== null && line.trim()) {
      acc += " " + line.trim();
    } else if (!line.trim()) {
      flush();
    }
  }
  flush();
  const items = raws
    .map((raw) => {
      let title = raw;
      let why = "";
      const b = raw.match(/^\*\*([^*]+?)\*\*\s*[\u2014:\-]?\s*(.*)$/);
      if (b) {
        title = b[1].trim();
        why = b[2].trim();
      } else {
        const s = raw.match(/^(.+?)\s+\u2014\s+(.+)$/);
        if (s) {
          title = s[1].trim();
          why = s[2].trim();
        }
      }
      why = why.replace(/^por\s*qu[e\u00E9]\s*[:\u2014\-]?\s*/i, "").trim();
      return { title, why };
    })
    .filter((x) => x.title.length > 0);
  if (items.length === 0) return <ProseSection title="Recomendaciones priorizadas" body={body} />;
  return (
    <section className="eav-section">
      <div className="eav-eyebrow">Recomendaciones priorizadas</div>
      <div className="eav-recs">
        {items.map((it, i) => (
          <div className={`eav-rec${i === 0 ? " p1" : ""}`} key={`rc-${i}`}>
            <div className="eav-rec-n">{i + 1}</div>
            <div>
              <div className="eav-rec-title">{renderInline(it.title, `rt-${i}`)}</div>
              {it.why && (
                <div className="eav-rec-why">
                  <b>Por qué</b>
                  <span>{renderInline(it.why, `rw-${i}`)}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function UnknownSection({ title, body }: { title: string; body: string }) {
  return (
    <section className="eav-section">
      <div className="eav-eyebrow">{title}</div>
      <div className="eav-prose">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
      </div>
    </section>
  );
}

interface Props {
  markdown: string;
  subtitle?: string;
}

export function ExpertAnalysisView({ markdown, subtitle }: Props) {
  useEffect(() => {
    ensureEavStyles();
  }, []);

  const sections = useMemo(() => splitSections(markdown ?? ""), [markdown]);
  const hasSections = sections.length > 0;

  return (
    <div className="eav-panel">
      <div className="eav-ribbon">
        <div className="eav-ribbon-left">
          <span className="eav-badge">Agente Rix</span>
          <div className="eav-ribbon-title">
            Análisis del experto
            {subtitle ? <small>{subtitle}</small> : null}
          </div>
        </div>
        <span className="eav-lock">
          <Lock aria-hidden />
          Universo cerrado · sin fuentes externas
        </span>
      </div>
      <div className="eav-body">
        {!hasSections && (
          <section className="eav-section">
            <div className="eav-prose">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown || ""}</ReactMarkdown>
            </div>
          </section>
        )}
        {hasSections &&
          sections.map((s, i) => {
            switch (s.kind) {
              case "headline":
                return <HeadlineSection body={s.body} key={i} />;
              case "tldr":
                return <TldrSection body={s.body} key={i} />;
              case "prose":
                return <ProseSection title={s.title} body={s.body} key={i} />;
              case "metrics":
                return <MetricsSection body={s.body} key={i} />;
              case "ro":
                return <RoSection body={s.body} key={i} />;
              case "recs":
                return <RecsSection body={s.body} key={i} />;
              default:
                return <UnknownSection title={s.title} body={s.body} key={i} />;
            }
          })}
      </div>
    </div>
  );
}
