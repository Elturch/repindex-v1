/**
 * Design tokens + CSS mirroring the branded HTML mockups
 * (repindex-SECTOR-maqueta.html and repindex-EVOLUCION-maqueta.html).
 *
 * All classes are prefixed with `rr-` so they cannot collide with the
 * app's global Tailwind utilities.
 */

export type Band = "red" | "amber" | "blue" | "green";

export function bandFor(score: number | null | undefined): Band {
  const s = typeof score === "number" ? score : 0;
  if (s >= 80) return "green";
  if (s >= 60) return "blue";
  if (s >= 40) return "amber";
  return "red";
}

export const RANKING_CSS = `
.rr-panel *{box-sizing:border-box;margin:0;padding:0}
.rr-panel{
  --rr-primary:#1a73e8; --rr-primary-dark:#1a3a5c; --rr-teal:#20808d;
  --rr-text:#0f1419; --rr-text-light:#536471; --rr-text-muted:#8899a6;
  --rr-bg:#ffffff; --rr-bg-alt:#f7f9fa; --rr-bg-header:#f0f4f8;
  --rr-border:#e5e7eb; --rr-border-light:#f0f4f8;
  --rr-red:#dc2626; --rr-red-bg:#fef2f2;
  --rr-amber:#f97316; --rr-amber-bg:#fff7ed;
  --rr-green:#10a37f; --rr-green-bg:#ecfdf5;
  --rr-blue:#1a73e8; --rr-blue-bg:#eff6ff;
  --rr-gold:#d97706; --rr-track:#eef2f6;
  --rr-shadow:0 1px 2px rgba(16,20,25,.04),0 10px 30px rgba(16,20,25,.06);
  --rr-shadow-sm:0 1px 2px rgba(16,20,25,.05);
  font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  color:var(--rr-text);line-height:1.65;-webkit-font-smoothing:antialiased;
  background:var(--rr-bg);border:1px solid var(--rr-border);border-radius:18px;overflow:hidden;box-shadow:var(--rr-shadow);
  max-width:940px;margin:0 auto;
}
.rr-panel .rr-mono{font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace}

/* Ribbon */
.rr-panel .rr-ribbon{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 28px;background:linear-gradient(90deg,#12343f 0%,#20808d 100%);color:#fff}
.rr-panel .rr-ribbon-left{display:flex;align-items:center;gap:12px}
.rr-panel .rr-ribbon-badge{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.14em;font-weight:600;text-transform:uppercase;padding:5px 10px;background:rgba(255,255,255,.14);border-radius:6px;color:#eafcff}
.rr-panel .rr-ribbon-title{font-size:13px;font-weight:600;letter-spacing:.02em}
.rr-panel .rr-ribbon-title small{display:block;font-size:11px;font-weight:400;color:#bfeaf0;letter-spacing:0}
.rr-panel .rr-lock{display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:500;color:#eafcff;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.18);padding:6px 11px;border-radius:999px;white-space:nowrap}
.rr-panel .rr-lock svg{width:13px;height:13px}

/* Body / sections */
.rr-panel .rr-body{padding:30px 28px 8px}
.rr-panel .rr-eyebrow{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;letter-spacing:.15em;text-transform:uppercase;color:var(--rr-teal);display:flex;align-items:center;gap:9px;margin-bottom:14px}
.rr-panel .rr-eyebrow::before{content:"";width:22px;height:2px;background:var(--rr-teal);border-radius:2px}
.rr-panel .rr-section{padding:22px 0;border-top:1px solid var(--rr-border-light)}
.rr-panel .rr-section:first-child{border-top:none;padding-top:4px}
.rr-panel .rr-caption{font-size:12px;color:var(--rr-text-muted);margin-top:14px}

/* Hero + scorecard */
.rr-panel .rr-hero{display:grid;grid-template-columns:1fr 300px;gap:26px;align-items:start}
.rr-panel .rr-hero-headline{font-size:23px;line-height:1.32;font-weight:700;letter-spacing:-.01em;color:var(--rr-primary-dark)}
.rr-panel .rr-hero-headline b{color:var(--rr-primary)}
.rr-panel .rr-hero-headline em{font-style:normal;color:var(--rr-red)}
.rr-panel .rr-scorecard{background:linear-gradient(160deg,#f7f9fa,#eef3f8);border:1px solid var(--rr-border);border-radius:14px;padding:18px 20px}
.rr-panel .rr-sc-h{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--rr-text-muted);margin-bottom:4px}
.rr-panel .rr-sc-big{font-size:52px;font-weight:700;line-height:1;letter-spacing:-.02em;color:var(--rr-primary-dark)}
.rr-panel .rr-sc-big span{font-size:18px;color:var(--rr-text-muted);font-weight:500}
.rr-panel .rr-sc-sub{font-size:12px;color:var(--rr-text-light);margin:2px 0 14px}
.rr-panel .rr-sc-stats{display:flex;flex-direction:column;gap:8px}
.rr-panel .rr-sc-stat{display:flex;align-items:center;justify-content:space-between;font-size:12.5px;padding:8px 11px;background:#fff;border:1px solid var(--rr-border);border-radius:9px}
.rr-panel .rr-sc-stat b{font-family:'JetBrains Mono',monospace;font-weight:700}
.rr-panel .rr-sc-stat .rr-lo{color:var(--rr-text-light)}
.rr-panel .rr-sc-stat.best b{color:var(--rr-green)}
.rr-panel .rr-sc-stat.worst b{color:var(--rr-amber)}
.rr-panel .rr-flatv{color:var(--rr-text-muted)}

/* KPI grid */
.rr-panel .rr-tldr{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.rr-panel .rr-kpi{background:#fff;border:1px solid var(--rr-border);border-radius:13px;padding:16px 15px 15px;position:relative;overflow:hidden;box-shadow:var(--rr-shadow-sm)}
.rr-panel .rr-kpi::before{content:"";position:absolute;left:0;top:0;right:0;height:3px}
.rr-panel .rr-kpi.red::before{background:var(--rr-red)}
.rr-panel .rr-kpi.amber::before{background:var(--rr-amber)}
.rr-panel .rr-kpi.green::before{background:var(--rr-green)}
.rr-panel .rr-kpi.blue::before{background:var(--rr-blue)}
.rr-panel .rr-kpi.navy::before{background:var(--rr-primary-dark)}
.rr-panel .rr-kpi-ico{width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;margin-bottom:11px;font-size:18px;line-height:1}
.rr-panel .rr-kpi.red .rr-kpi-ico{background:var(--rr-red-bg);color:var(--rr-red)}
.rr-panel .rr-kpi.amber .rr-kpi-ico{background:var(--rr-amber-bg);color:var(--rr-amber)}
.rr-panel .rr-kpi.green .rr-kpi-ico{background:var(--rr-green-bg);color:var(--rr-green)}
.rr-panel .rr-kpi.blue .rr-kpi-ico{background:var(--rr-blue-bg);color:var(--rr-blue)}
.rr-panel .rr-kpi.navy .rr-kpi-ico{background:#eef3f8;color:var(--rr-primary-dark)}
.rr-panel .rr-kpi-k{font-size:13px;font-weight:700;color:var(--rr-text);margin-bottom:5px;line-height:1.3}
.rr-panel .rr-kpi-t{font-size:12.5px;color:var(--rr-text-light);line-height:1.5}

/* Ranking bars */
.rr-panel .rr-legend{display:flex;gap:14px;flex-wrap:wrap;margin:-6px 0 14px;font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--rr-text-muted)}
.rr-panel .rr-legend span{display:inline-flex;align-items:center;gap:5px}
.rr-panel .rr-legend i{width:9px;height:9px;border-radius:3px;display:inline-block}
.rr-panel .rr-rankbars{display:flex;flex-direction:column;gap:6px}
.rr-panel .rr-rb-row{display:grid;grid-template-columns:24px 172px 1fr 74px;gap:11px;align-items:center}
.rr-panel .rr-rb-rank{font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;color:var(--rr-text-muted);text-align:center}
.rr-panel .rr-rb-row.lead .rr-rb-rank{color:var(--rr-gold)}
.rr-panel .rr-rb-name{font-size:13px;font-weight:600;color:var(--rr-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rr-panel .rr-rb-name small{color:var(--rr-text-muted);font-weight:500}
.rr-panel .rr-rb-track{height:22px;background:var(--rr-track);border-radius:7px;position:relative;overflow:hidden}
.rr-panel .rr-rb-fill{height:100%;border-radius:7px;display:flex;align-items:center;justify-content:flex-end;padding-right:8px;color:#fff;font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700}
.rr-panel .rr-rb-fill.blue{background:linear-gradient(90deg,#1a73e8,#3b82f6)}
.rr-panel .rr-rb-fill.amber{background:linear-gradient(90deg,#ea580c,#f97316)}
.rr-panel .rr-rb-fill.green{background:linear-gradient(90deg,#059669,#10a37f)}
.rr-panel .rr-rb-fill.red{background:linear-gradient(90deg,#b91c1c,#dc2626)}
.rr-panel .rr-rb-end{display:flex;align-items:center;gap:6px;justify-content:flex-end}
.rr-panel .rr-rb-d{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;padding:2px 6px;border-radius:5px;min-width:44px;text-align:center}
.rr-panel .rr-rb-d.up{color:var(--rr-green);background:var(--rr-green-bg)}
.rr-panel .rr-rb-d.down{color:var(--rr-red);background:var(--rr-red-bg)}
.rr-panel .rr-rb-d.flat{color:var(--rr-text-muted);background:var(--rr-bg-header)}
.rr-panel .rr-rb-avg{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--rr-primary-dark);opacity:.55;z-index:2}

/* Fingerprint gauges */
.rr-panel .rr-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.rr-panel .rr-sm{background:#fff;border:1px solid var(--rr-border);border-radius:11px;padding:12px 13px;box-shadow:var(--rr-shadow-sm)}
.rr-panel .rr-sm-h{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px}
.rr-panel .rr-sm-code{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;color:var(--rr-primary-dark)}
.rr-panel .rr-sm-code small{display:block;font-family:'DM Sans';font-size:10px;font-weight:500;color:var(--rr-text-muted);letter-spacing:0}
.rr-panel .rr-sm-v{font-family:'JetBrains Mono',monospace;font-size:18px;font-weight:700}
.rr-panel .rr-sm-bar{height:6px;background:var(--rr-track);border-radius:99px;overflow:hidden}
.rr-panel .rr-sm-bar>i{display:block;height:100%;border-radius:99px}
.rr-panel .v-red{color:var(--rr-red)} .rr-panel .v-amber{color:var(--rr-amber)} .rr-panel .v-blue{color:var(--rr-blue)} .rr-panel .v-green{color:var(--rr-green)}
.rr-panel .b-red{background:var(--rr-red)} .rr-panel .b-amber{background:var(--rr-amber)} .rr-panel .b-blue{background:var(--rr-blue)} .rr-panel .b-green{background:var(--rr-green)}

/* Distribution */
.rr-panel .rr-dist{display:grid;grid-template-columns:1fr 260px;gap:22px;align-items:center}
.rr-panel .rr-dist-bar{display:flex;height:44px;border-radius:10px;overflow:hidden;border:1px solid var(--rr-border)}
.rr-panel .rr-dist-seg{display:flex;align-items:center;justify-content:center;color:#fff;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:15px}
.rr-panel .rr-dist-seg.green{background:var(--rr-green)} .rr-panel .rr-dist-seg.blue{background:var(--rr-blue)} .rr-panel .rr-dist-seg.amber{background:var(--rr-amber)} .rr-panel .rr-dist-seg.red{background:var(--rr-red)}
.rr-panel .rr-dist-seg.empty{background:var(--rr-bg-header);color:var(--rr-text-muted);font-size:11px}
.rr-panel .rr-dist-key{display:flex;flex-direction:column;gap:7px}
.rr-panel .rr-dist-k{display:flex;align-items:center;gap:9px;font-size:12.5px;color:var(--rr-text-light)}
.rr-panel .rr-dist-k i{width:11px;height:11px;border-radius:3px}
.rr-panel .rr-dist-k b{margin-left:auto;font-family:'JetBrains Mono',monospace;color:var(--rr-text)}

/* Leaders/laggards + movers */
.rr-panel .rr-ro{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.rr-panel .rr-ro-col h3{display:flex;align-items:center;gap:9px;font-size:12px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;margin-bottom:13px}
.rr-panel .rr-ro-col.lead-col h3{color:var(--rr-green)}
.rr-panel .rr-ro-col.lag-col h3{color:var(--rr-amber)}
.rr-panel .rr-ro-col.up-col h3{color:var(--rr-green)}
.rr-panel .rr-ro-col.down-col h3{color:var(--rr-red)}
.rr-panel .rr-item{display:grid;grid-template-columns:auto 1fr auto;gap:11px;align-items:center;border:1px solid var(--rr-border);border-radius:11px;padding:11px 13px;margin-bottom:9px;background:#fff;box-shadow:var(--rr-shadow-sm)}
.rr-panel .lead-col .rr-item{border-left:3px solid var(--rr-green)}
.rr-panel .lag-col .rr-item{border-left:3px solid var(--rr-amber)}
.rr-panel .rr-item .r{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;color:var(--rr-text-muted)}
.rr-panel .rr-item .n b{font-size:13px;color:var(--rr-text);display:block}
.rr-panel .rr-item .n span{font-size:11.5px;color:var(--rr-text-light)}
.rr-panel .rr-item .sc{font-family:'JetBrains Mono',monospace;font-size:16px;font-weight:700;color:var(--rr-primary-dark)}
.rr-panel .rr-mv{display:grid;grid-template-columns:1fr auto auto;gap:11px;align-items:center;border:1px solid var(--rr-border);border-radius:10px;padding:9px 13px;margin-bottom:8px;background:#fff;box-shadow:var(--rr-shadow-sm)}
.rr-panel .up-col .rr-mv{border-left:3px solid var(--rr-green)}
.rr-panel .down-col .rr-mv{border-left:3px solid var(--rr-red)}
.rr-panel .rr-mv b{font-size:13px;color:var(--rr-text)}
.rr-panel .rr-mv .path{font-family:'JetBrains Mono',monospace;font-size:11.5px;color:var(--rr-text-muted)}
.rr-panel .rr-mv .d{font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;padding:2px 8px;border-radius:6px}
.rr-panel .rr-mv .d.up{color:var(--rr-green);background:var(--rr-green-bg)}
.rr-panel .rr-mv .d.down{color:var(--rr-red);background:var(--rr-red-bg)}

/* Divergence */
.rr-panel .rr-diverge{display:flex;flex-direction:column;gap:12px}
.rr-panel .rr-dv-row{display:grid;grid-template-columns:150px 1fr 116px;gap:14px;align-items:center}
.rr-panel .rr-dv-name{font-size:13.5px;font-weight:600;color:var(--rr-text)}
.rr-panel .rr-dv-track{position:relative;height:28px;background:var(--rr-track);border-radius:8px}
.rr-panel .rr-dv-range{position:absolute;top:6px;bottom:6px;border-radius:6px;background:rgba(26,115,232,.18);border:1px solid rgba(26,115,232,.35)}
.rr-panel .rr-dv-range.wide{background:rgba(220,38,38,.14);border-color:rgba(220,38,38,.4)}
.rr-panel .rr-dv-dot{position:absolute;top:50%;width:13px;height:13px;border-radius:50%;background:var(--rr-primary-dark);border:2px solid #fff;transform:translate(-50%,-50%);box-shadow:0 1px 3px rgba(0,0,0,.25)}
.rr-panel .rr-dv-tag{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;padding:5px 9px;border-radius:7px;text-align:center}
.rr-panel .rr-dv-tag.alta{color:var(--rr-red);background:var(--rr-red-bg)}
.rr-panel .rr-dv-tag.mod{color:var(--rr-amber);background:var(--rr-amber-bg)}
.rr-panel .rr-dv-tag span{display:block;font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;margin-top:1px}

/* Volatility */
.rr-panel .rr-vol{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.rr-panel .rr-vol-col h4{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--rr-text-light);margin-bottom:11px}
.rr-panel .rr-vrow{display:grid;grid-template-columns:1fr 80px 54px;gap:10px;align-items:center;padding:7px 0;border-top:1px solid var(--rr-border-light)}
.rr-panel .rr-vrow:first-of-type{border-top:none}
.rr-panel .rr-vrow b{font-size:13px;font-weight:600;color:var(--rr-text)}
.rr-panel .rr-vbar{height:7px;background:var(--rr-track);border-radius:99px;overflow:hidden}
.rr-panel .rr-vbar>i{display:block;height:100%;border-radius:99px}
.rr-panel .vhi>i{background:var(--rr-amber)}
.rr-panel .vlo>i{background:var(--rr-teal)}
.rr-panel .rr-vnum{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600;color:var(--rr-text-light);text-align:right}

/* Recommendations */
.rr-panel .rr-recs{display:flex;flex-direction:column;gap:12px}
.rr-panel .rr-rec{display:grid;grid-template-columns:44px 1fr;gap:15px;align-items:start;border:1px solid var(--rr-border);border-radius:13px;padding:16px 18px;background:#fff;box-shadow:var(--rr-shadow-sm)}
.rr-panel .rr-rec.p1{background:linear-gradient(120deg,#eff6ff,#fff);border-color:#bfdbfe}
.rr-panel .rr-rec-n{width:44px;height:44px;border-radius:11px;background:var(--rr-primary-dark);color:#fff;display:flex;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;font-weight:700}
.rr-panel .rr-rec.p1 .rr-rec-n{background:var(--rr-primary)}
.rr-panel .rr-rec-title{font-size:15px;font-weight:700;color:var(--rr-text);margin-bottom:8px;line-height:1.35}
.rr-panel .rr-rec-why{display:flex;gap:9px;padding:10px 13px;background:var(--rr-bg-alt);border-left:3px solid var(--rr-teal);border-radius:0 9px 9px 0}
.rr-panel .rr-rec-why b{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--rr-teal);padding-top:2px;white-space:nowrap}
.rr-panel .rr-rec-why span{font-size:13px;color:var(--rr-text-light);line-height:1.5}

/* Footer */
.rr-panel .rr-foot{margin-top:8px;padding:20px 28px;background:var(--rr-bg-alt);border-top:1px solid var(--rr-border);display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.rr-panel .rr-foot-brand{display:flex;align-items:center;gap:11px}
.rr-panel .rr-foot-logo{font-size:16px;font-weight:700;color:var(--rr-primary-dark)}
.rr-panel .rr-foot-logo span{color:var(--rr-primary)}
.rr-panel .rr-foot-tag{font-size:11.5px;color:var(--rr-text-muted);line-height:1.4;max-width:360px}
.rr-panel .rr-foot-conf{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--rr-text-light);border:1px solid var(--rr-border);padding:6px 11px;border-radius:7px;background:#fff}

/* Chart */
.rr-panel .rr-chartwrap{border:1px solid var(--rr-border);border-radius:13px;padding:16px 16px 10px;background:#fff;box-shadow:var(--rr-shadow-sm)}
.rr-panel .rr-clegend{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px}
.rr-panel .rr-cl{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:var(--rr-text-light)}
.rr-panel .rr-cl i{width:16px;height:3px;border-radius:2px;display:inline-block}
.rr-panel .rr-cl i.dash{background:repeating-linear-gradient(90deg,var(--rr-primary-dark) 0 5px,transparent 5px 8px)}
.rr-panel svg.rr-chart{width:100%;height:auto;display:block}
.rr-panel svg.rr-chart .rr-grid{stroke:#eef2f6;stroke-width:1}
.rr-panel svg.rr-chart .rr-axis{stroke:#e5e7eb;stroke-width:1}
.rr-panel svg.rr-chart .rr-ylab,.rr-panel svg.rr-chart .rr-xlab{font-family:'JetBrains Mono',monospace;font-size:10px;fill:var(--rr-text-muted)}
.rr-panel svg.rr-chart polyline{fill:none;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.rr-panel svg.rr-chart polyline.sector{stroke:var(--rr-primary-dark);stroke-width:3;stroke-dasharray:6 4}

@media(max-width:820px){
  .rr-panel .rr-hero,.rr-panel .rr-dist{grid-template-columns:1fr}
  .rr-panel .rr-tldr,.rr-panel .rr-strip{grid-template-columns:repeat(2,1fr)}
  .rr-panel .rr-ro,.rr-panel .rr-vol{grid-template-columns:1fr}
  .rr-panel .rr-rb-row{grid-template-columns:22px 130px 1fr 66px}
  .rr-panel .rr-dv-row{grid-template-columns:120px 1fr 96px}
}
`;

/**
 * Mount the ranking report stylesheet exactly once per page.
 * Safe to render multiple RankingReport instances.
 */
let injected = false;
export function ensureRankingStylesInjected(): void {
  if (typeof document === "undefined") return;
  if (injected) return;
  if (document.getElementById("rr-ranking-styles")) {
    injected = true;
    return;
  }
  const el = document.createElement("style");
  el.id = "rr-ranking-styles";
  el.textContent = RANKING_CSS;
  document.head.appendChild(el);
  // Ensure Google fonts (DM Sans + JetBrains Mono) are available.
  if (!document.getElementById("rr-ranking-fonts")) {
    const link = document.createElement("link");
    link.id = "rr-ranking-fonts";
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap";
    document.head.appendChild(link);
  }
  injected = true;
}