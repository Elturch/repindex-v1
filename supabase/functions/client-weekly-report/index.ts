import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";
import { jsPDF } from "npm:jspdf@2.5.2";
import { applyPlugin } from "npm:jspdf-autotable@3.8.2";
applyPlugin(jsPDF);
const autoTable = (d: any, opts: any) => (d as any).autoTable(opts);

// client-weekly-report · v22.2 · 2026-10-20 · QA v3 del colaborador (TEF, noche)
//  v22.2: (1) Rescate de fuente para hechos "pendientes de verificación": si la
//  cita de un modelo lleva al lado un enlace o un marcador [n] cuya URL está en
//  el anexo con estado ABRE (y no es sección), esa URL es la fuente del hecho
//  (caso revistacloud-canalizaciones; antes, Expansión 12/10). Solo URLs que
//  abren y cuyo slug comparte términos con el hecho. (2) Si la portada (titular,
//  alerta u oportunidad) cita una métrica por su nombre o sigla, esa métrica
//  entra en la tabla "las que explican la semana" aunque no esté entre las 4 de
//  mayor movimiento. (3) "caída de -6" -> "caída de 6" (el signo no se duplica
//  tras palabras de descenso). (4) Las acciones anteriores retiradas se imprimen
//  al final de la tabla, nunca como primera fila. (5) La distancia a la media
//  con "-" se explica al pie: solo X de N empresas del grupo tienen esa métrica
//  (CXM solo aplica a cotizadas). NOTA verificada en BD: el doble "#1 (empate)"
//  de TEF es CORRECTO — MASORANGE y Vodafone empataron exactamente a 64,33 el
//  11-oct (la media exacta, no redondeos).
// client-weekly-report · v22.1 · 2026-10-20 · tres remates tras la revisión visual
//  v22.1: (1) "vigilar" se aplana a frases cuando el agente devuelve objetos
//  (ANA imprimía "[object Object]"). (2) Radar del emisor sin falsos positivos:
//  el tema solo cuenta como detectado si TODAS sus palabras distintivas (8+
//  letras) están en el material — "presidente" o "quirón" sueltos ya no bastan.
//  (3) Un hecho cuyo único respaldo es una fuente de opinión/agregador (T5) y
//  un solo modelo no entra en los 3 hechos: baja a vigilancia con su matiz y
//  lo que se apoyara en él se trata como pendiente (caso Mollinedo/ad-hoc-news).
// client-weekly-report · v22 · 2026-10-20 · QA v2 del colaborador (misma tarde)
//  v22: (1) FIX del falso positivo de la regla de oro (ANA 18/10: el contrato
//  real de Australia cayó por compartir "contrato/proyecto/ganado" con una
//  invención de Qwen sobre Colombia): vocabulario genérico de negocio fuera del
//  matcher, números distintivos dentro (12 millones, 80 empleos), umbral más
//  exigente (5 compartidos, o 4+1 raro, o 3+2 raros; raro = 9+ letras o
//  número), un hecho VERIFICADO con fuente que abre es inmune al matching por
//  tokens (solo lo retira la identidad de cita), y la marca roja de cita
//  (cita_inv) solo por identidad literal. Calibrado con QS 11-oct y ANA
//  18-oct: 7/7 invenciones retiradas, 0 falsos positivos. (2) Etiqueta de
//  inventada POR FILA según su evidencia: URL rota real / la propia IA la
//  marca como simulada / extracto oficial que la desmiente (nombrando la
//  fuente). (3) ROTA solo con 404/410 confirmado dos veces; 403, bloqueo o
//  timeout = N/C. (4) "Cosas falsas sobre ti" cuenta solo sujeto=empresa; lo
//  del entorno (competidores, regulador, sector) va en línea aparte y marcado
//  en la tabla. (5) "¿Se nota?" = "No aplica" si la acción está sin empezar;
//  estado "retirada" visible. (6) Email: preheader con el dato (no repite el
//  titular). (7) Titular determinista de respaldo en frase natural. (8) "Cómo
//  leer" sin partir de página; "Los hechos que más pesan" si hay menos de 3.
//  (9) "#1 (empate)" cuando el puesto previo está compartido. (10) Portadas y
//  secciones fuera de los recuentos de fuentes y de la tabla de tiers (se
//  listan aparte). (11) corp_domains y temas_activos desde issuer_factsheet:
//  dominios del grupo como Corporativo y radar de temas que las IAs aún no
//  recogen, en portada. (12) Tiers: handelsblatt -> T2; spiegel, faz,
//  newsweek -> T3.
//  v21.1: la etiqueta "Inventada (una fuente oficial la desmiente)" exige
//  extracto literal (evidencia_extracto); sin extracto, la evidencia es la URL
//  que no existe (rix-verify guarda esa URL en evidencia_url, que por tanto no
//  distingue los dos casos).
//  v21: (1) variación de portada EXACTA: diferencia de medias con décimas
//  (rixc_x de esta semana menos rixc_x de la anterior), no la resta de enteros
//  redondeados del datapack; la significancia se recalcula sobre ese delta
//  (fix QS 18/10: +3,5 < umbral 3,8 => sin cambio significativo). (2) La
//  fórmula documentada dice lo que se usa: nota de cada modelo = agregado
//  ponderado de sus 8 métricas; RIXc = media de las 6 notas (verificado contra
//  rix_ranking_datapack y rix_runs_v2). (3) Página "Cómo leer este informe".
//  (4) Semáforo de ficha básica auto-omitido si <1/3 de celdas con dato.
//  (5) Auditoría: inventadas separadas en "URL inexistente" vs "desmentida por
//  fuente oficial"; confirmadas visibles; orden por gravedad; acción por
//  defecto determinista cuando falta ("o todas o ninguna"); línea de total en
//  portada. (6) Regla de oro ampliada: acción que depende de un hecho
//  "pendiente de verificación" se convierte en acción de verificación; material
//  que la propia IA etiqueta como URL simulada/ficticia no entra en hechos,
//  acciones ni portada. (7) Anexo URL: portadas/secciones etiquetadas SECCIÓN
//  (no "ROTA"): aunque abran, no son una noticia. (8) Tiers: gob.es,
//  comunidad.madrid, asambleamadrid.es, parlament.cat, muface.es, bme.es,
//  bolsasymercados.es -> T1; dowjones.com -> T2; aemps.gob.es se agrupa en
//  gob.es. (9) Grafías unificadas (RIXc, DeepSeek, Gemini) y separadores
//  españoles también sobre millares ingleses de la capa narrativa. (10) Email
//  rediseñado: asunto con el dato, preheader, "Nota RepIndex X sobre 100",
//  flechas con signo y caso cero, puesto sin abreviaturas, línea de auditoría.
//  (11) Acción cortada en límite de palabra (fix "sostenibilida"). (12) Tabla
//  de competidores con variación en décimas (coherente con portada). (13)
//  Etiqueta por modelo cuando la auditoría le marca invenciones o no citó
//  fuentes esa semana.
// v20 · 2026-10-16 · Fase 1 del cuaderno: REGLA DE ORO
//  v20: nada marcado como inventado por la auditoría puede salir como titular,
//  hecho, oportunidad, alerta, acción ni vigilancia. Tres capas: (1) el agente
//  recibe auditoria_inventadas en su payload con prohibición explícita y
//  etiqueta de qué hechos se apoya cada acción/portada; (2) candado por
//  software: matcher por identidad de cita + solape de términos (calibrado con
//  la semana 2026-10-11: 0 falsos positivos) + cascada por dependencias;
//  (3) la cita de un modelo que coincida con una inventada se imprime con
//  marca roja. Además: fuente de un hecho cuyo único respaldo son URLs ROTA
//  -> ámbar; filtro de ruido de herramientas (Tavily) en las citas; anexo
//  íntegro cortado en límite de palabra y limpieza de símbolos rotos.
// v18 · 2026-10-14 · sección "Lo que las IAs dicen mal de ti"
//  v18: nueva sección de auditoría de veracidad tras "Los 3 hechos": tabla de
//  afirmaciones con veredicto (inventada/desactualizada/sin fuente, con gravedad
//  y acción) + semáforo determinista de ficha básica por IA. Solo LEE
//  rix_claim_checks (las escribe rix-verify, que corre antes); si no hay datos
//  para el ticker/semana, la sección se omite entera. Regla (9) en la ficha.
//  v17: verificación HTTP de las URL citadas en el anexo (ABRE/ROTA/N-C).
//  v16: test_recipients (solo con test_mode). v15: comaNarr (decimales con coma
//  en la capa narrativa, nunca en citas).
// v14 · 2026-10-12 · QA de MAT sobre TEF y ANA del 11/10
//  v14: nota automática cuando cambia el puesto sin cambio significativo (el
//  umbral aplica a la nota, no al puesto); nota fija RIXc != media de los 6
//  modelos + contexto heredado; distancia a media = N/D si <2 entidades del
//  grupo tienen la métrica; variación "-" y "sin dato previo" para entidades
//  sin semana anterior; citas truncadas en límite de palabra con [...]; tabla
//  de fuentes SIN tope (cuadra siempre con la cabecera); anexo de URL citadas
//  tal cual las devolvió cada IA; consenso con TODOS los temas núcleo y
//  aclaración de cuántos se detectaron; plazos normalizados; tiers: fortune/
//  forbes/businessinsider/finance.yahoo -> T2, xatakamovil -> T4; agrupación
//  de subdominios respeta cabeceras de las listas (es.finance.yahoo.com ->
//  finance.yahoo.com); glosario DCM aclarado y ficha con reglas 7 y 8.
// v12-v13 · QA de MAT sobre la edición del 11/10 de QS
//  - Citas por modelo desde la RESPUESTA BRUTA de cada IA (columnas *_bruto),
//    no desde el resumen del evaluador. Verificación literal contra ese raw.
//  - Divergencia (rango máx-mín) visible en portada con su etiqueta canónica.
//  - Hechos: color por sentido (positivo/riesgo), fuente auto-verificada contra
//    los dominios citados esa semana (Expansión <-> expansion.com), fecha solo
//    si consta en el raw. Acciones nunca sobre hechos sin verificar (prompt).
//  - Movimiento de competidores impreso por CÓDIGO (de #X a #Y); el agente solo
//    aporta la causa. Imposible otro "estable" siendo 6º->5º.
//  - Métricas: top 4 movimientos en el cuerpo, tabla completa en anexo, con
//    notas del agente para movimientos contraintuitivos y aclaración de SIM.
//  - Anexo de fuentes: dominios agrupados (eTLD+1 salvo cabeceras propias tipo
//    cincodias.elpais.com), fuentes únicas y citas totales separadas, sin tope
//    que descuadre los recuentos.
//  - Anexo nuevo: pregunta idéntica del protocolo + respuesta íntegra de las 6 IAs.
//  - Formato: decimales SIEMPRE con coma, tildes en todas las etiquetas, flujo
//    continuo sin medias páginas vacías, sin solapes de titular ni de pie.
// v10/v11: esqueleto 100% calculado, un solo grupo, significancia determinista,
// candado 1 envío/cliente/semana, test solo a admin.

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const ADMIN_EMAIL = "datos@hablamosde.com";
const BCC = "info@repindex.ai";

const METRICS = [
  { key: "nvm", code: "NVM", name: "Calidad de la narrativa", peso: 15 },
  { key: "drm", code: "DRM", name: "Fortaleza de la evidencia", peso: 15 },
  { key: "sim", code: "SIM", name: "Autoridad de las fuentes", peso: 12 },
  { key: "rmm", code: "RMM", name: "Actualidad y empuje", peso: 12 },
  { key: "cem", code: "CEM", name: "Gestión de controversias", peso: 12 },
  { key: "gam", code: "GAM", name: "Percepción de gobierno", peso: 12 },
  { key: "dcm", code: "DCM", name: "Coherencia informativa", peso: 12 },
  { key: "cxm", code: "CXM", name: "Ejecución corporativa", peso: 10 },
];
// Columna de respuesta bruta por modelo (lo que la IA respondió de verdad)
const MODEL_RAW_COL: Record<string, string> = {
  "ChatGPT": "20_res_gpt_bruto",
  "Perplexity": "21_res_perplex_bruto",
  "Google Gemini": "22_res_gemini_bruto",
  "Deepseek": "23_res_deepseek_bruto",
  "Grok": "respuesta_bruto_grok",
  "Qwen": "respuesta_bruto_qwen",
};

const C = {
  navyDeep: [18, 52, 63] as const, teal: [32, 128, 141] as const, head: [26, 58, 92] as const,
  acc: [26, 115, 232] as const, ink: [15, 20, 25] as const, mut: [83, 100, 113] as const,
  mut2: [136, 153, 166] as const, green: [16, 163, 127] as const, amber: [249, 115, 22] as const,
  red: [220, 38, 38] as const, border: [229, 231, 235] as const, soft: [240, 244, 248] as const,
  soft2: [247, 249, 250] as const, grid: [238, 242, 246] as const, accSoft: [232, 240, 254] as const,
};
type RGB = readonly [number, number, number];

// ---- Clasificación de fuentes ----
const T1_OFICIAL = ["cnmv.es","sec.gov","bde.es","boe.es","cnmc.es","esma.europa.eu","ec.europa.eu","europa.eu","gob.es","ine.es","lamoncloa.gob.es","congreso.es","senado.es","aepd.es","comunidad.madrid","asambleamadrid.es","parlament.cat","muface.es","bme.es","bolsasymercados.es"];
const T2_ECO = ["dowjones.com","handelsblatt.com","reuters.com","bloomberg.com","ft.com","wsj.com","economist.com","cnbc.com","efe.com","europapress.es","expansion.com","cincodias.elpais.com","eleconomista.es","elconfidencial.com","vozpopuli.com","marketscreener.com","investing.com","finanzas.com","bolsamania.com","estrategiasdeinversion.com","invertia.com","fortune.com","forbes.com","businessinsider.com","businessinsider.es","finance.yahoo.com"];
const T3_GEN = ["spiegel.de","faz.net","newsweek.com","elpais.com","elmundo.es","abc.es","lavanguardia.com","larazon.es","20minutos.es","elespanol.com","eldiario.es","publico.es","rtve.es","cadenaser.com","cope.es","ondacero.es","antena3.com","lasexta.com","telecinco.es","telemadrid.es","elperiodico.com","euronews.com","infobae.com","msn.com","yahoo.com","libertaddigital.com","elindependiente.com","theobjective.com","huffingtonpost.es","elcorreo.com","lavozdegalicia.es","diariosur.es","laopiniondemalaga.es","levante-emv.com","farodevigo.es","heraldo.es","eldiariomontanes.es","diariovasco.com","lne.es","laprovincia.es","informacion.es","hoy.es","ideal.es","laverdad.es","lasprovincias.es","elnortedecastilla.es","diariodesevilla.es","malagahoy.es","granadahoy.com","diariodecadiz.es","europasur.es","diariodejerez.es","huelvainformacion.es","eldiadecordoba.es","canarias7.es","eldia.es","ultimahora.es","diariodemallorca.es","elperiodicodearagon.com","elperiodicoextremadura.com","laopinioncoruna.es","laopiniondemurcia.es","laopiniondezamora.es","diariodenavarra.es","noticiasdenavarra.com","deia.eus","elcomercio.es","larioja.com","naciodigital.cat","ara.cat","elpuntavui.cat"];
const T4_ESP = ["diariomedico.com","redaccionmedica.com","consalud.es","actasanitaria.com","gacetamedica.com","elglobal.es","isanidad.com","diariofarma.com","65ymas.com","plantadoce.com","modaes.com","kippel01.com","palco23.com","ejeprime.com","elperiodicodelaenergia.com","energias-renovables.com","pv-magazine.es","elmercantil.com","cadenadesuministro.es","hosteltur.com","preferente.com","xataka.com","xatakamovil.com","xatakandroid.com","bandaancha.eu","adslzone.net","hipertextual.com","genbeta.com","motorpasion.com","hibridosyelectricos.com","agroinformacion.com","agrodigital.com","funds-society.com","dirigentesdigital.com","merca2.es","economiadigital.es"];
const ALL_TIER_LISTS = [...T1_OFICIAL, ...T2_ECO, ...T3_GEN, ...T4_ESP];
const domMatch = (d: string, list: string[]) => list.some((s) => d === s || d.endsWith("." + s));
const normDom = (domain: string) => (domain || "").toLowerCase().replace(/^www\./, "");
// v21: una URL de portada o sección (raíz del dominio, o 1-2 tramos cortos sin
// dígitos ni slug largo) no es una noticia: aunque abra, no documenta un hecho,
// y si no abre tampoco es la "URL fabricada de una noticia". Se etiqueta aparte.
const esSeccionUrl = (u: string): boolean => {
  try {
    const p = new URL(u);
    const segs = p.pathname.split("/").filter(Boolean);
    if (!segs.length) return true;
    if (segs.length > 2) return false;
    if (/\d/.test(p.pathname)) return false;
    const last = segs[segs.length - 1];
    return (last.match(/[-_]/g) ?? []).length < 2; // un slug de noticia lleva varias palabras unidas
  } catch (_e) { return false; }
};
function tierOf(domain: string, corpDomains: string[]): number {
  const d = normDom(domain);
  if (!d) return 5;
  if (domMatch(d, corpDomains)) return 6;
  if (domMatch(d, T1_OFICIAL) || d.endsWith(".gob.es") || d.endsWith(".gov")) return 1;
  if (domMatch(d, T2_ECO)) return 2;
  if (domMatch(d, T3_GEN)) return 3;
  if (domMatch(d, T4_ESP)) return 4;
  return 5;
}
// Agrupación eTLD+1: fotos.europapress.es -> europapress.es. Se respeta el
// subdominio cuando es una cabecera propia reconocida (está en las listas de
// tiers o es web corporativa del cliente), p. ej. cincodias.elpais.com.
function groupDomain(domain: string, corpDomains: string[]): string {
  const d = normDom(domain);
  if (!d.includes(".")) return d;
  // Se respeta la cabecera reconocida más específica: el propio dominio o
  // cualquiera de sus sufijos presente en las listas (es.finance.yahoo.com ->
  // finance.yahoo.com; fotos.europapress.es -> europapress.es).
  const parts = d.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const suf = parts.slice(i).join(".");
    if (ALL_TIER_LISTS.includes(suf) || corpDomains.includes(suf)) return suf;
  }
  if (parts.length <= 2) return d;
  return parts.slice(-2).join(".");
}
const TIER_LABEL: Record<number, string> = { 1: "T1 Oficial/Regulador", 2: "T2 Agencias/Económico", 3: "T3 Generalista", 4: "T4 Especializado", 5: "T5 Opinión/Otros", 6: "Corporativo" };
const TIER_COLOR: Record<number, RGB> = { 1: C.green, 2: C.acc, 3: C.head, 4: C.amber, 5: C.mut2, 6: C.teal };

// ---- Reglas canónicas ----
const DIV_THRESHOLDS = { consolidado: 8, moderado: 14 };
function divergenceLevel(range: number): { label: string; col: RGB } {
  if (range <= DIV_THRESHOLDS.consolidado) return { label: "Relato consolidado", col: C.green };
  if (range <= DIV_THRESHOLDS.moderado) return { label: "Divergencia moderada", col: C.amber };
  return { label: "Narrativa frágil", col: C.red };
}
function significance(delta: number | null, vol: number | null): { sig: boolean | null; threshold: number } {
  const thr = Math.max(2, 1.5 * (Number.isFinite(Number(vol)) ? Number(vol) : 0));
  if (delta == null || !Number.isFinite(Number(delta))) return { sig: null, threshold: thr };
  return { sig: Math.abs(Number(delta)) >= thr, threshold: Math.round(thr * 10) / 10 };
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
// v21: UNA sola grafía en todo el informe (el dato en BD no cambia, solo la impresión)
const showModel = (m: unknown) => { const s = String(m ?? ""); return s === "Google Gemini" ? "Gemini" : s === "Deepseek" ? "DeepSeek" : s; };
const showModels = (arr: unknown) => (Array.isArray(arr) ? arr.map(showModel).join(", ") : "-");
const showMet = (m: unknown) => (String(m ?? "").toUpperCase() === "RIXC" ? "RIXc" : String(m ?? "-"));
const clean = (s: unknown) => String(s ?? "").replace(/\*\*/g, "").replace(/[→▲▼—·«»“”‘’]/g, (c) => ({ "→": "->", "▲": "^", "▼": "v", "—": "-", "·": "-", "«": '"', "»": '"', "“": '"', "”": '"', "‘": "'", "’": "'" }[c] as string)).replace(/ /g, " ").replace(/[^\x20-\x7E¡¿ºª°áàâäãéèêëíìîïóòôöõúùûüñçÁÀÂÄÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÑÇ€\n\r\t]/g, "");
// Formato español: decimales SIEMPRE con coma
const coma = (s: string) => s.replace(".", ",");
const fmt1 = (n: any) => (n == null || !Number.isFinite(Number(n)) ? "N/D" : coma(Number(n).toFixed(1)));
const fmt0 = (n: any) => (n == null || !Number.isFinite(Number(n)) ? "N/D" : String(Math.round(Number(n))));
const fmtD = (n: any) => (n == null || !Number.isFinite(Number(n)) ? "-" : (Number(n) > 0 ? "+" : "") + coma(Number(n).toFixed(1)));
const fmtD0 = (n: any) => (n == null || !Number.isFinite(Number(n)) ? "-" : (Number(n) > 0 ? "+" : "") + String(Math.round(Number(n))));
const deltaColor = (n: any): RGB => (n == null || !Number.isFinite(Number(n)) || Math.abs(Number(n)) <= 0.05 ? C.mut2 : Number(n) > 0 ? C.green : C.red);
function fmtWeekLabel(weekStart: string): string {
  const d = new Date(weekStart + "T00:00:00Z");
  return `Semana del ${d.getUTCDate()} de ${d.toLocaleDateString("es-ES", { month: "long", timeZone: "UTC" })} de ${d.getUTCFullYear()}`;
}
const r1 = (n: any) => (n == null || !Number.isFinite(Number(n)) ? null : Math.round(Number(n) * 10) / 10);
// Normalización para verificar citas literales (sin tildes para matching robusto)
const stripAcc = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const normTxt = (s: unknown) => stripAcc(String(s ?? "").toLowerCase()).replace(/[\s ]+/g, " ").replace(/[*_“”«»'‘’"]/g, "").trim();
const isLiteral = (cita: unknown, material: string) => {
  const c = normTxt(cita);
  return c.length >= 12 && material.includes(c);
};
// Truncado en límite de palabra: nunca cortes a mitad de palabra; si se
// recorta, se marca con [...] (el fragmento impreso sigue siendo literal).
const cutWord = (s: unknown, n: number) => {
  const t = String(s ?? "");
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 6);
  const i = cut.lastIndexOf(" ");
  return (i > 40 ? cut.slice(0, i) : cut).replace(/[\s,;:.]+$/, "") + " [...]";
};

// ---- v20 · Regla de oro: matcher de afirmaciones inventadas ----
// Calibrado con QS 2026-10-11 (0 falsos positivos): R1 = identidad de cita
// (la cita del brief ES la cita de la inventada, ambas literales del raw);
// R2 = solape de términos significativos (stem ligero, sin stopwords ni el
// nombre del emisor): >=4 compartidos, o >=3 con 1 raro, o >=2 raros
// (raro = 8+ caracteres o contiene dígito). La cascada por dependencias
// (se_apoya_en) cubre las paráfrasis que el solape no alcanza.
const GOLD_STOP = new Set(["sobre","entre","desde","hasta","esta","este","estos","estas","unos","unas","donde","cuando","segun","aunque","tambien","durante","contra","hacia","noticia","noticias","semana","semanal","empresa","compania","grupo","millones","euros","nuevo","nueva","nuevos","nuevas","octubre","enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","noviembre","diciembre","modelo","modelos","espana","madrid","barcelona",
  // v22: vocabulario genérico de negocio — el falso positivo de ANA 18-oct se
  // apoyaba SOLO en estas palabras ("contrato", "proyecto", "ganado")
  "contrato","contratos","proyecto","proyectos","construccion","ganado","ganada","adjudicacion","adjudicado","adjudicada","adjudicataria","adjudicatarias","inversion","inversiones","inversione","acuerdo","acuerdos","operacion","operaciones","operacione","anuncio","anunciado","anunciada","anuncia","lanzamiento","presentado","presentada","presenta","presento","mencionado","mencionada","menciona","mencionadas","importante","importantes","estrategico","estrategica","internacional","internacionales","internacionale","resultado","resultados","crecimiento","aumento","incremento","valorado","valorada","espanola","espanol","region","negocio","negocios","sector","sectores","mercado","mercados","servicio","servicios","empresas","mantenimiento","incluye","total","asciende","respecto","periodo","anterior","mayor","mayores"]);
const GOLD_NUM_STOP = new Set(["00", "000", "100", "2023", "2024", "2025", "2026", "2027"]);
const goldStem = (t: string) => t.replace(/s$/, "");
const goldTokens = (s: unknown, extraStop: Set<string>): Set<string> => {
  const out = new Set<string>();
  for (const t of normTxt(s).split(/[^a-z0-9]+/)) {
    // v22: los números distintivos (12 millones, 80 empleos, 410, 250...) son
    // la mejor señal; fuera años y restos de separadores de millar
    if (/^\d+$/.test(t)) { if (t.length >= 2 && !GOLD_NUM_STOP.has(t)) out.add(t); continue; }
    if (t.length < 5) continue;
    const st = goldStem(t);
    if (GOLD_STOP.has(t) || GOLD_STOP.has(st) || extraStop.has(t) || extraStop.has(st)) continue;
    out.add(st);
  }
  return out;
};
type GoldMatch = { claim: string; via: "cita" | "tokens" } | null;
function buildGoldMatcher(inventadas: Array<{ claim: string; cita?: string | null }>, issuerName: string): (txt: unknown) => GoldMatch {
  const extraStop = new Set(normTxt(issuerName).split(/[^a-z0-9]+/).map(goldStem).filter((t) => t.length >= 4));
  const refs = inventadas.map((c) => {
    const toks = goldTokens(`${c.claim} ${c.cita ?? ""}`, extraStop);
    const rare = new Set([...toks].filter((t) => t.length >= 9 || /\d/.test(t)));
    return { claim: c.claim, citaNorm: normTxt(c.cita ?? ""), toks, rare };
  });
  return (txt: unknown): GoldMatch => {
    const n = normTxt(txt);
    if (!n || !refs.length) return null;
    for (const r of refs) {
      if (r.citaNorm.length >= 40 && (n.includes(r.citaNorm) || r.citaNorm.includes(n))) return { claim: r.claim, via: "cita" };
    }
    const T = goldTokens(txt, extraStop);
    for (const r of refs) {
      let shared = 0, rare = 0;
      for (const t of T) { if (r.toks.has(t)) { shared++; if (r.rare.has(t)) rare++; } }
      // v22: umbral endurecido (calibrado con QS 11-oct y ANA 18-oct)
      if (shared >= 5 || (shared >= 4 && rare >= 1) || (shared >= 3 && rare >= 2)) return { claim: r.claim, via: "tokens" };
    }
    return null;
  };
}
// Ruido de herramientas internas de los modelos: nunca en una cita impresa
const toolNoise = /tavily|serpapi|web[\s_]?search|search\s?(api|tool)|b[uú]squeda\s+web/i;

// ============================ PDF ============================
function buildBriefPdf(ctx: any): Uint8Array {
  const { clientName, issuerName, ticker, weekLabel, weekStart, brief, grupo, yo, metricRows, modelRows, prevActions, actions, citations, consensus, protocolQuestion, verif } = ctx;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const M = 42, CW = W - 2 * M;
  const BOTTOM = 58; // margen inferior reservado al pie (evita solapes)
  let y = 0;
  const mono = (b = false) => doc.setFont("courier", b ? "bold" : "normal");
  const sans = (s: "normal" | "bold" = "normal") => doc.setFont("helvetica", s);
  const ensure = (need: number) => { if (y + need > H - BOTTOM) { doc.addPage(); y = 46; } };
  const newPage = () => { doc.addPage(); y = 46; };

  const panel = (px: number, py: number, pw: number, ph: number, fill: RGB = [255, 255, 255], r = 8) => {
    doc.setFillColor(...fill); doc.setDrawColor(...C.border); doc.setLineWidth(0.8);
    doc.roundedRect(px, py, pw, ph, r, r, "FD");
  };
  const sectionTitle = (t: string, sub?: string) => {
    ensure(sub ? 58 : 44);
    y += 18;
    sans("bold"); doc.setFontSize(13.5); doc.setTextColor(...C.head);
    doc.text(t, M, y);
    doc.setDrawColor(...C.acc); doc.setLineWidth(2); doc.line(M, y + 5, M + 46, y + 5);
    doc.setDrawColor(...C.border); doc.setLineWidth(0.7); doc.line(M + 46, y + 5, M + CW, y + 5);
    y += 16;
    if (sub) { sans(); doc.setFontSize(8.2); doc.setTextColor(...C.mut); const l = doc.splitTextToSize(clean(sub), CW); doc.text(l, M, y + 4); y += l.length * 10.4 + 8; }
    else { y += 4; }
  };
  const smallHeader = (t: string) => {
    ensure(20); sans("bold"); doc.setFontSize(8); doc.setTextColor(...C.mut2);
    doc.text(t, M, y + 8); y += 14;
  };

  // ---------- Cabecera ----------
  const headerH = 92;
  for (let i = 0; i < 60; i++) {
    const t = i / 59;
    doc.setFillColor(Math.round(C.navyDeep[0] + (C.teal[0] - C.navyDeep[0]) * t), Math.round(C.navyDeep[1] + (C.teal[1] - C.navyDeep[1]) * t), Math.round(C.navyDeep[2] + (C.teal[2] - C.navyDeep[2]) * t));
    doc.rect((W / 60) * i, 0, W / 60 + 1, headerH, "F");
  }
  doc.setFillColor(...C.acc); doc.rect(0, headerH, W, 3, "F");
  mono(true); doc.setFontSize(9.5); doc.setTextColor(234, 252, 255);
  doc.text("REPINDEX", M, 30, { charSpace: 2.2 });
  sans(); doc.setFontSize(8.2); doc.setTextColor(203, 225, 230);
  doc.text("Briefing semanal de reputación algorítmica · Confidencial", M + 82, 30);
  sans("bold"); doc.setFontSize(21); doc.setTextColor(255, 255, 255);
  doc.text(clean(issuerName), M, 58);
  sans(); doc.setFontSize(8.4); doc.setTextColor(214, 235, 240);
  doc.text(clean(`${weekLabel} · Grupo de comparación: ${grupo.label} (${grupo.n} empresas)`), M, 73);
  doc.text(clean("6 modelos de IA · datos deterministas"), M, 85);
  y = headerH + 20;

  // ====================== LA SEMANA EN UN VISTAZO ======================
  sectionTitle("La semana en un vistazo");
  y += 10; // aire entre el título de sección y el titular (fix solape)
  sans("bold"); doc.setFontSize(13); doc.setTextColor(...C.ink);
  const tl = doc.splitTextToSize(clean(brief?.titular ?? ""), CW);
  ensure(tl.length * 16.5 + 8);
  doc.text(tl, M, y + 10, { lineHeightFactor: 1.3 });
  y += tl.length * 16 + 16;

  const tileH = 64, tileW = (CW - 20) / 3;
  ensure(tileH + 8);
  const sigInfo = yo.sig;
  const sigTxt = sigInfo.sig == null ? "Sin dato" : sigInfo.sig ? "Cambio significativo" : "Sin cambio significativo";
  const tiles = [
    { k: "RIXc", v: fmt1(yo.rixc_x), extra: `${fmtD(yo.delta)} vs semana anterior`, col: deltaColor(yo.delta), big: true },
    { k: `PUESTO ENTRE ${grupo.n}`, v: yo.rank != null ? `#${yo.rank}` : "-", extra: yo.rank_prev != null ? `semana anterior: #${yo.rank_prev}` : "sin dato previo", col: yo.rank != null && yo.rank_prev != null ? (yo.rank < yo.rank_prev ? C.green : yo.rank > yo.rank_prev ? C.red : C.mut2) : C.mut2, big: true },
    { k: "SEÑAL DEL CAMBIO", v: sigTxt, extra: `umbral ±${fmt1(sigInfo.threshold)} pts (1,5 veces su volatilidad de 12 semanas)`, col: sigInfo.sig ? C.amber : C.mut2, big: false },
  ];
  tiles.forEach((t, i) => {
    const tx = M + i * (tileW + 10);
    panel(tx, y, tileW, tileH);
    mono(true); doc.setFontSize(6.6); doc.setTextColor(...C.mut2);
    doc.text(t.k, tx + 10, y + 15, { charSpace: 0.8 });
    sans("bold"); doc.setFontSize(t.big ? 20 : 10.5); doc.setTextColor(...(t.big ? C.ink : t.col));
    const vLines = doc.splitTextToSize(String(t.v), tileW - 18);
    doc.text(vLines, tx + 10, y + (t.big ? 40 : 32));
    sans(); doc.setFontSize(6.8); doc.setTextColor(...(i === 0 ? t.col : C.mut));
    doc.text(doc.splitTextToSize(clean(t.extra), tileW - 18), tx + 10, y + 50);
  });
  y += tileH + 8;

  // Divergencia entre modelos (visible, con etiqueta canónica)
  const divLvl = divergenceLevel(yo.rango ?? 0);
  ensure(26);
  panel(M, y, CW, 24, C.soft2 as unknown as RGB, 6);
  sans("bold"); doc.setFontSize(8); doc.setTextColor(...C.ink);
  doc.text(clean(`Rango entre los 6 modelos: ${fmt0(yo.rango)} puntos (de ${fmt0(yo.rix_min)} a ${fmt0(yo.rix_max)})`), M + 10, y + 15.5);
  sans("bold"); doc.setFontSize(8); doc.setTextColor(...divLvl.col);
  doc.text(clean(`${divLvl.label.toUpperCase()}  -  umbrales: 0-8 consolidado, 9-14 moderado, 15+ frágil`), M + CW - 10, y + 15.5, { align: "right" });
  y += 30;

  // v21: el dato más fuerte de la semana, en portada (repite el total de la auditoría)
  // v22: cuenta solo lo dicho SOBRE LA EMPRESA; lo del entorno, en inciso aparte
  if (verif && Array.isArray(verif.claims) && verif.claims.length) {
    const invTodas = verif.claims.filter((r: any) => r.verdict === "inventada");
    const inv = invTodas.filter((r: any) => r.sujeto !== "entorno");
    const invEnt = invTodas.length - inv.length;
    const des = verif.claims.filter((r: any) => r.verdict === "desactualizada");
    const nGraves = inv.filter((r: any) => r.gravedad === "alta").length;
    const entTxt = invEnt ? ` (además, ${invEnt === 1 ? "1 invención" : `${invEnt} invenciones`} sobre competidores, regulador o sector)` : "";
    const txtAud = inv.length
      ? `Auditoría de veracidad: esta semana las IAs han dicho ${inv.length === 1 ? "1 cosa falsa" : `${inv.length} cosas falsas`} sobre ${issuerName}${nGraves ? ` (${nGraves} de gravedad alta)` : ""}${des.length ? ` y ${des.length === 1 ? "1 dato desactualizado" : `${des.length} datos desactualizados`}` : ""}${entTxt} - detalle en "Lo que las IAs dicen mal de ti".`
      : `Auditoría de veracidad: ninguna afirmación inventada sobre ${issuerName} esta semana${des.length ? ` (${des.length === 1 ? "1 dato desactualizado" : `${des.length} datos desactualizados`})` : ""}${entTxt}.`;
    sans("bold"); doc.setFontSize(8);
    const audL = doc.splitTextToSize(clean(txtAud), CW - 20);
    const audH = Math.max(22, audL.length * 10 + 12);
    ensure(audH + 6);
    panel(M, y, CW, audH, [255, 255, 255], 6);
    doc.setFillColor(...(inv.length ? C.red : C.green)); doc.rect(M + 1, y + 1, 3, audH - 2, "F");
    doc.setTextColor(...(inv.length ? C.red : C.green));
    doc.text(audL, M + 12, y + 14, { lineHeightFactor: 1.25 });
    y += audH + 6;
  }

  // v22: radar del emisor — temas activos de la ficha que las IAs aún no recogen
  for (const tr of (ctx.temasRadar ?? [])) {
    sans(); doc.setFontSize(7.6);
    const txt = tr.detectado
      ? `Radar del emisor: el tema "${tr.tema}" de tu ficha aparece esta semana en las respuestas de las IAs - revísalo en los hechos y en la auditoría.`
      : `Radar del emisor: las IAs aún no recogen "${tr.tema}" (tema activo de tu ficha). Si aparece, será el riesgo a vigilar; de momento no afecta a tu nota.`;
    const lines = doc.splitTextToSize(clean(txt), CW - 20);
    const h = Math.max(20, lines.length * 9.6 + 10);
    ensure(h + 5);
    panel(M, y, CW, h, C.soft2 as unknown as RGB, 6);
    doc.setFillColor(...(tr.detectado ? C.red : C.amber)); doc.rect(M + 1, y + 1, 3, h - 2, "F");
    doc.setTextColor(...C.mut);
    doc.text(lines, M + 12, y + 13, { lineHeightFactor: 1.22 });
    y += h + 5;
  }

  // Nota automática: cambio de puesto en una semana "sin cambio significativo"
  if (yo.rank != null && yo.rank_prev != null && yo.rank !== yo.rank_prev && yo.sig?.sig === false) {
    sans(); doc.setFontSize(7.4); doc.setTextColor(...C.mut);
    const nt = doc.splitTextToSize(clean(`Nota: el cambio de puesto (#${yo.rank_prev} -> #${yo.rank}) convive con "sin cambio significativo" porque el umbral de significancia se aplica a la variación de la nota RIXc, no al puesto; en un grupo apretado, unas décimas bastan para cambiar de posición.`), CW);
    ensure(nt.length * 9.6 + 6);
    doc.text(nt, M, y + 4, { lineHeightFactor: 1.25 });
    y += nt.length * 9.6 + 8;
  }

  // Gráfico: cliente vs media del grupo
  const serie: Array<{ wk: string; rixc: number }> = grupo.selfSeries ?? [];
  const serieAvg: Array<{ wk: string; avg: number }> = grupo.avgSeries ?? [];
  if (serie.length >= 2) {
    const ch = 124; ensure(ch + 10);
    panel(M, y, CW, ch);
    mono(true); doc.setFontSize(6.6); doc.setTextColor(...C.mut2);
    doc.text(`${serie.length} SEMANAS - RIXc`, M + CW - 12, y + 13, { align: "right", charSpace: 0.8 });
    doc.setFillColor(...C.acc); doc.rect(M + 12, y + 8, 10, 3, "F");
    sans(); doc.setFontSize(6.8); doc.setTextColor(...C.mut);
    doc.text(clean(issuerName), M + 25, y + 12);
    doc.setFillColor(...C.mut2); doc.rect(M + 25 + doc.getTextWidth(clean(issuerName)) + 10, y + 8, 10, 3, "F");
    doc.text(clean(`media ${grupo.label}`), M + 25 + doc.getTextWidth(clean(issuerName)) + 23, y + 12);
    const PL = 34, PR = 14, PT = 22, PB = 20;
    const avgByWk = new Map(serieAvg.map((p) => [String(p.wk), Number(p.avg)]));
    const pts = [...serie].sort((a, b) => String(a.wk).localeCompare(String(b.wk)));
    const vals = pts.map((p) => Number(p.rixc));
    const avgVals = pts.map((p) => avgByWk.get(String(p.wk))).filter((v) => Number.isFinite(v)) as number[];
    let vMin = Math.min(...vals, ...(avgVals.length ? avgVals : vals));
    let vMax = Math.max(...vals, ...(avgVals.length ? avgVals : vals));
    const pad = Math.max(2, (vMax - vMin) * 0.15);
    vMin = Math.max(0, vMin - pad); vMax = Math.min(100, vMax + pad);
    if (vMax - vMin < 4) { vMax = Math.min(100, vMax + 2); vMin = Math.max(0, vMin - 2); }
    const x0 = M + PL, x1 = M + CW - PR, yTop = y + PT, yBot = y + ch - PB;
    const px = (i: number) => x0 + (i * (x1 - x0)) / (pts.length - 1);
    const py = (v: number) => yBot - ((v - vMin) / (vMax - vMin)) * (yBot - yTop);
    for (let i = 0; i <= 3; i++) {
      const v = vMin + ((vMax - vMin) * i) / 3, gy = py(v);
      doc.setDrawColor(...C.grid); doc.setLineWidth(0.7); doc.line(x0, gy, x1, gy);
      mono(); doc.setFontSize(6.6); doc.setTextColor(...C.mut2);
      doc.text(v.toFixed(0), x0 - 5, gy + 2.2, { align: "right" });
    }
    doc.setDrawColor(...C.mut2); doc.setLineWidth(1.2);
    let prevPt: [number, number] | null = null;
    pts.forEach((p, i) => {
      const av = avgByWk.get(String(p.wk));
      if (Number.isFinite(av)) {
        const cur: [number, number] = [px(i), py(Number(av))];
        if (prevPt) doc.line(prevPt[0], prevPt[1], cur[0], cur[1]);
        prevPt = cur;
      } else prevPt = null;
    });
    doc.setDrawColor(...C.acc); doc.setLineWidth(2);
    for (let i = 1; i < pts.length; i++) doc.line(px(i - 1), py(vals[i - 1]), px(i), py(vals[i]));
    doc.setFillColor(...C.acc);
    pts.forEach((_, i) => doc.circle(px(i), py(vals[i]), 2, "F"));
    // Última etiqueta = la MISMA media exacta de la ficha (fix 59.0 vs 59.2)
    sans("bold"); doc.setFontSize(8.6); doc.setTextColor(...C.acc);
    doc.text(fmt1(yo.rixc_x), x1, py(vals[vals.length - 1]) - 6, { align: "right" });
    const idxs = pts.length <= 7 ? pts.map((_, i) => i) : [0, Math.floor(pts.length / 3), Math.floor((2 * pts.length) / 3), pts.length - 1];
    mono(); doc.setFontSize(6.6); doc.setTextColor(...C.mut2);
    idxs.forEach((i) => doc.text(String(pts[i].wk).slice(5), px(i), y + ch - 8, { align: "center" }));
    y += ch + 8;
  }

  const oneLiner = (label: string, text: string, col: RGB) => {
    sans(); doc.setFontSize(8.6);
    const lines = doc.splitTextToSize(clean(text), CW - 118);
    const h = Math.max(24, lines.length * 11 + 12);
    ensure(h + 5); panel(M, y, CW, h, [255, 255, 255], 6);
    doc.setFillColor(...col); doc.rect(M + 1, y + 1, 3, h - 2, "F");
    sans("bold"); doc.setFontSize(7.4); doc.setTextColor(...col);
    doc.text(label, M + 12, y + 15);
    sans(); doc.setFontSize(8.6); doc.setTextColor(...C.ink);
    doc.text(lines, M + 100, y + 15, { lineHeightFactor: 1.25 });
    y += h + 5;
  };
  if (brief?.alerta) oneLiner("ALERTA", brief.alerta, C.red);
  if (brief?.oportunidad) oneLiner("OPORTUNIDAD", brief.oportunidad, C.green);

  // ====================== CÓMO LEER ESTE INFORME (v21) ======================
  ensure(400); // v22: la sección entera cabe en una página (no se parte)
  sectionTitle("Cómo leer este informe", "Cinco claves en medio minuto. La ficha metodológica completa está al final del anexo.");
  const comoLeer: Array<[string, string]> = [
    ["Qué es la nota.", "Cada domingo hacemos la misma pregunta a 6 IAs (ChatGPT, Perplexity, Gemini, DeepSeek, Grok y Qwen). Cada una recibe una nota de 0 a 100 que pondera 8 métricas (narrativa, evidencia, fuentes, actualidad, controversias, gobierno, coherencia y ejecución). El RIXc de portada es la media de las 6 notas, y su variación es la diferencia con la media de la semana anterior."],
    ["Qué es el rango.", "La distancia entre el modelo que mejor te puntúa y el que peor. Un rango alto significa que tu reputación depende de qué IA consulte quien pregunta: el relato no está consolidado."],
    ["Por qué un modelo puntúa aunque no tenga noticias frescas.", "Cada IA evalúa el poso informativo que tiene asimilado. Si no encuentra nada nuevo, sigue puntuando ese poso, y la falta de información fresca le penaliza la actualidad, la evidencia y las fuentes. Un modelo marcado como \"sin fuentes esta semana\" puntúa así."],
    ["La nota no premia la verdad.", "Un modelo puede inventarse noticias y aun así puntuarte alto: la nota mide cómo te percibe, no si acierta. Por eso existe la auditoría de veracidad (\"Lo que las IAs dicen mal de ti\"), que es una capa independiente: marca lo inventado y lo desactualizado, y la regla de oro impide por software que nada inventado entre en los hechos, la portada o las acciones de este informe. No altera ninguna nota."],
    ["Qué significa \"no contrastable\".", "La auditoría no encontró base suficiente para confirmar ni desmentir esa afirmación. No prueba nada en ningún sentido: ni que sea falsa ni que sea cierta."],
  ];
  for (const [lead, cuerpo] of comoLeer) {
    sans("bold"); doc.setFontSize(8.2);
    const leadW = doc.getTextWidth(clean(lead));
    sans(); doc.setFontSize(8);
    const lines = doc.splitTextToSize(clean(cuerpo), CW - 16);
    ensure(12 + lines.length * 10.2 + 6);
    doc.setFillColor(...C.acc); doc.circle(M + 4, y + 4.4, 1.8, "F");
    sans("bold"); doc.setFontSize(8.2); doc.setTextColor(...C.ink);
    doc.text(clean(lead), M + 12, y + 7);
    sans(); doc.setFontSize(8); doc.setTextColor(...C.mut);
    doc.text(lines, M + 12, y + 7 + 11, { lineHeightFactor: 1.26 });
    y += 12 + lines.length * 10.2 + 6;
    void leadW;
  }

  // ====================== POR QUÉ HA CAMBIADO ======================
  sectionTitle("Por qué ha cambiado", "Nota y variación de cada modelo, y una cita literal de LA RESPUESTA DE ESA IA que explica su lectura (verificada por software contra el texto original). Notas metodológicas: (a) un modelo sin menciones frescas en la ventana sigue puntuando — evalúa el poso informativo disponible, y la ausencia de información nueva penaliza la actualidad (RMM), la evidencia (DRM) y las fuentes (SIM); (b) el RIXc de portada es la media de las notas de los 6 modelos y su variación, la media de sus variaciones (la nota de cada modelo agrega sus 8 métricas con los pesos del anexo); (c) lo que dice cada modelo es el poso que tiene asimilado y puede incluir contexto heredado de semanas anteriores; (d) la nota mide percepción, no veracidad: un modelo marcado por la auditoría puede puntuar alto aunque invente — la etiqueta roja lo avisa.");
  for (const r of (modelRows ?? [])) {
    sans(); doc.setFontSize(7.3);
    const ql = r.cita ? doc.splitTextToSize(clean(`"${r.cita}"`), CW - 24) : [];
    const invTag = !!(r as any).cita_inv;
    // v21: etiqueta por modelo — inventó esta semana / no citó fuentes
    const nInvModel = Number((r as any).aud_inv ?? 0);
    const modelTag = nInvModel > 0
      ? { txt: `La auditoría le marca ${nInvModel === 1 ? "1 afirmación inventada" : `${nInvModel} afirmaciones inventadas`} esta semana (su nota no lo refleja: mide percepción, no veracidad).`, col: C.red }
      : (r as any).sin_fuentes
        ? { txt: "Sin fuentes citadas esta semana: puntúa sobre el poso informativo que tiene asimilado (ver \"Cómo leer este informe\").", col: C.mut2 }
        : null;
    const mh = 30 + (ql.length ? ql.length * 9.2 + 8 : 0) + (invTag ? 11 : 0) + (modelTag ? 11 : 0);
    ensure(mh + 5);
    panel(M, y, CW, mh, [255, 255, 255], 6);
    sans("bold"); doc.setFontSize(8.8); doc.setTextColor(...C.ink);
    doc.text(clean(showModel(r.model)), M + 12, y + 15);
    // Barra 0-100
    const barX = M + 110, barW = CW - 110 - 90;
    doc.setFillColor(...C.grid); doc.roundedRect(barX, y + 8, barW, 8, 4, 4, "F");
    const v = Math.min(100, Math.max(0, Number(r.rix) || 0));
    const bcol: RGB = v >= 60 ? C.acc : v >= 40 ? C.amber : C.red;
    doc.setFillColor(...bcol); doc.roundedRect(barX, y + 8, Math.max(4, barW * v / 100), 8, 4, 4, "F");
    mono(true); doc.setFontSize(9); doc.setTextColor(...C.ink);
    doc.text(fmt0(r.rix), M + CW - 48, y + 15, { align: "right" });
    mono(true); doc.setFontSize(8.4); doc.setTextColor(...deltaColor(r.delta));
    doc.text(fmtD0(r.delta), M + CW - 12, y + 15, { align: "right" });
    if (ql.length) {
      sans(); doc.setFontSize(7.3); doc.setTextColor(...C.mut);
      doc.text(ql, M + 12, y + 28, { lineHeightFactor: 1.26 });
    }
    if (invTag) {
      sans("bold"); doc.setFontSize(6.8); doc.setTextColor(...C.red);
      doc.text(clean("La auditoría marca esta afirmación como INVENTADA — ver \"Lo que las IAs dicen mal de ti\". Explica su nota, no describe la realidad."), M + 12, y + mh - (modelTag ? 18 : 7));
    }
    if (modelTag) {
      sans("bold"); doc.setFontSize(6.8); doc.setTextColor(...modelTag.col);
      doc.text(clean(modelTag.txt), M + 12, y + mh - 7);
    }
    y += mh + 5;
  }

  // Métricas que explican la semana (top 4) + notas de movimientos contraintuitivos
  // v22.2: si la portada (titular, alerta u oportunidad) cita una métrica por su
  // nombre canónico o su sigla, esa métrica entra en la tabla aunque no esté
  // entre las 4 de mayor movimiento — el lector debe poder encontrarla aquí.
  const portadaTxt = normTxt(`${brief?.titular ?? ""} ${brief?.alerta ?? ""} ${brief?.oportunidad ?? ""}`);
  const citadasEnPortada = new Set(
    METRICS.filter((m) => portadaTxt.includes(normTxt(m.name)) || new RegExp(`\\b${m.code.toLowerCase()}\\b`).test(portadaTxt)).map((m) => m.code),
  );
  const ordenadas = [...(metricRows ?? [])]
    .map((r: any) => ({ ...r, mag: Math.max(Math.abs(r.delta_sem ?? 0), Math.abs(r.dist_media ?? 0)) }))
    .sort((a: any, b: any) => b.mag - a.mag);
  const topMoves = ordenadas.slice(0, 4);
  let forzadas = 0;
  for (const r of ordenadas.slice(4)) {
    if (citadasEnPortada.has(r.code) && r.valor != null) { topMoves.push(r); forzadas++; }
  }
  sectionTitle("Las métricas que explican la semana", `Las ${topMoves.length - forzadas} con mayor movimiento (variación semanal o distancia a la media de ${clean(grupo.label)})${forzadas ? ` más ${forzadas === 1 ? "la métrica citada" : "las métricas citadas"} en la portada` : ""}. La tabla completa de las 8 métricas está en el anexo.`);
  autoTable(doc, {
    startY: y, margin: { left: M, right: M },
    head: [["Métrica", "Valor", "Variación vs semana anterior", "Distancia a media del grupo"]],
    body: topMoves.map((r: any) => [`${r.code} - ${r.name}`, fmt0(r.valor), fmtD0(r.delta_sem), r.dist_media == null ? "-" : fmtD(r.dist_media)]),
    styles: { font: "helvetica", fontSize: 7.8, cellPadding: 3.6, textColor: C.ink as unknown as number[], lineColor: C.border as unknown as number[], lineWidth: 0.4, halign: "right" },
    headStyles: { fillColor: C.head as unknown as number[], textColor: 255, fontSize: 7, fontStyle: "bold", halign: "right" },
    columnStyles: { 0: { halign: "left", cellWidth: 180, fontSize: 7.4 } },
    didParseCell: (d: any) => {
      if (d.section !== "body") return;
      const r = topMoves[d.row.index];
      if (d.column.index === 2) { d.cell.styles.textColor = deltaColor(r?.delta_sem) as unknown as number[]; d.cell.styles.fontStyle = "bold"; }
      if (d.column.index === 3) { d.cell.styles.textColor = deltaColor(r?.dist_media) as unknown as number[]; d.cell.styles.fontStyle = "bold"; }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 6;
  // v22.2: el "-" en distancia a la media se explica, no se deja mudo
  for (const r of topMoves.filter((x: any) => x.valor != null && x.dist_media == null && Number(x.n_con_dato ?? 2) < 2)) {
    sans(); doc.setFontSize(7.6);
    const lines = doc.splitTextToSize(clean(`${r.code}: sin distancia a la media del grupo — solo ${r.n_con_dato ?? 1} de ${grupo.n} empresas tiene esta métrica${r.code === "CXM" ? " (la ejecución corporativa solo aplica a cotizadas)" : ""}.`), CW - 16);
    ensure(lines.length * 9.8 + 6);
    doc.setFillColor(...C.mut2); doc.circle(M + 4, y + 3.2, 1.6, "F");
    doc.setTextColor(...C.mut);
    doc.text(lines, M + 12, y + 6, { lineHeightFactor: 1.24 });
    y += lines.length * 9.8 + 4;
  }
  for (const nm of (brief?.notas_metricas ?? []).slice(0, 3)) {
    sans(); doc.setFontSize(7.6);
    const lines = doc.splitTextToSize(clean(`${nm.code}: ${nm.nota}`), CW - 16);
    ensure(lines.length * 9.8 + 6);
    doc.setFillColor(...C.teal); doc.circle(M + 4, y + 3.2, 1.6, "F");
    doc.setTextColor(...C.mut);
    doc.text(lines, M + 12, y + 6, { lineHeightFactor: 1.24 });
    y += lines.length * 9.8 + 4;
  }
  y += 4;

  // Los 3 hechos que más pesan
  const nRetirados = Number((brief as any)?._retirados_auditoria ?? 0);
  const nAjustados = Number((brief as any)?._ajustados_verif ?? 0);
  sectionTitle((brief?.hechos ?? []).length >= 3 ? "Los 3 hechos que más pesan" : "Los hechos que más pesan", `Verde = positivo, rojo = riesgo. Cada hecho lleva su cita literal del raw, qué IAs lo recogen y, cuando el raw lo permite verificar, fuente y fecha. Sin fuente en el raw: pendiente de verificación. Cita no literal: posible error de la IA.${nRetirados > 0 ? ` Regla de oro aplicada: ${nRetirados} elemento${nRetirados === 1 ? "" : "s"} propuesto${nRetirados === 1 ? "" : "s"} por el análisis (hechos, portada, acciones o vigilancia) se retiraron de este informe por estar marcados como inventados en la auditoría de veracidad.` : ""}${nAjustados > 0 ? ` Además, ${nAjustados} elemento${nAjustados === 1 ? "" : "s"} que se apoyaba${nAjustados === 1 ? "" : "n"} en hechos pendientes de verificación se convirtieron en acciones de verificación o se etiquetaron como señal pendiente.` : ""}`);
  for (const h of (brief?.hechos ?? []).slice(0, 3)) {
    sans(); doc.setFontSize(8.4);
    const hl = doc.splitTextToSize(clean(h.hecho), CW - 24);
    doc.setFontSize(7.6);
    const ql = h.cita ? doc.splitTextToSize(clean(`"${h.cita}"`), CW - 24) : [];
    const ih = 14 + hl.length * 11 + (ql.length ? ql.length * 9.6 + 4 : 0) + 16;
    ensure(ih + 6); panel(M, y, CW, ih, [255, 255, 255], 6);
    const scol: RGB = h.sentido === "riesgo" ? C.red : C.green;
    doc.setFillColor(...scol); doc.rect(M + 1, y + 1, 3, ih - 2, "F");
    sans("bold"); doc.setFontSize(8.4); doc.setTextColor(...C.ink);
    doc.text(hl, M + 12, y + 14, { lineHeightFactor: 1.26 });
    let hy = y + 14 + hl.length * 11;
    if (ql.length) {
      sans(); doc.setFontSize(7.6); doc.setTextColor(...C.mut);
      doc.text(ql, M + 12, hy + 2, { lineHeightFactor: 1.24 });
      hy += ql.length * 9.6 + 4;
    }
    mono(); doc.setFontSize(6.6); doc.setTextColor(...C.mut2);
    doc.text(clean(`IAs: ${showModels(h.modelos ?? [])}`), M + 12, hy + 9);
    const vcol: RGB = h.estado === "verificado" ? C.green : h.estado === "sin_verificar" ? C.amber : C.red;
    const tag = h.estado === "verificado"
      ? `${h.fuente ?? ""}${h.fecha ? ` - ${h.fecha}` : ""}`
      : h.estado === "sin_verificar" ? "Sin fuente en el raw - pendiente de verificación" : "Posible error de la IA (cita no literal)";
    sans("bold"); doc.setFontSize(6.8); doc.setTextColor(...vcol);
    doc.text(clean(tag).slice(0, 88), M + CW - 12, hy + 9, { align: "right" });
    y += ih + 6;
  }

  // ====================== LO QUE LAS IAS DICEN MAL DE TI (v18) ======================
  // Capa de AUDITORÍA independiente de la medición: solo se pinta si rix-verify
  // corrió para este ticker y semana; si no hay datos, la sección se omite entera.
  if (verif && (verif.claims?.length || verif.ficha?.length)) {
    const VCOL: Record<string, RGB> = { confirmada: C.green, sin_fuente: C.amber, desactualizada: C.amber, inventada: C.red, no_contrastable: C.mut2 };
    // v22: la etiqueta de cada inventada sale de la evidencia de SU fila:
    // URL rota real / la propia IA la marcó como simulada / extracto oficial
    // que la desmiente (y se nombra la fuente).
    const hostDe = (u: unknown): string | null => { try { return new URL(String(u)).hostname.replace(/^www\./, ""); } catch (_e) { return null; } };
    const invKind = (r: any): string => r.verdict !== "inventada" ? "" : r.url_estado === "simulada" ? "simulada" : r.evidencia_extracto ? "desmentida" : "rota";
    const vLabel = (r: any): string => {
      if (r.verdict === "inventada") {
        const k = invKind(r);
        if (k === "simulada") return "Inventada (la propia IA etiqueta su fuente como simulada)";
        if (k === "desmentida") return `Inventada (la desmiente ${hostDe(r.evidencia_url) ?? "la fuente oficial"})`;
        return "Inventada (la URL citada no existe)";
      }
      return ({ confirmada: "Confirmada", sin_fuente: "Sin fuente", desactualizada: "Desactualizada", no_contrastable: "No contrastable" } as Record<string, string>)[r.verdict] ?? r.verdict;
    };
    // v21: "o todas o ninguna" — si falta la acción, una por defecto determinista según el veredicto
    const accionDef = (r: any): string => {
      if (r.accion) return String(r.accion);
      if (r.verdict === "inventada") return invKind(r) === "desmentida"
        ? "Asegurar que el dato correcto está visible y enlazable en la web corporativa y la sala de prensa (las IAs las indexan)."
        : "Publicar o reforzar la versión oficial de este tema en la web o la sala de prensa: las IAs fabrican referencias cuando no encuentran la fuente real.";
      if (r.verdict === "desactualizada") return "Actualizar el dato en la web corporativa y la FAQ: la IA arrastra una versión antigua.";
      if (r.verdict === "sin_fuente") return "Documentar el dato en una fuente oficial enlazable para que las próximas respuestas puedan citarla.";
      return "-";
    };
    // v22: lo que cuenta como "sobre ti" es sujeto=empresa; lo del entorno
    // (competidores, regulador, sector) se audita igual pero se cuenta aparte
    const esEntorno = (r: any) => r.sujeto === "entorno";
    const nBy: Record<string, number> = {};
    for (const r of verif.claims) nBy[r.verdict] = (nBy[r.verdict] ?? 0) + 1;
    const invEmp = (verif.claims ?? []).filter((r: any) => r.verdict === "inventada" && !esEntorno(r));
    const invEnt = (verif.claims ?? []).filter((r: any) => r.verdict === "inventada" && esEntorno(r));
    const kinds = { rota: invEmp.filter((r: any) => invKind(r) === "rota").length, desmentida: invEmp.filter((r: any) => invKind(r) === "desmentida").length, simulada: invEmp.filter((r: any) => invKind(r) === "simulada").length };
    const pl = (n: number, sing: string, plu: string) => `${n} ${n === 1 ? sing : plu}`;
    // v21: el recuento solo nombra lo que existe (nada de "0 sin fuente" en los tres informes)
    const partes: string[] = [];
    partes.push(pl(nBy["confirmada"] ?? 0, "confirmada", "confirmadas"));
    if (invEmp.length) {
      const sub: string[] = [];
      if (kinds.rota) sub.push(`${kinds.rota} con URL que no existe`);
      if (kinds.desmentida) sub.push(`${kinds.desmentida} desmentida${kinds.desmentida === 1 ? "" : "s"} por fuente oficial`);
      if (kinds.simulada) sub.push(`${kinds.simulada} con fuente que la propia IA marca como simulada`);
      partes.push(`${pl(invEmp.length, "inventada sobre la propia empresa", "inventadas sobre la propia empresa")}${sub.length ? ` (${sub.join(", ")})` : ""}`);
    }
    if (invEnt.length) partes.push(`${pl(invEnt.length, "inventada sobre su entorno", "inventadas sobre su entorno")} (competidores, regulador o sector; no cuentan como errores sobre ti)`);
    if (nBy["desactualizada"]) partes.push(pl(nBy["desactualizada"], "desactualizada", "desactualizadas"));
    if (nBy["sin_fuente"]) partes.push(`${nBy["sin_fuente"]} sin fuente`);
    if (nBy["no_contrastable"]) partes.push(`${pl(nBy["no_contrastable"], "no contrastable", "no contrastables")} (sin base suficiente para pronunciarse: no prueba nada en ningún sentido)`);
    sectionTitle("Lo que las IAs dicen mal de ti",
      `Auditoría de veracidad, capa independiente de la medición: las afirmaciones concretas que los 6 modelos hicieron esta semana se contrastan contra fuentes oficiales declaradas (web corporativa y resultados publicados) y se comprueba por software que cada URL citada abre. La nota RIX dice cuánto gustas a las IAs; esta sección dice cuánto de lo que dicen es verdad. Esta semana: ${pl(verif.claims.length, "afirmación auditada", "afirmaciones auditadas")} — ${partes.join(", ")}. "Inventada" exige evidencia, y cada fila indica la suya: la URL citada no existe, una fuente oficial la desmiente (se nombra), o la propia IA etiquetó su fuente como simulada.`);
    const GORD: Record<string, number> = { alta: 0, media: 1, baja: 2 };
    const VORD: Record<string, number> = { inventada: 0, desactualizada: 1, sin_fuente: 2 };
    // v21: orden por gravedad primero (lo más grave arriba), luego por veredicto
    // (v22: lo del entorno, al final de su nivel de gravedad)
    const bad = (verif.claims ?? [])
      .filter((r: any) => ["inventada", "desactualizada", "sin_fuente"].includes(r.verdict))
      .sort((a: any, b: any) => ((GORD[a.gravedad] ?? 1) - (GORD[b.gravedad] ?? 1)) || ((esEntorno(a) ? 1 : 0) - (esEntorno(b) ? 1 : 0)) || ((VORD[a.verdict] ?? 9) - (VORD[b.verdict] ?? 9)));
    if (bad.length) {
      autoTable(doc, {
        startY: y, margin: { left: M, right: M },
        head: [["Afirmación de la IA", "IA", "Veredicto", "Gravedad", "Qué hacer"]],
        body: bad.map((r: any) => [clean(`${esEntorno(r) ? "[Sobre su entorno] " : ""}${cutWord(r.claim, 180)}`), clean(showModel(r.model)), vLabel(r), r.gravedad, clean(cutWord(accionDef(r), 220))]),
        styles: { font: "helvetica", fontSize: 7.1, cellPadding: 3.4, textColor: C.ink as unknown as number[], lineColor: C.border as unknown as number[], lineWidth: 0.4, valign: "top", halign: "left" },
        headStyles: { fillColor: C.head as unknown as number[], textColor: 255, fontSize: 6.8, fontStyle: "bold", halign: "left" },
        columnStyles: { 0: { cellWidth: 190 }, 1: { cellWidth: 44 }, 2: { cellWidth: 58 }, 3: { cellWidth: 40 }, 4: { cellWidth: "auto" } },
        didParseCell: (d: any) => {
          if (d.section !== "body") return;
          const row = bad[d.row.index];
          if (d.column.index === 2) { d.cell.styles.textColor = (VCOL[row?.verdict] ?? C.mut2) as unknown as number[]; d.cell.styles.fontStyle = "bold"; }
          if (d.column.index === 3 && row?.gravedad === "alta") { d.cell.styles.textColor = C.red as unknown as number[]; d.cell.styles.fontStyle = "bold"; }
        },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    } else {
      sans("bold"); doc.setFontSize(8.4); doc.setTextColor(...C.green);
      ensure(16);
      doc.text(clean("Esta semana ninguna afirmación auditada resultó inventada, desactualizada o sin fuente."), M, y + 8);
      y += 18;
    }
    // ---- v21: lo que las IAs dicen BIEN (la parte positiva de la auditoría) ----
    const confirmadas = (verif.claims ?? []).filter((r: any) => r.verdict === "confirmada");
    if (confirmadas.length) {
      smallHeader("Y LO QUE DICEN BIEN: AFIRMACIONES CONFIRMADAS CONTRA FUENTE OFICIAL");
      autoTable(doc, {
        startY: y, margin: { left: M, right: M },
        head: [["Afirmación de la IA", "IA", "Confirmada por"]],
        body: confirmadas.map((r: any) => [clean(cutWord(r.claim, 200)), clean(showModel(r.model)), clean(cutWord(String(r.evidencia_url ?? "fuente oficial declarada"), 90))]),
        styles: { font: "helvetica", fontSize: 7.1, cellPadding: 3.2, textColor: C.ink as unknown as number[], lineColor: C.border as unknown as number[], lineWidth: 0.4, valign: "top", halign: "left" },
        headStyles: { fillColor: C.green as unknown as number[], textColor: 255, fontSize: 6.8, fontStyle: "bold", halign: "left" },
        columnStyles: { 0: { cellWidth: 260 }, 1: { cellWidth: 52 }, 2: { cellWidth: "auto", font: "courier", fontSize: 6.3 } },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }
    // ---- Semáforo de ficha básica (comparación determinista contra la ficha oficial) ----
    // v21: se omite automáticamente cuando está casi vacío (<1/3 de celdas con dato):
    // un semáforo con 1-5 celdas de 30 confunde más de lo que informa.
    const fichaConDato = (verif.ficha ?? []).filter((r: any) => r.verdict && r.verdict !== "no_mencionada").length;
    const fichaCeldas = 5 * 6; // 5 datos de ficha x 6 modelos
    if (Array.isArray(verif.ficha) && verif.ficha.length && fichaConDato >= fichaCeldas / 3) {
      smallHeader("SEMÁFORO DE FICHA BÁSICA · ¿ACIERTAN LAS IAS TUS DATOS ESENCIALES?");
      const FLAB: Record<string, string> = { "ficha:ceo": "CEO", "ficha:presidente": "Presidente", "ficha:accionista": "Accionista de referencia", "ficha:ingresos": "Ingresos último ejercicio", "ficha:ultimo_resultado": "Último resultado publicado" };
      const FORDER = ["ficha:ceo", "ficha:presidente", "ficha:accionista", "ficha:ingresos", "ficha:ultimo_resultado"];
      const MORDER = ["ChatGPT", "Perplexity", "Google Gemini", "Deepseek", "Grok", "Qwen"];
      const models = MORDER.filter((m) => verif.ficha.some((r: any) => r.model === m));
      const cell = (campo: string, model: string): string => {
        const r = verif.ficha.find((x: any) => x.claim_type === campo && x.model === model);
        if (!r || r.verdict === "no_mencionada") return "-";
        return r.verdict === "confirmada" ? "Sí" : r.verdict === "desactualizada" ? "NO" : "-";
      };
      autoTable(doc, {
        startY: y, margin: { left: M, right: M },
        head: [["Dato de la ficha oficial", ...models.map((m) => showModel(m))]],
        body: FORDER.filter((f) => verif.ficha.some((r: any) => r.claim_type === f)).map((f) => [FLAB[f] ?? f, ...models.map((m) => cell(f, m))]),
        styles: { font: "helvetica", fontSize: 7.3, cellPadding: 3.2, textColor: C.ink as unknown as number[], lineColor: C.border as unknown as number[], lineWidth: 0.4, halign: "center" },
        headStyles: { fillColor: C.head as unknown as number[], textColor: 255, fontSize: 6.8, fontStyle: "bold", halign: "center" },
        columnStyles: { 0: { halign: "left", cellWidth: 150 } },
        didParseCell: (d: any) => {
          if (d.section !== "body" || d.column.index === 0) return;
          const v = String(d.cell.raw ?? "-");
          d.cell.styles.fontStyle = "bold";
          d.cell.styles.textColor = (v === "Sí" ? C.green : v === "NO" ? C.red : C.mut2) as unknown as number[];
        },
      });
      y = (doc as any).lastAutoTable.finalY + 4;
      sans(); doc.setFontSize(6.8); doc.setTextColor(...C.mut2);
      const sl = doc.splitTextToSize(clean("Sí = coincide con la ficha oficial · NO = contradice el dato oficial (el dato correcto consta en la auditoría) · \"-\" = ese modelo no lo menciona esta semana (los raws semanales hablan de la actualidad y no siempre de la ficha). Comparación determinista por software contra la ficha verificada del emisor, sin intervención del agente."), CW);
      ensure(sl.length * 8.6 + 6);
      doc.text(sl, M, y + 6, { lineHeightFactor: 1.2 });
      y += sl.length * 8.6 + 8;
    } else if (Array.isArray(verif.ficha) && verif.ficha.length) {
      sans(); doc.setFontSize(6.8); doc.setTextColor(...C.mut2);
      const om = doc.splitTextToSize(clean(`Nota: el semáforo de ficha básica (¿aciertan las IAs tu CEO, presidente, accionista e ingresos?) se omite esta semana: solo ${fichaConDato} de ${fichaCeldas} celdas tienen dato, porque los raws semanales hablan de la actualidad y no siempre de la ficha. Volverá cuando haya señal suficiente.`), CW);
      ensure(om.length * 8.6 + 6);
      doc.text(om, M, y + 4, { lineHeightFactor: 1.2 });
      y += om.length * 8.6 + 8;
    }
  }

  // ====================== FRENTE A COMPETIDORES ======================
  // v22: un puesto previo compartido se marca "(empate)" — dos #1 sin aviso descolocan
  const prevTies = new Map<number, number>();
  for (const r of (grupo.ranking ?? [])) if (r.rank_prev != null) prevTies.set(Number(r.rank_prev), (prevTies.get(Number(r.rank_prev)) ?? 0) + 1);
  const showPrev = (rp: any): string => rp == null ? "-" : `#${rp}${(prevTies.get(Number(rp)) ?? 0) > 1 ? " (empate)" : ""}`;
  sectionTitle("Frente a competidores", `${clean(grupo.label)} (${grupo.n} empresas) - único grupo de comparación de todo el informe. Puesto sobre medias exactas; un empate exacto comparte puesto (se marca "empate").`);
  autoTable(doc, {
    startY: y, margin: { left: M, right: M },
    head: [["#", "Empresa", "RIXc", "Variación", "Puesto sem. anterior", ...METRICS.map((m) => m.code)]],
    body: (grupo.ranking ?? []).map((r: any) => [`#${r.rank}`, clean(r.name), fmt1(r.rixc_x ?? r.rixc), fmtD(r.delta), showPrev(r.rank_prev), ...METRICS.map((m) => fmt0(r[m.key]))]),
    styles: { font: "helvetica", fontSize: 7.3, cellPadding: 3.2, textColor: C.ink as unknown as number[], lineColor: C.border as unknown as number[], lineWidth: 0.4, halign: "right" },
    headStyles: { fillColor: C.head as unknown as number[], textColor: 255, fontSize: 6.8, fontStyle: "bold", halign: "right" },
    columnStyles: { 0: { halign: "center", textColor: C.acc as unknown as number[], fontStyle: "bold", cellWidth: 24 }, 1: { halign: "left", cellWidth: 100 }, 4: { cellWidth: 50 } },
    didParseCell: (d: any) => { if (d.section === "body" && (grupo.ranking ?? [])[d.row.index]?.tk === ticker) { d.cell.styles.fillColor = C.accSoft as unknown as number[]; d.cell.styles.fontStyle = "bold"; } },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  smallHeader("QUÉ HAY DETRÁS DEL MOVIMIENTO DE CADA COMPETIDOR");
  // El movimiento (de #X a #Y) lo imprime el CÓDIGO; el agente solo aporta la causa.
  const causaByTk = new Map<string, string>((brief?.competidores ?? []).map((c2: any) => [c2.tk, c2.linea]));
  for (const r of (grupo.ranking ?? [])) {
    if (r.tk === ticker) continue;
    const mov = r.rank_prev == null ? `#${r.rank}, sin dato de la semana anterior` :
      r.rank < r.rank_prev ? `sube del ${showPrev(r.rank_prev)} al #${r.rank}, ${fmtD(r.delta)}` :
      r.rank > r.rank_prev ? `baja del ${showPrev(r.rank_prev)} al #${r.rank}, ${fmtD(r.delta)}` : `se mantiene #${r.rank}, ${fmtD(r.delta)}`;
    const causa = causaByTk.get(r.tk) ?? "sin señales destacadas en su raw esta semana";
    sans(); doc.setFontSize(8.2);
    const lines = doc.splitTextToSize(clean(`${r.name} (${mov}): ${causa}`), CW - 16);
    ensure(lines.length * 10.8 + 6);
    doc.setFillColor(...C.mut2); doc.circle(M + 4, y + 3.4, 1.6, "F");
    doc.setTextColor(...C.ink);
    doc.text(lines, M + 12, y + 6, { lineHeightFactor: 1.26 });
    y += lines.length * 10.8 + 5;
  }

  // ====================== QUÉ HACER ======================
  sectionTitle("Qué hacer", "Máximo tres acciones: qué, quién, plazo y qué métrica debería mover. La semana que viene este briefing comprobará si esa métrica se movió. La regla de oro se aplica por software antes de imprimir: las acciones apoyadas en material inventado se retiran, y una acción apoyada en un hecho aún pendiente de verificación se convierte en una acción de verificación (primero comprobar, luego actuar).");
  (actions ?? []).forEach((a: any, i: number) => {
    sans("bold"); doc.setFontSize(9);
    const al = doc.splitTextToSize(clean(a.accion), CW - 56);
    const ih = 16 + al.length * 11.6 + 16;
    ensure(ih + 6);
    panel(M, y, CW, ih, [255, 255, 255], 8);
    doc.setFillColor(...C.head);
    doc.roundedRect(M + 10, y + 9, 22, 22, 6, 6, "F");
    mono(true); doc.setFontSize(11); doc.setTextColor(255, 255, 255);
    doc.text(String(i + 1), M + 21, y + 24, { align: "center" });
    sans("bold"); doc.setFontSize(9); doc.setTextColor(...C.ink);
    doc.text(al, M + 42, y + 17, { lineHeightFactor: 1.3 });
    sans(); doc.setFontSize(6.9); doc.setTextColor(...C.mut);
    doc.text(clean(`Quién: ${a.rol ?? "-"}   ·   Plazo: ${a.plazo ?? "-"}   ·   Métrica objetivo: ${showMet(a.metrica)} (hoy ${a.valor_hoy ?? "-"})`), M + 42, y + 17 + al.length * 11.6 + 8);
    y += ih + 6;
  });

  sectionTitle("Acciones de semanas anteriores", prevActions?.length ? "Estado (manual, desde el panel) y si se nota en los datos: valor de la métrica objetivo cuando se emitió la recomendación frente a hoy." : "Primera edición de este briefing: sin acciones previas que evaluar.");
  if (prevActions?.length) {
    autoTable(doc, {
      startY: y, margin: { left: M, right: M },
      head: [["Acción", "Emitida", "Estado", "Métrica", "Al emitir", "Hoy", "Variación", "¿Se nota?"]],
      body: prevActions.map((a: any) => [clean(a.accion), String(a.week_start).slice(5), a.estado === "hecha" ? "Hecha" : a.estado === "en_curso" ? "En curso" : a.estado === "retirada" ? "Retirada (se apoyaba en material inventado)" : "Sin empezar", showMet(a.metrica), a.estado === "retirada" || a.valor_al_emitir == null ? "-" : (String(a.metrica).toUpperCase() === "RIXC" ? fmt1(a.valor_al_emitir) : fmt0(a.valor_al_emitir)), a.estado === "retirada" || a.valor_actual == null ? "-" : (String(a.metrica).toUpperCase() === "RIXC" ? fmt1(a.valor_actual) : fmt0(a.valor_actual)), a.estado === "retirada" || a.delta == null ? "-" : fmtD(a.delta), a.estado === "retirada" ? "-" : a.estado !== "hecha" && a.estado !== "en_curso" ? "No aplica" : a.delta == null ? "-" : (Math.abs(a.delta) >= 2 ? (a.delta > 0 ? "Sí, a mejor" : "Sí, a peor") : "Aún no")]),
      styles: { font: "helvetica", fontSize: 7.2, cellPadding: 3, textColor: C.ink as unknown as number[], lineColor: C.border as unknown as number[], lineWidth: 0.4 },
      headStyles: { fillColor: C.head as unknown as number[], textColor: 255, fontSize: 6.9, fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: 170, fontSize: 6.9 }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right", fontStyle: "bold" } },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  if (Array.isArray(brief?.vigilar) && brief.vigilar.length) {
    smallHeader("QUÉ VIGILAR LA PRÓXIMA SEMANA");
    for (const v of brief.vigilar.slice(0, 3)) {
      sans(); doc.setFontSize(8.2); doc.setTextColor(...C.ink);
      const lines = doc.splitTextToSize(clean(v), CW - 16);
      ensure(lines.length * 10.8 + 6);
      doc.setFillColor(...C.amber); doc.circle(M + 4, y + 3.4, 1.6, "F");
      doc.text(lines, M + 12, y + 6, { lineHeightFactor: 1.26 });
      y += lines.length * 10.8 + 5;
    }
  }

  // ====================== ANEXO ======================
  newPage();
  sectionTitle("Anexo · Las 8 métricas completas", `Variación semanal y distancia a la media de ${clean(grupo.label)} (${grupo.n} empresas), dos lecturas separadas.`);
  autoTable(doc, {
    startY: y, margin: { left: M, right: M },
    head: [["Métrica", "Peso", "Valor", "Variación vs semana anterior", "Distancia a media del grupo"]],
    body: (metricRows ?? []).map((r: any) => [`${r.code} - ${r.name}`, String(r.peso), fmt0(r.valor), fmtD0(r.delta_sem), r.dist_media == null ? "-" : fmtD(r.dist_media)]),
    styles: { font: "helvetica", fontSize: 7.4, cellPadding: 3.2, textColor: C.ink as unknown as number[], lineColor: C.border as unknown as number[], lineWidth: 0.4, halign: "right" },
    headStyles: { fillColor: C.head as unknown as number[], textColor: 255, fontSize: 6.9, fontStyle: "bold", halign: "right" },
    columnStyles: { 0: { halign: "left", cellWidth: 168, fontSize: 7.1 } },
    didParseCell: (d: any) => {
      if (d.section !== "body") return;
      const r = (metricRows ?? [])[d.row.index];
      if (d.column.index === 3) { d.cell.styles.textColor = deltaColor(r?.delta_sem) as unknown as number[]; d.cell.styles.fontStyle = "bold"; }
      if (d.column.index === 4) { d.cell.styles.textColor = deltaColor(r?.dist_media) as unknown as number[]; d.cell.styles.fontStyle = "bold"; }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 6;
  // v22.2: el "-" en distancia a la media se explica también en el anexo
  for (const r of (metricRows ?? []).filter((x: any) => x.valor != null && x.dist_media == null && Number(x.n_con_dato ?? 2) < 2)) {
    sans(); doc.setFontSize(7);
    const lines = doc.splitTextToSize(clean(`${r.code}: sin distancia a la media del grupo — solo ${r.n_con_dato ?? 1} de ${grupo.n} empresas tiene esta métrica${r.code === "CXM" ? " (la ejecución corporativa solo aplica a cotizadas)" : ""}.`), CW);
    ensure(lines.length * 9 + 4);
    doc.setTextColor(...C.mut2);
    doc.text(lines, M, y + 4, { lineHeightFactor: 1.22 });
    y += lines.length * 9 + 4;
  }
  y += 4;

  sectionTitle("Anexo · Fuentes citadas", `${citations.totalCitas} citas a ${citations.totalFuentes} noticias concretas, en ${citations.rows.length} dominios (subdominios agrupados: fotos.europapress.es cuenta como europapress.es; se respetan cabeceras propias como cincodias.elpais.com).${(citations.nSecciones ?? 0) > 0 ? ` Además hay ${citations.nSecciones} enlaces a portadas o secciones de medios, que NO cuentan como fuentes ni en esta tabla: se listan al final del anexo de URLs con la etiqueta SECCIÓN.` : ""} Nota sobre SIM: la métrica de autoridad de fuentes NO se calcula desde esta tabla — es la media de cómo puntúa cada uno de los 6 modelos las fuentes de SU propia respuesta, y un modelo sin fuentes puntúa muy bajo y arrastra la media aunque otros citen T1/T2.`);
  autoTable(doc, {
    startY: y, margin: { left: M, right: M },
    head: [["Canal", "Tier", "Fuentes únicas", "Citas totales", "IAs que lo citan"]],
    body: citations.rows.map((r: any) => [r.dom, TIER_LABEL[r.tier], String(r.fuentes), String(r.citas), clean(showModels(r.models))]),
    styles: { font: "helvetica", fontSize: 7.3, cellPadding: 3, textColor: C.ink as unknown as number[], lineColor: C.border as unknown as number[], lineWidth: 0.4 },
    headStyles: { fillColor: C.head as unknown as number[], textColor: 255, fontSize: 6.9, fontStyle: "bold" },
    columnStyles: { 0: { font: "courier", fontStyle: "bold", fontSize: 6.9, cellWidth: 140 }, 1: { cellWidth: 104 }, 2: { halign: "right", cellWidth: 48 }, 3: { halign: "right", cellWidth: 44 } },
    didParseCell: (d: any) => { if (d.section === "body" && d.column.index === 1) { d.cell.styles.textColor = TIER_COLOR[citations.rows[d.row.index]?.tier ?? 5] as unknown as number[]; d.cell.styles.fontStyle = "bold"; } },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // URL citadas, una a una, comprobadas automáticamente al generar el informe
  if (Array.isArray(citations.items) && citations.items.length) {
    const noticias = citations.items.filter((u: any) => !u.seccion);
    const secciones = citations.items.filter((u: any) => u.seccion);
    const nOk = noticias.filter((u: any) => u.estado === "ok").length;
    const nRota = noticias.filter((u: any) => u.estado === "rota").length;
    const nNc = noticias.length - nOk - nRota;
    smallHeader("URL CITADAS, TAL CUAL LAS DEVOLVIÓ CADA IA (COMPROBADAS AL GENERAR ESTE INFORME)");
    sans(); doc.setFontSize(7); doc.setTextColor(...C.mut);
    const wl = doc.splitTextToSize(clean(`De las ${citations.items.length} URL citadas, ${noticias.length} apuntan a noticias concretas: ${nOk} abren (ABRE), ${nRota} no existen (ROTA: la IA construyó una URL verosímil en el dominio correcto que no corresponde a ninguna noticia — típico de los modelos de lenguaje y una señal de evidencia débil que penaliza DRM) y ${nNc} no son comprobables automáticamente (bloqueo anti-robots, muro de pago o timeout: no prueba nada en ningún sentido).${secciones.length ? ` Las otras ${secciones.length} son portadas o secciones de un medio (SECCIÓN): el dominio es real y puede abrir, pero no es una noticia concreta — la IA cita el canal, no una pieza.` : ""} Se imprimen sin editar.`), CW);
    ensure(wl.length * 9 + 6);
    doc.text(wl, M, y + 4, { lineHeightFactor: 1.24 });
    y += wl.length * 9 + 8;
    mono(); doc.setFontSize(6.2);
    for (const u of citations.items) {
      const tagU = u.seccion ? (u.estado === "rota" ? "SECCIÓN (no abre)" : "SECCIÓN") : u.estado === "ok" ? "ABRE" : u.estado === "rota" ? "ROTA" : "N/C ";
      const colU: RGB = u.seccion ? C.teal : u.estado === "ok" ? C.green : u.estado === "rota" ? C.red : C.mut2;
      const lines = doc.splitTextToSize(clean(`[${tagU}] ${u.url}  <-  ${showModels(u.models ?? [])}`), CW);
      ensure(lines.length * 8 + 3);
      doc.setTextColor(...colU);
      doc.text(lines, M, y + 4, { lineHeightFactor: 1.2 });
      y += lines.length * 8 + 3;
    }
    y += 8;
  }

  if (consensus) {
    const consVal = Math.max(0, Math.min(100, Math.round(consensus.consenso ?? 0)));
    const core: any[] = (consensus.core ?? []).slice(0, 16);
    sectionTitle("Anexo · Consenso temático", `Coincidencia temática entre las 6 IAs: ${consVal}/100. Se muestran los ${core.length} temas núcleo de ${consensus.distinct_themes ?? "-"} detectados (el resto son menciones aisladas sin coincidencia suficiente entre modelos). Cobertura X/6 = el tema aparece en la respuesta de X modelos, aunque sea como contexto heredado y no como mención fresca; las etiquetas temáticas las asigna automáticamente el pipeline de consenso.`);
    let cx2 = M;
    sans(); doc.setFontSize(7.6);
    for (const c2 of core) {
      const t = clean(`${c2.theme}  ${c2.coverage}/${consensus.models_count ?? 6}`);
      const w2 = doc.getTextWidth(t) + 14;
      if (cx2 + w2 > M + CW) { cx2 = M; y += 17; ensure(19); }
      doc.setFillColor(239, 246, 255); doc.setDrawColor(191, 219, 254); doc.setLineWidth(0.7);
      doc.roundedRect(cx2, y - 3, w2, 14, 7, 7, "FD");
      doc.setTextColor(...C.ink); doc.text(t, cx2 + 7, y + 6.4);
      cx2 += w2 + 6;
    }
    y += 24;
  }

  // Respuestas íntegras de las 6 IAs + pregunta del protocolo
  sectionTitle("Anexo · La pregunta y las respuestas íntegras de las 6 IAs", "La base documental del briefing: la misma pregunta, formulada el mismo domingo a los 6 modelos, y lo que cada uno respondió (texto íntegro, recortado a 3.500 caracteres por modelo cuando excede).");
  if (protocolQuestion) {
    smallHeader("LA PREGUNTA (PROTOCOLO DETERMINISTA, IDÉNTICA PARA LOS 6 MODELOS)");
    sans(); doc.setFontSize(7.2); doc.setTextColor(...C.mut);
    const pq = doc.splitTextToSize(clean(protocolQuestion), CW);
    ensure(Math.min(pq.length, 10) * 9.4 + 8);
    doc.text(pq.slice(0, 10), M, y + 4, { lineHeightFactor: 1.3 });
    y += Math.min(pq.length, 10) * 9.4 + 10;
  }
  for (const r of (modelRows ?? [])) {
    smallHeader(`${showModel(r.model).toUpperCase()} - NOTA ${fmt0(r.rix)}`);
    sans(); doc.setFontSize(6.9); doc.setTextColor(...C.mut);
    const raw = cutWord(String(r.respuesta_full ?? ""), 3500);
    const lines = doc.splitTextToSize(clean(raw || "(sin respuesta registrada)"), CW);
    for (let i = 0; i < lines.length; i += 40) {
      const chunk = lines.slice(i, i + 40);
      ensure(chunk.length * 8.6 + 6);
      doc.text(chunk, M, y + 4, { lineHeightFactor: 1.24 });
      y += chunk.length * 8.6 + 4;
    }
    y += 6;
  }

  sectionTitle("Anexo · Glosario de métricas");
  autoTable(doc, {
    startY: y, margin: { left: M, right: M },
    head: [["Código", "Métrica", "Peso", "Qué mide"]],
    body: [
      ["RIXc", "Índice compuesto", "-", "Media de las notas de los 6 modelos (la nota de cada modelo agrega sus 8 métricas con los pesos)"],
      ...METRICS.map((m) => [m.code, m.name, String(m.peso), ({
        NVM: "Coherencia del discurso, controversia y afirmaciones verificables",
        DRM: "Fuentes primarias, corroboración y trazabilidad documental",
        SIM: "Jerarquía de las fuentes que cita cada modelo en SU respuesta (media de los 6)",
        RMM: "Frescura temporal de las menciones en la ventana",
        CEM: "Baja exposición a riesgos (100 = sin controversias)",
        GAM: "Independencia y buenas prácticas de gobernanza",
        DCM: "Consistencia del CONTENIDO entre los 6 modelos (no de sus notas: puede subir aunque las notas diverjan)",
        CXM: "Ejecución en el mercado y cotización (solo cotizadas)",
      } as Record<string, string>)[m.code]]),
    ],
    styles: { font: "helvetica", fontSize: 7.2, cellPadding: 2.8, textColor: C.ink as unknown as number[], lineColor: C.border as unknown as number[], lineWidth: 0.4 },
    headStyles: { fillColor: C.head as unknown as number[], textColor: 255, fontSize: 7, fontStyle: "bold" },
    columnStyles: { 0: { font: "courier", fontStyle: "bold", cellWidth: 44 }, 1: { cellWidth: 128 }, 2: { halign: "right", cellWidth: 32 } },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  sectionTitle("Anexo · Ficha metodológica");
  sans(); doc.setFontSize(7.3); doc.setTextColor(...C.mut);
  const metTxt = clean(`Medición determinista semanal (domingo) de la percepción de ${issuerName} en 6 modelos de IA (ChatGPT, Perplexity, Gemini, DeepSeek, Grok, Qwen), con pregunta idéntica y universo cerrado. Cada modelo recibe una nota 0-100 que agrega sus 8 métricas con estos pesos: NVM 15, DRM 15, SIM 12, RMM 12, CEM 12, GAM 12, DCM 12, CXM 10. El RIXc es la media de las notas de los 6 modelos (las métricas del anexo se muestran redondeadas a enteros, por eso su agregado ponderado puede diferir en unas décimas del RIXc). Reglas de este briefing: (1) un número, una definición: puesto, medias y rango se calculan una sola vez y se repiten igual en todo el documento; el puesto sale de medias exactas sin redondear y un empate exacto comparte puesto; (2) un único grupo de comparación: ${grupo.label} (${grupo.n} empresas); (3) significativo frente a ruido: un cambio semanal es significativo si supera el máximo entre 2 puntos y 1,5 veces la volatilidad propia de 12 semanas (esta semana, ${fmt1(yo.sig.threshold)} puntos); (4) divergencia = rango máximo-mínimo entre modelos, con umbrales 0-8 consolidado, 9-14 moderado, 15 o más frágil; (5) toda cita se verifica por software contra la respuesta original de cada IA: solo se imprimen fragmentos literales, y un hecho sin fuente en el raw queda pendiente de verificación; (6) la autoridad de las fuentes del anexo se clasifica por canal (T1 oficial a T5 opinión, más Corporativo) y los dominios no verificados nunca puntúan como especializados; (7) la variación semanal del RIXc es la diferencia entre la media exacta de esta semana y la de la anterior, en décimas (equivale a la media de las variaciones de los 6 modelos), y el umbral de significancia se aplica a la nota, no al puesto (el puesto puede moverse por décimas en grupos apretados); (8) las URL del anexo se imprimen tal cual las devolvió cada modelo y se comprueban automáticamente al generar el informe (ABRE / ROTA / no comprobable): una URL rota es una URL de noticia que el modelo construyó y no existe, y resta evidencia (DRM) al modelo que la cita; las portadas y secciones de un medio se etiquetan SECCIÓN (no son noticias concretas, aunque abran); (9) la sección "Lo que las IAs dicen mal de ti" es una capa de auditoría independiente de la medición: contrasta las afirmaciones de los 6 modelos contra la ficha oficial del emisor y sus fuentes declaradas, exige evidencia para los veredictos "inventada", "desactualizada" y "confirmada" (sin evidencia suficiente, el veredicto es "no contrastable"), y NO altera ninguna nota ni puesto: la medición sigue siendo de universo cerrado. Datos validados por los gates de completitud y calidad del pipeline antes de la emisión. Sin fuentes externas al sistema. RepIndex es un producto de Paravium Labs, avalado por la Universidad Politécnica de Madrid; metodología RepIndex validada por la Universidad Complutense de Madrid.`);
  const met = doc.splitTextToSize(metTxt, CW);
  ensure(met.length * 10.2 + 16);
  doc.text(met, M, y + 4, { lineHeightFactor: 1.38 });

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    sans(); doc.setFontSize(7); doc.setTextColor(...C.mut2);
    doc.text(clean(`RepIndex - Briefing confidencial para ${clientName} - ${weekLabel}`), M, H - 22);
    mono(); doc.text(`${i} / ${n}`, W - M, H - 22, { align: "right" });
  }
  return new Uint8Array(doc.output("arraybuffer"));
}

// ============================ Email tarjeta ============================
// v21 (QA 18/10): preheader con el titular, "Nota RepIndex X sobre 100" (el
// Dircom no sabe qué es RIXc), flechas con signo y caso cero sin flecha,
// puesto sin abreviaturas, y el dato más fuerte de la semana: cuántas cosas
// falsas dijeron las IAs y la más grave.
function emailCard(ctx: any, signedUrl: string): string {
  const { issuerName, weekLabel, brief, yo, grupo, contactName, verif } = ctx;
  const greeting = contactName ? `Hola ${esc(String(contactName).split(" ")[0])},` : "Hola,";
  const dNum = yo.delta == null ? null : Number(yo.delta);
  const dtxt = dNum == null ? ""
    : Math.abs(dNum) < 0.05
      ? ` <span style="font-size:15px;font-weight:700;color:#8899a6">= 0,0</span>`
      : ` <span style="font-size:15px;font-weight:700;color:${dNum > 0 ? "#10a37f" : "#dc2626"}">${dNum > 0 ? "▲ +" : "▼ -"}${coma(Math.abs(dNum).toFixed(1))}</span>`;
  const sig = yo.sig.sig == null ? "" : yo.sig.sig ? " · Cambio significativo esta semana" : " · Sin cambio significativo";
  const grupoMin = String(grupo.label ?? "").replace(/^(\p{Lu})/u, (c: string) => c.toLowerCase());
  const rank = yo.rank ? ` · ${yo.rank}º de ${grupo.n} en ${esc(grupoMin)}${yo.rank_prev != null ? ` (la semana pasada, ${yo.rank_prev}º)` : ""}` : "";
  // El dato más fuerte: la auditoría de veracidad (v22: solo lo dicho sobre la
  // propia empresa; lo del entorno, en inciso)
  let audLine = "";
  let nInvEmp = 0;
  if (verif && Array.isArray(verif.claims) && verif.claims.length) {
    const invTodas = verif.claims.filter((r: any) => r.verdict === "inventada");
    const inv = invTodas.filter((r: any) => r.sujeto !== "entorno");
    nInvEmp = inv.length;
    const invEnt = invTodas.length - inv.length;
    const entTxt = invEnt ? ` (y ${invEnt === 1 ? "1 invención" : `${invEnt} invenciones`} sobre su entorno)` : "";
    if (inv.length) {
      const GORD: Record<string, number> = { alta: 0, media: 1, baja: 2 };
      const top = [...inv].sort((a: any, b: any) => (GORD[a.gravedad] ?? 1) - (GORD[b.gravedad] ?? 1))[0];
      const topTxt = top ? ` La más grave: ${esc(cutWord(String(top.claim ?? ""), 140))}` : "";
      audLine = `<tr><td style="padding:0 32px 12px"><div style="border-left:4px solid #dc2626;background:#fef2f2;border-radius:0 8px 8px 0;padding:10px 14px"><b style="font-size:13px;color:#dc2626">Esta semana las IAs han dicho ${inv.length === 1 ? "1 cosa falsa" : `${inv.length} cosas falsas`} sobre ${esc(issuerName)}${entTxt}.</b><br><span style="font-size:12.5px;color:#536471">${topTxt} — el detalle y qué hacer, en el briefing.</span></div></td></tr>`;
    } else {
      audLine = `<tr><td style="padding:0 32px 12px"><div style="border-left:4px solid #10a37f;background:#f0fdf9;border-radius:0 8px 8px 0;padding:10px 14px"><span style="font-size:12.5px;color:#536471"><b style="color:#10a37f">Auditoría de veracidad:</b> ninguna afirmación inventada sobre ${esc(issuerName)} esta semana${entTxt}.</span></div></td></tr>`;
    }
  }
  const lines = [
    brief?.alerta ? `<tr><td style="padding:0 32px 10px"><div style="border-left:4px solid #dc2626;padding-left:14px"><b style="font-size:13px;color:#0f1419">Alerta</b><br><span style="font-size:13px;color:#536471">${esc(brief.alerta)}</span></div></td></tr>` : "",
    brief?.oportunidad ? `<tr><td style="padding:0 32px 10px"><div style="border-left:4px solid #10a37f;padding-left:14px"><b style="font-size:13px;color:#0f1419">Oportunidad</b><br><span style="font-size:13px;color:#536471">${esc(brief.oportunidad)}</span></div></td></tr>` : "",
  ].join("");
  // Preheader: lo que la bandeja de entrada muestra como vista previa.
  // v22: lleva el dato, no el titular (que ya es la primera frase del cuerpo
  // y salía dos veces en algunos clientes de correo).
  const phDelta = dNum == null ? "" : Math.abs(dNum) < 0.05 ? "sin cambios esta semana" : `${dNum > 0 ? "sube" : "baja"} ${coma(Math.abs(dNum).toFixed(1))} puntos`;
  const phRank = yo.rank ? `${yo.rank}º de ${grupo.n}` : "";
  const phAud = nInvEmp ? `${nInvEmp === 1 ? "1 cosa falsa detectada" : `${nInvEmp} cosas falsas detectadas`}` : "";
  const preheader = esc([`Nota ${yo.rixc_x != null ? coma(Number(yo.rixc_x).toFixed(1)) : "-"} sobre 100`, phDelta, phRank, phAud].filter(Boolean).join(" · "));
  return `<!DOCTYPE html><html lang="es"><body style="margin:0;padding:0;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f1f5f9">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${preheader}${"&nbsp;&zwnj;".repeat(40)}</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 20px"><tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,.05)">
  <tr><td style="background:linear-gradient(90deg,#12343f,#20808d);padding:24px 32px">
    <div style="font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:2px;color:#eafcff;font-weight:700">REPINDEX</div>
    <div style="color:#d6ebf0;font-size:12.5px;margin-top:4px">${esc(weekLabel)} · Briefing semanal de reputación algorítmica</div></td></tr>
  <tr><td style="padding:26px 32px 4px"><p style="margin:0 0 6px;font-size:14.5px;color:#536471">${greeting}</p>
    <h2 style="margin:0 0 4px;font-size:21px;color:#0f1419">${esc(issuerName)}</h2>
    <p style="margin:0;font-size:28px;font-weight:800;color:#0f1419">Nota RepIndex ${yo.rixc_x != null ? coma(Number(yo.rixc_x).toFixed(1)) : "—"} <span style="font-size:15px;font-weight:600;color:#8899a6">sobre 100</span>${dtxt}</p>
    <p style="margin:4px 0 0;font-size:12px;color:#8899a6">vs semana anterior${rank}${sig}</p></td></tr>
  <tr><td style="padding:12px 32px 16px"><p style="margin:0;font-size:14px;color:#334155;line-height:1.55;font-weight:600">${esc(brief?.titular ?? "")}</p></td></tr>
  ${audLine}
  ${lines}
  <tr><td align="center" style="padding:16px 32px 30px">
    <a href="${signedUrl}" style="display:inline-block;padding:14px 34px;background:#1a73e8;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px">Descargar briefing completo (PDF) →</a>
    <p style="margin:10px 0 0;font-size:11px;color:#94a3b8">El enlace de descarga caduca en 30 días.</p></td></tr>
  <tr><td style="background:#f7f9fa;padding:18px 32px;border-top:1px solid #e5e7eb"><p style="margin:0;font-size:11.5px;color:#8899a6;text-align:center">Datos deterministas · 6 modelos de IA · grupo de comparación: ${esc(grupo.label)} · <a href="https://repindex.ai" style="color:#536471">repindex.ai</a></p></td></tr>
  </table></td></tr></table></body></html>`;
}

// ============================ Handler ============================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const body = await req.json().catch(() => ({} as any));
  const testMode = !!body.test_mode;
  const force = !!body.force;
  const onlyClientId = body.client_id ?? null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
  const db = createClient(supabaseUrl, serviceKey);

  const results: any[] = [];
  try {
    const { data: wk, error: wkErr } = await db.from("rix_runs_v2")
      .select('"07_period_to"').order('"07_period_to"', { ascending: false }).limit(1);
    if (wkErr || !wk?.length) throw new Error(`No se pudo determinar la semana: ${wkErr?.message}`);
    const weekStart: string = String(wk[0]["07_period_to"]).slice(0, 10);
    const weekLabel = fmtWeekLabel(weekStart);

    let q = db.from("premium_report_clients").select("*").eq("is_active", true);
    if (onlyClientId) q = q.eq("id", onlyClientId);
    const { data: clients, error: cErr } = await q.order("created_at");
    if (cErr) throw new Error(`Clientes: ${cErr.message}`);
    if (!clients?.length) {
      return new Response(JSON.stringify({ ok: true, week: weekStart, processed: 0, note: "sin clientes activos" }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    const agent = async (payload: any) => {
      const r = await fetch(`${supabaseUrl}/functions/v1/report-analysis`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify(payload),
      });
      if (!r.ok) { console.error("report-analysis", payload.type, r.status, (await r.text()).slice(0, 200)); return null; }
      const j = await r.json();
      return j?.analysis_json ?? null;
    };

    for (const client of clients) {
      const t0 = Date.now();
      try {
        if (!force && !testMode) {
          const { count } = await db.from("premium_report_sends").select("id", { count: "exact", head: true })
            .eq("client_id", client.id).eq("week_start", weekStart).eq("status", "sent").eq("test_mode", false);
          if ((count ?? 0) > 0) { results.push({ client: client.client_name, skipped: "already_sent_this_week" }); continue; }
        }

        const { data: recipRows, error: recErr } = await db.from("premium_report_recipients")
          .select("user_profiles!inner(id, email, full_name, is_active)")
          .eq("client_id", client.id).eq("is_active", true);
        if (recErr) throw new Error(`destinatarios: ${recErr.message}`);
        const recipients = (recipRows ?? [])
          .map((r: any) => r.user_profiles)
          .filter((u: any) => u && u.is_active && u.email)
          .map((u: any) => ({ email: u.email as string, name: (u.full_name ?? null) as string | null }));
        if (!testMode && recipients.length === 0) {
          await db.from("premium_report_sends").insert({
            client_id: client.id, ticker: client.ticker, week_start: weekStart,
            test_mode: false, status: "skipped", error_message: "sin destinatarios marcados (premium_report_recipients)",
          }).then(() => {}, () => {});
          results.push({ client: client.client_name, skipped: "sin_destinatarios" });
          continue;
        }

        const { data: issuers } = await db.from("repindex_root_issuers")
          .select("issuer_name, sector_category, verified_competitors, website").eq("ticker", client.ticker).limit(1);
        const issuer = issuers?.[0];
        if (!issuer) throw new Error(`Ticker ${client.ticker} no encontrado en el catalogo`);

        // v22: la ficha canónica aporta los dominios corporativos del grupo
        // (fresenius.com, movistar.es...) y los temas activos del radar del emisor
        const { data: fsExtra } = await db.from("issuer_factsheet")
          .select("corp_domains, temas_activos").eq("ticker", client.ticker).maybeSingle();
        const corpExtra: string[] = (Array.isArray(fsExtra?.corp_domains) ? fsExtra.corp_domains : []).map((d: string) => normDom(String(d)));
        const temasActivos: string[] = Array.isArray(fsExtra?.temas_activos) ? fsExtra.temas_activos.map((t: any) => String(t)) : [];

        // ---- UN SOLO GRUPO ----
        const scope = client.report_scope ?? null;
        const scopeTks: string[] = Array.isArray(scope?.tickers) ? scope.tickers.filter(Boolean) : [];
        const groupSet = new Set<string>(scopeTks.length ? scopeTks : [client.ticker, ...(Array.isArray(issuer.verified_competitors) ? issuer.verified_competitors : [])]);
        groupSet.add(client.ticker);
        const groupTickers = [...groupSet];
        const groupLabel: string = (typeof scope?.label === "string" && scope.label.trim()) ? scope.label.trim() : "Competidores verificados";

        // ---- Rankings de esta semana y la anterior ----
        const rankNowR = await db.rpc("rix_ranking_datapack", { p_tickers: groupTickers });
        if (rankNowR.error) throw new Error(`ranking datapack: ${rankNowR.error.message}`);
        const rankNow = rankNowR.data;
        const prevWeek: string | null = rankNow?.prev_week ? String(rankNow.prev_week).slice(0, 10) : null;
        const rankPrevR = prevWeek ? await db.rpc("rix_ranking_datapack", { p_tickers: groupTickers, p_to: prevWeek }) : { data: null, error: null } as any;
        const rankPrev = rankPrevR?.data ?? null;
        const prevRankByTk = new Map<string, number>((Array.isArray(rankPrev?.ranking) ? rankPrev.ranking : []).map((r: any) => [r.tk, r.rank]));
        const prevRowsByTk = new Map<string, any>((Array.isArray(rankPrev?.ranking) ? rankPrev.ranking : []).map((r: any) => [r.tk, r]));

        // Sin fila de la semana anterior no hay variación comparable: delta = null (se imprime "-").
        // v21: la variación se calcula AQUÍ sobre las medias exactas (rixc_x, con
        // décimas), no con el delta del datapack (que resta enteros redondeados y
        // producía 0,0 / +4,0 / -6,0 donde el dato real era +0,2 / +3,5 / -6,3).
        // Es la media de las variaciones de los 6 modelos, porque el RIXc es la
        // media de las 6 notas.
        const ranking: any[] = (Array.isArray(rankNow?.ranking) ? rankNow.ranking : []).map((r: any) => {
          const prevR = prevRowsByTk.get(r.tk) ?? null;
          const delta = prevR && prevR.rixc_x != null && r.rixc_x != null
            ? Math.round((Number(r.rixc_x) - Number(prevR.rixc_x)) * 10) / 10
            : null;
          return { ...r, rank_prev: prevRankByTk.get(r.tk) ?? null, delta };
        });
        const selfRow = ranking.find((r: any) => r.tk === client.ticker) ?? null;
        if (!selfRow) throw new Error(`sin datos de ${client.ticker} en la semana ${weekStart}`);
        const selfPrev = prevRowsByTk.get(client.ticker) ?? null;
        const groupN = rankNow?.scope?.n_entities ?? groupTickers.length;
        const groupAvg = rankNow?.sector_avg ?? {};
        const selfSeries = (Array.isArray(rankNow?.entity_series) ? rankNow.entity_series : []).find((s: any) => s.tk === client.ticker)?.series ?? [];
        const avgSeries = Array.isArray(rankNow?.sector_series) ? rankNow.sector_series : [];
        const vol = (Array.isArray(rankNow?.period) ? rankNow.period : []).find((p: any) => p.tk === client.ticker)?.volatility ?? null;
        const sig = significance(selfRow.delta ?? null, vol);

        // ---- Respuestas BRUTAS por modelo (lo que la IA dijo) + notas ----
        const nextDay = (d: string) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
        const RAW_SELECT = '"02_model_name", "09_rix_score", "10_resumen", "11_puntos_clave", "20_res_gpt_bruto", "21_res_perplex_bruto", "22_res_gemini_bruto", "23_res_deepseek_bruto", "respuesta_bruto_grok", "respuesta_bruto_qwen"';
        const fetchWeekRuns = async (w: string) => {
          const { data, error } = await db.from("rix_runs_v2")
            .select(RAW_SELECT)
            .eq('"05_ticker"', client.ticker)
            .gte("batch_execution_date", w).lt("batch_execution_date", nextDay(w));
          if (error) throw new Error(`runs ${w}: ${error.message}`);
          return data ?? [];
        };
        const runsNow = await fetchWeekRuns(weekStart);
        const runsPrev = prevWeek ? await fetchWeekRuns(prevWeek) : [];
        const prevByModel = new Map<string, number>(runsPrev.map((r: any) => [r["02_model_name"], Number(r["09_rix_score"])]));
        const modelMaterial = new Map<string, string>(); // raw de ESA IA (para verificar sus citas)
        const modelRows = runsNow
          .map((r: any) => {
            const model = r["02_model_name"];
            const rawCol = MODEL_RAW_COL[model];
            const respuesta = String((rawCol && r[rawCol]) || "");
            const puntos = Array.isArray(r["11_puntos_clave"]) ? r["11_puntos_clave"].join(" || ") : "";
            modelMaterial.set(model, normTxt(`${respuesta} || ${r["10_resumen"] ?? ""} || ${puntos}`));
            const prev = prevByModel.get(model) ?? null;
            return {
              model, rix: Number(r["09_rix_score"]),
              rix_prev: prev, delta: prev != null ? Number(r["09_rix_score"]) - prev : null,
              respuesta: respuesta.slice(0, 2800),
              respuesta_full: respuesta,
              resumen_evaluador: String(r["10_resumen"] ?? "").slice(0, 900),
              puntos: puntos.slice(0, 900),
            };
          })
          .sort((a: any, b: any) => String(a.model).localeCompare(String(b.model)));
        const allMaterial = [...modelMaterial.values()].join(" || ");

        // ---- Métricas ----
        const metricRows = METRICS.map((m) => {
          const now = selfRow[m.key];
          const prev = selfPrev?.[m.key] ?? null;
          const avg = groupAvg?.[m.key] ?? null;
          // La distancia a la media solo tiene sentido si al menos 2 entidades del grupo tienen la métrica
          const nWith = ranking.filter((r: any) => r[m.key] != null).length;
          return {
            code: m.code, name: m.name, peso: m.peso, valor: now,
            delta_sem: now != null && prev != null ? now - prev : null,
            dist_media: now != null && avg != null && nWith >= 2 ? Math.round((now - Number(avg)) * 10) / 10 : null,
            n_con_dato: nWith,
          };
        });

        // ---- Material de competidores (causas de sus movimientos) ----
        const { data: sig2 } = await db.rpc("rix_qualitative_signals", { p_tickers: groupTickers.filter((t) => t !== client.ticker) });
        const compMaterial = (Array.isArray(sig2) ? sig2 : []).map((s: any) => ({
          tk: s.ticker, name: s.name,
          resumenes: (Array.isArray(s.summaries) ? s.summaries : []).slice(0, 3).map((x: any) => String(x.resumen ?? "").slice(0, 400)),
          key_points: (Array.isArray(s.key_points) ? s.key_points : []).slice(0, 6),
        }));

        // ---- Fuentes citadas esta semana (también para auto-verificar hechos) ----
        const profR = await db.rpc("rix_profile_datapack", { p_ticker: client.ticker });
        const citeItems: any[] = profR?.data?.citations?.items ?? [];
        const corpDomains = [...new Set([
          ...String(issuer.website ?? "")
            .split(/[,\s]+/).map((w: string) => w.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase()).filter((w: string) => w.includes(".")),
          ...corpExtra.filter((d: string) => d.includes(".")),
        ])];
        // v22: las portadas y secciones no cuentan como fuentes ni en los tiers
        // (se listan aparte en el anexo de URLs): solo las noticias concretas
        // alimentan los recuentos y la tabla de canales.
        const itemsAll = citeItems
          .map((it: any) => ({
            url: String(it.url ?? "").slice(0, 300),
            dom: groupDomain((it.domain || "") as string, corpDomains) || "otros",
            models: Array.isArray(it.models) ? it.models : [],
            estado: "no_comprobable",
            seccion: esSeccionUrl(String(it.url ?? "")),
          }))
          .filter((x: any) => x.url.length > 8);
        const byDom = new Map<string, { fuentes: number; citas: number; models: Set<string> }>();
        let totalCitas = 0;
        let citasSecciones = 0;
        for (const it of itemsAll) {
          const nModels = it.models.length || 1;
          if (it.seccion) { citasSecciones += nModels; continue; }
          if (!byDom.has(it.dom)) byDom.set(it.dom, { fuentes: 0, citas: 0, models: new Set() });
          const b = byDom.get(it.dom)!;
          b.fuentes += 1;
          b.citas += nModels; totalCitas += nModels;
          it.models.forEach((m: string) => b.models.add(m));
        }
        const citations = {
          totalCitas, totalFuentes: itemsAll.filter((x: any) => !x.seccion).length,
          nSecciones: itemsAll.filter((x: any) => x.seccion).length, citasSecciones,
          rows: Array.from(byDom.entries())
            .map(([dom, info]) => ({ dom, tier: tierOf(dom, corpDomains), fuentes: info.fuentes, citas: info.citas, models: Array.from(info.models) }))
            .sort((a, b) => a.tier - b.tier || b.citas - a.citas || a.dom.localeCompare(b.dom)),
          items: itemsAll,
        };

        // ---- Comprobación automática de cada URL citada (estado HTTP real) ----
        // ok = abre (2xx tras redirecciones); rota = 404/410 (la IA fabricó la
        // URL: señal de evidencia débil); no_comprobable = bloqueo anti-bot,
        // muro de pago o timeout (no prueba nada en ningún sentido).
        const checkUrl = async (u: string): Promise<string> => {
          const attempt = async (method: string): Promise<Response | null> => {
            const ctl = new AbortController();
            const t = setTimeout(() => ctl.abort(), 6000);
            try {
              const resp = await fetch(u, { method, redirect: "follow", signal: ctl.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; RepIndexVerifier/1.0)" } });
              try { await resp.body?.cancel(); } catch (_e) { /* noop */ }
              return resp;
            } catch (_e) { return null; } finally { clearTimeout(t); }
          };
          let resp = await attempt("HEAD");
          if (!resp || resp.status === 405 || resp.status === 501 || resp.status === 403) {
            const g = await attempt("GET");
            if (g) resp = g;
          }
          if (!resp) return "no_comprobable";
          if (resp.ok) return "ok";
          if (resp.status === 404 || resp.status === 410) return "rota";
          return "no_comprobable";
        };
        {
          let urlIdx = 0;
          const workers = Array.from({ length: Math.min(8, citations.items.length) }, async () => {
            while (urlIdx < citations.items.length) {
              const i = urlIdx++;
              citations.items[i].estado = await checkUrl(citations.items[i].url);
            }
          });
          await Promise.all(workers);
        }

        // ---- Acciones previas ----
        const { data: pa } = await db.from("premium_report_actions")
          .select("*").eq("client_id", client.id).lt("week_start", weekStart)
          .order("week_start", { ascending: false }).order("idx").limit(3);
        const metricNow = (code: string | null) => {
          if (!code) return null;
          const c = String(code).toUpperCase();
          if (c === "RIXC" || c === "RIX") return selfRow.rixc_x ?? selfRow.rixc ?? null;
          const m = METRICS.find((x) => x.code === c);
          return m ? (selfRow[m.key] ?? null) : null;
        };
        const prevActions = (pa ?? []).map((a: any) => {
          const cur = metricNow(a.metrica);
          return { ...a, valor_actual: cur, delta: cur != null && a.valor_al_emitir != null ? Math.round((Number(cur) - Number(a.valor_al_emitir)) * 10) / 10 : null };
        })
          // v22.2: lo retirado por la auditoría nunca encabeza la tabla
          .sort((a: any, b: any) => (a.estado === "retirada" ? 1 : 0) - (b.estado === "retirada" ? 1 : 0));

        // ---- v20: auditoría de veracidad ANTES del agente (rix-verify corre a las 04:30) ----
        // El agente la recibe para no construir nada sobre invenciones; el PDF la LEE
        // para la sección de auditoría; el candado de la regla de oro la usa de red.
        let verif: any = null;
        let inventadasAud: Array<{ claim: string; cita?: string | null; model?: string }> = [];
        try {
          const vfR = await db.from("rix_claim_checks")
            .select("model, claim_type, sujeto, claim, cita, url_citada, url_estado, verdict, gravedad, evidencia_url, evidencia_extracto, accion")
            .eq("ticker", client.ticker).eq("week_start", weekStart);
          const verifRows: any[] = Array.isArray(vfR?.data) ? vfR.data : [];
          for (const r of verifRows) { r.claim = String(r.claim ?? ""); if (r.accion) r.accion = String(r.accion); }
          if (verifRows.length) {
            verif = {
              claims: verifRows.filter((r: any) => !String(r.claim_type).startsWith("ficha:")),
              ficha: verifRows.filter((r: any) => String(r.claim_type).startsWith("ficha:")),
            };
            inventadasAud = verif.claims
              .filter((r: any) => r.verdict === "inventada")
              .map((r: any) => ({ claim: String(r.claim), cita: r.cita ?? null, model: r.model }));
          }
        } catch (e) { console.error("verif load", (e as any)?.message); }
        const matchInv = buildGoldMatcher(inventadasAud, issuer.issuer_name);

        // ---- Agente: capa narrativa ----
        const briefPayload = {
          cliente: client.client_name, empresa: issuer.issuer_name, ticker: client.ticker,
          semana: weekStart, semana_anterior: prevWeek,
          grupo: { label: groupLabel, n: groupN, media_rixc: r1(groupAvg?.rixc), ranking: ranking.map((r: any) => ({ rank: r.rank, rank_prev: r.rank_prev, tk: r.tk, name: r.name, rixc_x: r1(r.rixc_x), delta: r.delta })) },
          yo: { rixc_x: r1(selfRow.rixc_x), delta: selfRow.delta, rank: selfRow.rank, rank_prev: selfRow.rank_prev, significativo: sig.sig, umbral_significancia: sig.threshold, rango_modelos: (selfRow.rix_max ?? 0) - (selfRow.rix_min ?? 0), nivel_divergencia: divergenceLevel((selfRow.rix_max ?? 0) - (selfRow.rix_min ?? 0)).label },
          metricas: metricRows,
          por_modelo: modelRows.map((r: any) => ({ model: r.model, rix: r.rix, delta: r.delta, respuesta_de_la_ia: r.respuesta, resumen_del_evaluador: r.resumen_evaluador, puntos_clave: r.puntos })),
          competidores_material: compMaterial,
          dominios_citados: citations.rows.map((r: any) => r.dom),
          acciones_semana_anterior: prevActions.map((a: any) => ({ accion: a.accion, metrica: a.metrica, al_emitir: a.valor_al_emitir, hoy: a.valor_actual, delta: a.delta, estado: a.estado })),
          auditoria_inventadas: inventadasAud.map((c) => ({ model: c.model, afirmacion: c.claim })),
        };
        const brief = await agent({ type: "weekly_brief", payload: briefPayload });
        if (!brief) throw new Error("el agente no devolvio el briefing");

        // Formato español también en la capa narrativa del agente (62.2 -> 62,2;
        // 22,000 clientes -> 22.000; "RIXc 66" -> "RIXc 66,0").
        // NUNCA se toca 'cita': debe seguir siendo literal del raw.
        const comaNarr = (s: unknown) => (typeof s === "string"
          ? s
            .replace(/(\d),(\d{3})(?!\d)/g, "$1.$2")        // millar inglés -> punto español
            .replace(/(\d)\.(\d{1,2})(?!\d)/g, "$1,$2")     // decimal -> coma (3+ dígitos tras el punto = millar, se respeta)
            .replace(/RIXc (\d{1,3})(?!\d|[.,]\d)/g, "RIXc $1,0") // la nota siempre con una décima, como en portada (v22.1: sin comerse un dígito cuando ya viene "55,8")
            .replace(/\b(ca[ií]das?|cae|bajan?|baja|desciende|retroceden?|pierden?|descensos?|retrocesos?)([^.;:]{0,40}?\bde\s+)[-−](\d+(?:,\d+)?)(?!\s*a[\s-])/gi, "$1$2$3") // v22.2: "caída de -6" -> "caída de 6" (sin tocar rangos "de -3 a -1")
          : s);
        brief.titular = comaNarr(brief.titular);
        brief.alerta = comaNarr(brief.alerta);
        brief.oportunidad = comaNarr(brief.oportunidad);
        if (Array.isArray(brief.hechos)) for (const h0 of brief.hechos) h0.hecho = comaNarr(h0.hecho);
        if (Array.isArray(brief.notas_metricas)) for (const nm0 of brief.notas_metricas) nm0.nota = comaNarr(nm0.nota);
        if (Array.isArray(brief.competidores)) for (const c0 of brief.competidores) c0.linea = comaNarr(c0.linea);
        // v22.1: el agente a veces devuelve 'vigilar' como objetos; se aplana a frases
        if (Array.isArray(brief.vigilar)) brief.vigilar = brief.vigilar
          .map((v0: any) => typeof v0 === "string" ? v0 : Object.values(v0 ?? {}).filter((x: any) => typeof x === "string" && x.trim()).join(" — "))
          .filter((v0: any) => typeof v0 === "string" && v0.trim());
        if (Array.isArray(brief.vigilar)) brief.vigilar = brief.vigilar.map((v0: any) => comaNarr(v0));
        if (Array.isArray(brief.acciones)) for (const a0 of brief.acciones) a0.accion = comaNarr(a0.accion);

        // ---- VERIFICACIÓN DE HECHOS (v22: ANTES del candado) ----
        // Cita literal + fuente auto-verificada contra los dominios citados
        // (Expansión <-> expansion.com) + fecha solo si consta en el material.
        // Se verifica primero para que un hecho VERIFICADO con fuente real sea
        // inmune al matching por parecido de la regla de oro (fix Australia-ANA).
        const domBase = (d: string) => stripAcc(d.split(".").slice(0, -1).join(".")).replace(/[^a-z0-9]/g, "");
        // v22.2: rescate de fuente — si la cita de un modelo lleva al lado un
        // enlace (markdown) o un marcador [n] cuya URL figura en el anexo con
        // estado ABRE (y no es sección), esa URL documenta el hecho. La URL debe
        // compartir términos con el hecho (su slug habla de lo mismo).
        const modelRawFull = new Map<string, string>(modelRows.map((r: any) => [r.model, String(r.respuesta_full ?? "")]));
        const urlsDeModelo = new Map<string, string[]>();
        for (const [m0, raw0] of modelRawFull) {
          const vistos = new Set<string>(); const lista: string[] = [];
          for (const u0 of (raw0.match(/https?:\/\/[^\s)\]"'<>]+/g) ?? [])) { const u1 = u0.replace(/[.,;:]+$/, ""); if (!vistos.has(u1)) { vistos.add(u1); lista.push(u1); } }
          urlsDeModelo.set(m0, lista);
        }
        const itemByUrl = new Map<string, any>(citations.items.map((it: any) => [it.url, it]));
        const rescateFuente = (hechoTxt: unknown, citaTxt: unknown, hModels: string[]): string | null => {
          const citaRaw = String(citaTxt ?? "");
          if (citaRaw.length < 25) return null;
          const hToks = new Set(normTxt(`${hechoTxt} ${citaRaw}`).split(/[^a-z0-9]+/).filter((t) => t.length >= 5));
          const valida = (u0: string): string | null => {
            const u1 = u0.replace(/[.,;:]+$/, "").slice(0, 300);
            const it = itemByUrl.get(u1);
            if (!it || it.seccion || it.estado !== "ok") return null;
            let comunes = 0;
            for (const t of stripAcc(u1.toLowerCase()).split(/[^a-z0-9]+/)) { if (t.length >= 5 && hToks.has(t)) comunes++; }
            if (comunes < 2) return null;
            try { return groupDomain(new URL(u1).hostname, corpDomains); } catch (_e) { return null; }
          };
          for (const m0 of hModels) {
            const raw0 = modelRawFull.get(m0) ?? "";
            let idx = raw0.indexOf(citaRaw);
            if (idx < 0) idx = raw0.indexOf(citaRaw.slice(0, 60));
            if (idx < 0) continue;
            const win = raw0.slice(idx, idx + citaRaw.length + 260);
            for (const mm of win.matchAll(/\((https?:\/\/[^)\s]+)\)/g)) { const f = valida(mm[1]); if (f) return f; }
            const urls = urlsDeModelo.get(m0) ?? [];
            for (const mk of win.matchAll(/\[(\d{1,2})\]/g)) {
              const n0 = Number(mk[1]);
              if (n0 >= 1 && n0 <= urls.length) { const f = valida(urls[n0 - 1]); if (f) return f; }
            }
          }
          return null;
        };
        const rawHechos: any[] = Array.isArray(brief.hechos) ? brief.hechos : [];
        const hechosAll = rawHechos.map((h: any, _oi: number) => {
          const citaOK = isLiteral(h.cita, allMaterial);
          // Una fuente solo es atribuible si la cita al menos una de las IAs que recogen el hecho
          // (evita p.ej. atribuir quironsalud.com a un hecho de ChatGPT/Deepseek que no lo citan).
          const hModels: string[] = Array.isArray(h.modelos) ? h.modelos.map((m: any) => String(m)) : [];
          const citedByFactIAs = (row: any) => !hModels.length || (row.models ?? []).some((m: string) => hModels.includes(m));
          let fuente = typeof h.fuente === "string" && h.fuente.trim() ? normDom(h.fuente.trim().replace(/^https?:\/\//, "").split("/")[0]) : null;
          if (fuente) {
            const row = citations.rows.find((r: any) => r.dom === fuente);
            if (row ? !citedByFactIAs(row) : !allMaterial.includes(normTxt(fuente))) fuente = null;
          }
          if (!fuente && citaOK) {
            const texto = normTxt(`${h.hecho} ${h.cita}`).replace(/[^a-z0-9 ]/g, "");
            for (const row of citations.rows) {
              if (!citedByFactIAs(row)) continue;
              const base = domBase(row.dom);
              if (base.length >= 5 && texto.includes(base)) { fuente = row.dom; break; }
            }
          }
          // v22.2: rescate por el enlace o marcador [n] pegado a la cita en el raw
          if (!fuente && citaOK) fuente = rescateFuente(h.hecho, h.cita, hModels);
          // v20: una fuente cuyo único respaldo esa semana son URLs ROTA no verifica nada
          // (v22: las portadas/secciones tampoco cuentan como respaldo)
          if (fuente) {
            const hostOf = (u: string) => { try { return groupDomain(new URL(u).hostname, corpDomains); } catch (_e) { return ""; } };
            const rel = citations.items.filter((it: any) => hostOf(it.url) === fuente && citedByFactIAs({ models: it.models }));
            if (rel.length && rel.every((it: any) => it.estado === "rota" || it.seccion)) fuente = null;
          }
          let fecha = typeof h.fecha === "string" && h.fecha.trim() ? h.fecha.trim() : null;
          if (fecha && !allMaterial.includes(normTxt(fecha))) fecha = null;
          const estado = !citaOK ? "cita_no_literal" : fuente ? "verificado" : "sin_verificar";
          const sentido = h.sentido === "riesgo" ? "riesgo" : "positivo";
          return { ...h, _oi, sentido, citaOriginal: h.cita, cita: citaOK ? cutWord(h.cita, 260) : null, fuente, fecha, estado };
        });

        // ---- v22.1 (QA v2-ANA): fuente débil no sostiene un hecho ----
        // Un hecho cuyo único respaldo es UNA fuente de opinión/agregador (tier 5)
        // y UN solo modelo baja a vigilancia con su matiz; su estado pasa a
        // "sin_verificar", de modo que las acciones o la portada que se apoyaran
        // en él se convierten en verificación / señal pendiente (bloque v21).
        const demotedIdx = new Set<number>();
        for (const h of hechosAll) {
          const tier5 = h.fuente ? tierOf(String(h.fuente), corpDomains) === 5 : false;
          const unModelo = (Array.isArray(h.modelos) ? h.modelos.length : 0) <= 1;
          if (tier5 && unModelo && h.estado === "verificado") {
            demotedIdx.add(Number(h._oi));
            h.estado = "sin_verificar"; h.fuente = null;
          }
        }
        if (demotedIdx.size) {
          const lineas = hechosAll.filter((h: any) => demotedIdx.has(Number(h._oi)))
            .map((h: any) => `Señal con fuente débil (un solo modelo y un dominio de opinión o agregador): ${cutWord(String(h.hecho ?? ""), 180)} Se vigila, no se afirma.`);
          brief.vigilar = [...(Array.isArray(brief.vigilar) ? brief.vigilar : []), ...lineas];
          console.log(`[client-weekly-report] fuente débil: ${demotedIdx.size} hecho(s) degradados a vigilancia (${client.ticker})`);
        }

        // ---- v20 · CANDADO DE LA REGLA DE ORO (v22: con inmunidad de hechos verificados) ----
        // Nada que la auditoría marque como inventado sale como titular, hecho,
        // oportunidad, alerta, acción ni vigilancia. Dos vías: matcher directo
        // (identidad de cita + solape de términos) y cascada por dependencias
        // (se_apoya_en / portada_se_apoya_en que etiqueta el agente).
        // v22: un hecho VERIFICADO (cita literal + fuente cuyas URLs abren) solo
        // se retira por identidad de cita, nunca por parecido de términos.
        let retiradosAud = 0;
        // v21: lo que la propia IA etiqueta como URL simulada/ficticia tampoco
        // sostiene nada (caso El Economista "(URL simulada)" de Gemini en ANA 18/10)
        const esSimulada = (t: unknown) => /url\s+simulad|enlace\s+simulad|url\s+fictici|referencia\s+simulad|simulated\s+url/i.test(String(t ?? ""));
        {
          const retiradoIdx = new Set<number>();
          for (const h of hechosAll) {
            const m = matchInv(`${h?.hecho ?? ""} ${h?.citaOriginal ?? ""}`);
            const fuera = esSimulada(`${h?.hecho ?? ""} ${h?.citaOriginal ?? ""} ${h?.fuente ?? ""}`) ||
              (m != null && (m.via === "cita" || h.estado !== "verificado"));
            if (fuera) retiradoIdx.add(Number(h._oi));
          }
          retiradosAud += retiradoIdx.size;
          const dependeDeRetirado = (idxs: any) => Array.isArray(idxs) && idxs.some((i: any) => retiradoIdx.has(Number(i)));
          const psa = (brief as any).portada_se_apoya_en ?? {};
          if (brief.oportunidad && (matchInv(brief.oportunidad) || esSimulada(brief.oportunidad) || dependeDeRetirado(psa.oportunidad))) { brief.oportunidad = null; retiradosAud++; }
          if (brief.alerta && (matchInv(brief.alerta) || esSimulada(brief.alerta) || dependeDeRetirado(psa.alerta))) { brief.alerta = null; retiradosAud++; }
          brief.hechos = hechosAll.filter((h: any) => !retiradoIdx.has(Number(h._oi)) && !demotedIdx.has(Number(h._oi)));
          if (Array.isArray(brief.acciones)) brief.acciones = brief.acciones.filter((a: any) => {
            const fuera = matchInv(String(a?.accion ?? "")) || esSimulada(String(a?.accion ?? "")) || dependeDeRetirado(a?.se_apoya_en);
            if (fuera) retiradosAud++;
            return !fuera;
          });
          if (Array.isArray(brief.vigilar)) brief.vigilar = brief.vigilar.filter((v0: any) => {
            const fuera = matchInv(String(v0 ?? "")) || esSimulada(String(v0 ?? ""));
            if (fuera) retiradosAud++;
            return !fuera;
          });
          // Titular construido sobre una invención: se sustituye por uno determinista
          // (v22: en frase natural, no en formato de ficha)
          if (brief.titular && matchInv(brief.titular)) {
            const fraseDelta = selfRow.delta == null ? "sin dato de la semana anterior"
              : Math.abs(Number(selfRow.delta)) < 0.05 ? "sin cambios frente a la semana anterior"
              : `${Number(selfRow.delta) > 0 ? "sube" : "baja"} ${coma(Math.abs(Number(selfRow.delta)).toFixed(1))} puntos frente a la semana anterior`;
            const frasePuesto = selfRow.rank === 1 ? `lidera ${groupLabel}` : selfRow.rank != null ? `es ${selfRow.rank}º de ${groupN} en ${groupLabel}` : `mide su reputación en ${groupLabel}`;
            brief.titular = `${issuer.issuer_name} ${frasePuesto} con ${fmt1(selfRow.rixc_x)} puntos sobre 100 y ${fraseDelta}.`;
            retiradosAud++;
          }
          if (retiradosAud > 0) console.log(`[client-weekly-report] regla de oro: ${retiradosAud} elemento(s) retirados por auditoría (${client.ticker})`);
        }
        (brief as any)._retirados_auditoria = retiradosAud;

        // ---- VERIFICACIÓN POR SOFTWARE ----
        // 1) Cita por modelo: literal de la RESPUESTA de esa IA; si no, primera frase del raw.
        const citaByModel = new Map<string, string>((Array.isArray(brief.afirmacion_por_modelo) ? brief.afirmacion_por_modelo : []).map((x: any) => [x.model, x.cita]));
        for (const r of modelRows) {
          const cita = citaByModel.get(r.model);
          const mat = modelMaterial.get(r.model) ?? "";
          if (cita && isLiteral(cita, mat) && !toolNoise.test(String(cita))) {
            (r as any).cita = cutWord(cita, 220);
          } else {
            // v20: el fallback descarta frases con ruido de herramientas (Tavily, etc.)
            const frases = String(r.respuesta ?? "").replace(/^[#\s*>-]+/, "").split(/(?<=[.!?])\s+/);
            const fall = frases.find((s: string) => s.length > 40 && !toolNoise.test(s)) ?? frases.find((s: string) => s.length > 40) ?? String(r.respuesta ?? "").slice(0, 180);
            (r as any).cita = cutWord(fall, 200);
          }
          // v22: la marca roja de la cita SOLO por identidad literal con una
          // invención auditada (el parecido por términos daba falsos positivos
          // sobre frases genéricas, caso Qwen-ANA 18/10)
          const mInv = (r as any).cita ? matchInv((r as any).cita) : null;
          if (mInv && mInv.via === "cita") (r as any).cita_inv = true;
        }
        const hechos = (Array.isArray(brief.hechos) ? brief.hechos : []).slice(0, 3);
        brief.hechos = hechos;

        // ---- v21 · REGLA DE ORO AMPLIADA: lo "pendiente de verificación" no sostiene acciones ni portada ----
        // Una acción apoyada en un hecho sin fuente se convierte en una acción de
        // verificación (primero comprobar, luego actuar); la alerta u oportunidad
        // apoyada en un hecho sin fuente se etiqueta como señal pendiente.
        let ajustadosVerif = 0;
        {
          const estadoByOrig = new Map<number, string>(hechosAll.map((h: any) => [Number(h._oi ?? -1), String(h.estado)]));
          const PEND = new Set(["sin_verificar", "cita_no_literal"]);
          const apoyoPendiente = (idxs: any): number | null => {
            if (!Array.isArray(idxs)) return null;
            for (const i of idxs) { if (PEND.has(estadoByOrig.get(Number(i)) ?? "")) return Number(i); }
            return null;
          };
          if (Array.isArray(brief.acciones)) brief.acciones = brief.acciones.map((a: any) => {
            const oi = apoyoPendiente(a?.se_apoya_en);
            if (oi == null || /verific/i.test(String(a?.accion ?? ""))) return a;
            const hRef = hechosAll.find((h: any) => Number(h._oi) === oi);
            ajustadosVerif++;
            return { ...a, accion: `Verificar primero el hecho pendiente ("${cutWord(String(hRef?.hecho ?? "el hecho señalado"), 90)}"): localizar la fuente real y, solo si se confirma, publicar la versión oficial en los canales propios.`, rol: a.rol ?? "Comunicación" };
          });
          const psa = (brief as any).portada_se_apoya_en ?? {};
          const marcaPendiente = (t: string) => `${t.replace(/[\s.]+$/, "")} (señal pendiente de verificación: sin fuente en las respuestas de las IAs).`;
          if (brief.alerta && apoyoPendiente(psa.alerta) != null && !/verific|pendiente/i.test(String(brief.alerta))) { brief.alerta = marcaPendiente(String(brief.alerta)); ajustadosVerif++; }
          if (brief.oportunidad && apoyoPendiente(psa.oportunidad) != null && !/verific|pendiente/i.test(String(brief.oportunidad))) { brief.oportunidad = marcaPendiente(String(brief.oportunidad)); ajustadosVerif++; }
          if (ajustadosVerif > 0) console.log(`[client-weekly-report] regla de oro ampliada: ${ajustadosVerif} elemento(s) convertidos/etiquetados por apoyarse en hechos pendientes (${client.ticker})`);
        }
        (brief as any)._ajustados_verif = ajustadosVerif;
        // 3) Acciones
        const validCodes = new Set(["RIXC", ...METRICS.map((m) => m.code)]);
        // Plazos normalizados a tres valores fijos
        const normPlazo = (p: any): string | null => {
          const s = stripAcc(String(p ?? "").toLowerCase());
          if (!s) return null;
          if (s.includes("dos semanas") || s.includes("2 semanas") || s.includes("15 dias") || s.includes("quincena")) return "2 semanas";
          if (s.includes("semana")) return "Esta semana";
          if (s.includes("mes") || s.includes("30 dias")) return "1 mes";
          return String(p);
        };
        const actions = (Array.isArray(brief.acciones) ? brief.acciones : []).slice(0, 3).map((a: any, i: number) => {
          const metrica = validCodes.has(String(a.metrica ?? "").toUpperCase()) ? String(a.metrica).toUpperCase() : "RIXC";
          const vh = metricNow(metrica);
          return { idx: i + 1, accion: cutWord(String(a.accion ?? ""), 240), rol: a.rol ?? null, plazo: normPlazo(a.plazo), metrica, valor_hoy: metrica === "RIXC" ? fmt1(vh) : fmt0(vh) };
        });
        for (const a of actions) {
          await db.from("premium_report_actions").upsert({
            client_id: client.id, week_start: weekStart, idx: a.idx,
            accion: a.accion, rol: a.rol, plazo: a.plazo, metrica: a.metrica,
            valor_al_emitir: metricNow(a.metrica),
          }, { onConflict: "client_id,week_start,idx" }).then(() => {}, (e: any) => console.error("actions upsert", e?.message));
        }
        // 4) Competidores: solo miembros del grupo
        brief.competidores = (Array.isArray(brief.competidores) ? brief.competidores : [])
          .filter((c2: any) => c2.tk !== client.ticker && groupSet.has(c2.tk));

        // ---- Consenso de la semana ----
        const consR = await db.from("rix_consensus_weekly").select("week, payload").eq("ticker", client.ticker).eq("source", "raw")
          .lte("week", weekStart).order("week", { ascending: false }).limit(1);
        const consensus = Array.isArray(consR?.data) && consR.data[0] ? consR.data[0].payload : null;

        // ---- Pregunta del protocolo (extracto parametrizado, idéntica para los 6) ----
        const protocolQuestion = `"Eres ANALISTA DE REPUTACIÓN CORPORATIVA senior especializado en monitoreo de marca para comités de dirección. MISIÓN: Analizar EXHAUSTIVAMENTE TODAS las menciones sobre ${issuer.issuer_name} (${client.ticker}) durante el periodo ESPECÍFICO ${prevWeek ?? ""} a ${weekStart}. SOLO menciones con fechas exactas dentro del periodo; sin historia genérica ni información fuera de ventana; rastreo obligatorio de prensa, reguladores, redes y foros." (Extracto del protocolo determinista RepIndex v2; el texto completo, con sus reglas de temporalidad y fuentes, es idéntico para los 6 modelos cada domingo.)`;

        // v20: formato español también en la sección de auditoría (cargada antes del agente)
        if (verif) for (const r of [...verif.claims, ...verif.ficha]) { r.claim = comaNarr(String(r.claim ?? "")); if (r.accion) r.accion = comaNarr(String(r.accion)); }

        // v21: etiquetas por modelo para "Por qué ha cambiado" — cuántas invenciones
        // le marca la auditoría y si citó alguna fuente esta semana
        {
          const invByModel = new Map<string, number>();
          for (const c of inventadasAud) if (c.model) invByModel.set(String(c.model), (invByModel.get(String(c.model)) ?? 0) + 1);
          for (const r of modelRows) {
            (r as any).aud_inv = invByModel.get(r.model) ?? 0;
            (r as any).sin_fuentes = !citations.items.some((it: any) => (it.models ?? []).includes(r.model));
          }
        }

        // v22: radar del emisor — ¿recogen ya las IAs los temas activos de la ficha?
        // v22.1: sin falsos positivos — el tema solo está "detectado" si TODAS
        // sus palabras distintivas (8+ letras) aparecen en el material; palabras
        // genéricas sueltas ("presidente", "quirón") ya no bastan.
        const temasRadar = temasActivos.slice(0, 3).map((tema: string) => {
          const toks = [...goldTokens(tema, new Set<string>())].filter((t) => !/^\d+$/.test(t));
          const fuertes = toks.filter((t) => t.length >= 8);
          const base = fuertes.length ? fuertes : toks;
          return { tema, detectado: base.length > 0 && base.every((t) => allMaterial.includes(t)) };
        });

        const ctx = {
          clientName: client.client_name, contactName: client.contact_name,
          issuerName: issuer.issuer_name, ticker: client.ticker, weekLabel, weekStart,
          brief, citations, consensus, protocolQuestion, verif, temasRadar,
          grupo: { label: groupLabel, n: groupN, ranking, selfSeries, avgSeries },
          yo: { rixc_x: selfRow.rixc_x, delta: selfRow.delta, rank: selfRow.rank, rank_prev: selfRow.rank_prev, sig, rango: (selfRow.rix_max ?? 0) - (selfRow.rix_min ?? 0), rix_min: selfRow.rix_min, rix_max: selfRow.rix_max },
          metricRows, modelRows, prevActions, actions,
        };

        const pdfBytes = buildBriefPdf(ctx);

        const path = `${weekStart}/${client.ticker}-${weekStart}${testMode ? "-TEST" : ""}.pdf`;
        const { error: upErr } = await db.storage.from("client-reports").upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });
        if (upErr) throw new Error(`Storage: ${upErr.message}`);
        const { data: signed, error: sErr } = await db.storage.from("client-reports").createSignedUrl(path, 60 * 60 * 24 * 30);
        if (sErr || !signed?.signedUrl) throw new Error(`Signed URL: ${sErr?.message}`);

        // En test, se puede pasar test_recipients para enviar la revisión a más
        // de un buzón (solo aplica con test_mode; por defecto, solo al admin).
        const testTargets: Array<{ email: string; name: string | null }> =
          Array.isArray(body.test_recipients) && body.test_recipients.length
            ? body.test_recipients.map((e: any) => ({ email: String(e), name: null }))
            : [{ email: ADMIN_EMAIL, name: client.contact_name ?? null }];
        const targets = testMode ? testTargets : recipients;
        // v21: el asunto lleva el dato ("baja 6,3 puntos, 3º de 4")
        const dSubj = selfRow.delta == null ? null : Number(selfRow.delta);
        const deltaPhrase = dSubj == null ? "" : Math.abs(dSubj) < 0.05 ? "sin cambios" : `${dSubj > 0 ? "sube" : "baja"} ${coma(Math.abs(dSubj).toFixed(1))} puntos`;
        const rankPhrase = selfRow.rank != null ? `${selfRow.rank}º de ${groupN}` : "";
        const subjDato = [deltaPhrase, rankPhrase].filter(Boolean).join(", ");
        const subjectLine = `📊 ${issuer.issuer_name} · ${subjDato ? `${subjDato} · ` : ""}Briefing RepIndex · ${weekLabel}${testMode ? " [TEST]" : ""}`;
        const sentOk: string[] = []; const sendErrs: string[] = [];
        for (const t of targets) {
          const { error: mErr } = await resend.emails.send({
            from: "RepIndex <no-reply@repindex.ai>",
            to: [t.email], bcc: [BCC],
            subject: subjectLine,
            html: emailCard({ ...ctx, contactName: t.name }, signed.signedUrl),
          });
          if (mErr) sendErrs.push(`${t.email}: ${(mErr as any).message ?? "error"}`); else sentOk.push(t.email);
          await new Promise((r) => setTimeout(r, 140));
        }
        if (!sentOk.length) throw new Error(`Resend: ningun envio OK (${sendErrs.join("; ").slice(0, 300)})`);

        await db.from("premium_report_sends").insert({
          client_id: client.id, ticker: client.ticker, week_start: weekStart,
          pdf_path: path, pdf_signed_url: signed.signedUrl, emails_sent: sentOk,
          test_mode: testMode, status: "sent",
          error_message: sendErrs.length ? `fallos parciales: ${sendErrs.join("; ").slice(0, 400)}` : null,
        });
        results.push({ client: client.client_name, ok: true, ms: Date.now() - t0, pdf: path, emails: sentOk, grupo: groupLabel, retirados_regla_oro: retiradosAud || undefined, ajustados_verificacion: ajustadosVerif || undefined, fallos: sendErrs.length || undefined });
      } catch (e: any) {
        console.error(`[client-weekly-report] ${client.client_name}:`, e?.message ?? e);
        await db.from("premium_report_sends").insert({
          client_id: client.id, ticker: client.ticker, week_start: weekStart,
          test_mode: testMode, status: "error", error_message: String(e?.message ?? e).slice(0, 500),
        }).then(() => {}, () => {});
        results.push({ client: client.client_name, error: String(e?.message ?? e) });
      }
    }

    const errors = results.filter((r) => r.error);
    if (errors.length && !testMode) {
      await resend.emails.send({
        from: "RepIndex <no-reply@repindex.ai>", to: [ADMIN_EMAIL], bcc: [BCC],
        subject: `⚠️ Informes premium — ${errors.length} cliente(s) con error`,
        html: `<p>Fallos en la generacion de informes premium (${weekLabel}):</p><ul>` +
          errors.map((e) => `<li><b>${esc(e.client)}</b>: ${esc(e.error)}</li>`).join("") +
          `</ul><p>El watchdog reintentara; si persiste, revisar logs de client-weekly-report.</p>`,
      }).catch(() => {});
    }
    return new Response(JSON.stringify({ ok: errors.length === 0, week: weekStart, processed: results.length, results }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[client-weekly-report] fatal:", e?.message ?? e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e), results }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
