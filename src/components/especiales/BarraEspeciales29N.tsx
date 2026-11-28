/* Barra negra común a todos los especiales del 29-N. La página actual queda marcada. */
export type Especial29N = "cara-a-cara" | "debate-a-ocho" | "debate-a-cuatro" | "apuesta" | "noche";

const ENLACES: { id: Especial29N; t: string; d: string; href: string }[] = [
  { id: "cara-a-cara", t: "Cara a cara", d: "19-N", href: "https://debate.warrooms.info/" },
  { id: "debate-a-ocho", t: "Debate a ocho", d: "23-N", href: "/especiales/debates/debate-a-ocho-23n" },
  { id: "debate-a-cuatro", t: "Debate a cuatro", d: "26-N", href: "/especiales/debates/debate-a-cuatro-26n" },
  { id: "apuesta", t: "La apuesta", d: "29-N", href: "/especiales/elecciones/apuesta-29n" },
  { id: "noche", t: "Noche electoral", d: "29-N", href: "/especiales/elecciones/noche-29n" },
];

const CSS = `
.dbx29{background:#111;color:#f7f5f0;font:700 11px 'Libre Franklin',system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;width:100%}
.dbx29 .dbx29-in{max-width:1180px;margin:0 auto;padding:0 18px;display:flex;align-items:stretch;overflow-x:auto;scrollbar-width:none}
.dbx29 .dbx29-in::-webkit-scrollbar{display:none}
.dbx29 .dbx29-t{padding:8px 14px 8px 0;margin-right:6px;border-right:1px solid #555;white-space:nowrap;color:#bdb8ae}
.dbx29 a{color:#f7f5f0;text-decoration:none;padding:8px 12px;white-space:nowrap;border-bottom:3px solid transparent;opacity:.82}
.dbx29 a:hover{opacity:1}.dbx29 a.on{opacity:1;border-bottom-color:#f7f5f0}
@media(max-width:640px){.dbx29 .dbx29-t,.dbx29 .dbx29-d{display:none}.dbx29 a{padding:8px 9px}}
`;

export function BarraEspeciales29N({ actual, className }: { actual: Especial29N; className?: string }) {
  return (
    <nav className={`dbx29 ${className ?? ""}`} aria-label="Especiales electorales 29-N">
      <style>{CSS}</style>
      <div className="dbx29-in">
        <span className="dbx29-t">Especiales 29-N</span>
        {ENLACES.map(l => <a key={l.id} href={l.href} target="_top" className={l.id === actual ? "on" : undefined} aria-current={l.id === actual ? "page" : undefined}>{l.t}<span className="dbx29-d"> · {l.d}</span></a>)}
      </div>
    </nav>
  );
}

/* Oculta la barra propia que traen los HTML de los debates (se guardan intactos) para que solo se vea la común. */
export function ocultarBarraInterna(iframe: HTMLIFrameElement | null) {
  try {
    const doc = iframe?.contentDocument;
    if (!doc || doc.getElementById("dbx29-hide")) return;
    const s = doc.createElement("style"); s.id = "dbx29-hide"; s.textContent = "nav.dbx{display:none!important}";
    doc.head.appendChild(s);
  } catch { /* sin acceso: se queda la barra interna */ }
}
