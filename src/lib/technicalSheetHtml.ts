/**
 * Technical/Methodology Sheet for PDF Exports
 * Adds legal-style fine print with complete methodology at the end of all reports
 */

export interface TechnicalSheetOptions {
  companyName?: string;
  ticker?: string;
  periodFrom?: string;
  periodTo?: string;
  rixScore?: number;
  flags?: string[];
  modelsUsed?: string[];
  userQuestion?: string;
  perspective?: string;
  observationsCount?: number;
  elaborationDate?: string;
}

/**
 * CSS styles for the technical sheet section
 * Designed to render in small print like legal contract clauses
 */
export const technicalSheetStyles = `
  /* ===========================================
     TECHNICAL SHEET - LEGAL FINE PRINT STYLES
     =========================================== */
  .technical-sheet {
    margin-top: 60px;
    padding-top: 24px;
    border-top: 2px solid #e5e7eb;
    font-size: 9px;
    color: #536471;
    line-height: 1.4;
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .technical-sheet-header {
    text-align: center;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #8899a6;
    margin-bottom: 20px;
    padding-bottom: 12px;
    border-bottom: 1px dashed #d1d5db;
  }

  .technical-sheet-subheader {
    text-align: center;
    font-size: 8px;
    color: #8899a6;
    margin-top: -16px;
    margin-bottom: 20px;
  }

  .technical-sheet h4 {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #0f1419;
    margin-top: 16px;
    margin-bottom: 6px;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 4px;
  }

  .technical-sheet p {
    margin: 6px 0;
    text-align: justify;
  }

  .technical-sheet table {
    width: 100%;
    font-size: 8px;
    border-collapse: collapse;
    margin: 8px 0;
  }

  .technical-sheet th {
    padding: 4px 8px;
    border: 1px solid #e5e7eb;
    text-align: left;
    background: #f0f4f8;
    font-weight: 600;
    color: #536471;
  }

  .technical-sheet td {
    padding: 4px 8px;
    border: 1px solid #e5e7eb;
    text-align: left;
  }

  .technical-sheet .disclaimer-box {
    background: #f7f9fa;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 12px;
    margin-top: 16px;
  }

  .technical-sheet .disclaimer-box p {
    margin: 4px 0;
  }

  .technical-sheet .two-column {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-top: 12px;
  }

  .technical-sheet .column-box {
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    padding: 8px;
  }

  .technical-sheet .column-box h5 {
    font-size: 8px;
    font-weight: 700;
    text-transform: uppercase;
    margin-bottom: 6px;
    color: #0f1419;
  }

  .technical-sheet .column-box.valid h5 {
    color: #059669;
  }

  .technical-sheet .column-box.invalid h5 {
    color: #dc2626;
  }

  .technical-sheet .column-box ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .technical-sheet .column-box li {
    font-size: 8px;
    padding: 2px 0;
  }

  .technical-sheet .formula {
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    background: #f0f4f8;
    padding: 2px 6px;
    border-radius: 2px;
  }

  .technical-sheet .report-specific {
    background: rgba(26, 115, 232, 0.05);
    border: 1px solid rgba(26, 115, 232, 0.2);
    border-radius: 4px;
    padding: 8px;
    margin-bottom: 12px;
  }

  .technical-sheet .report-specific h4 {
    border: none;
    color: #1a73e8;
    margin-top: 0;
  }

  /* ===========================================
     REPORT HEADER CARD STYLES
     =========================================== */
  .report-header-card {
    background: #f5f5f5;
    border-left: 3px solid #1a73e8;
    padding: 12px 16px;
    margin-bottom: 24px;
    font-size: 13px;
    line-height: 1.7;
    color: #333;
    border-radius: 0 6px 6px 0;
  }

  .report-header-card .header-row {
    margin: 2px 0;
  }

  .report-header-card .header-label {
    font-weight: 700;
    color: #0f1419;
  }

  .report-header-card .header-separator {
    color: #9ca3af;
    margin: 0 6px;
  }

  @media print {
    .technical-sheet {
      page-break-before: always;
      font-size: 7pt;
    }
    
    .technical-sheet table {
      font-size: 6.5pt;
    }
    
    .technical-sheet h4 {
      font-size: 7.5pt;
    }

    .report-header-card {
      font-size: 10pt;
    }
  }
`;

/**
 * Generates the HTML content for the technical methodology sheet
 * @param options - Optional parameters to customize the sheet for specific reports
 */
export function generateTechnicalSheetHtml(options?: TechnicalSheetOptions): string {
  const currentYear = new Date().getFullYear();
  
  // Report-specific section (only if company data is provided)
  const reportSpecificSection = options?.companyName ? `
    <div class="report-specific">
      <h4>Datos del Informe</h4>
      <table>
        <tr>
          <td><strong>Empresa analizada:</strong></td>
          <td>${options.companyName}</td>
          <td><strong>RIX Score:</strong></td>
          <td>${options.rixScore !== undefined ? options.rixScore.toFixed(1) : 'N/A'}</td>
        </tr>
        ${options.periodFrom && options.periodTo ? `
        <tr>
          <td><strong>Período:</strong></td>
          <td>${options.periodFrom} a ${options.periodTo}</td>
          <td><strong>Flags:</strong></td>
          <td>${options.flags?.length ? options.flags.join(', ') : 'Ninguno'}</td>
        </tr>
        ` : ''}
        ${options.modelsUsed?.length ? `
        <tr>
          <td><strong>Modelos consultados:</strong></td>
          <td colspan="3">${options.modelsUsed.join(', ')}</td>
        </tr>
        ` : ''}
      </table>
    </div>
  ` : '';

  return `
    <div class="technical-sheet">
      <div class="technical-sheet-header">
        ANEXO TÉCNICO-METODOLÓGICO
      </div>
      <div class="technical-sheet-subheader">
        RepIndex® AI Corporate Reputation Authority — Versión ORG_RIXSchema_V2
      </div>

      ${reportSpecificSection}

      <h4>Definición del Índice</h4>
      <p>
        El RIX (Reputation Index) mide la <strong>PERCEPCIÓN ALGORÍTMICA</strong> de la reputación corporativa: 
        cómo los principales sistemas de inteligencia artificial describen y evalúan a una empresa cuando son 
        consultados por usuarios. <em>No es un índice de reputación real tradicional</em> (encuestas, stakeholders), 
        sino un indicador de cómo las IAs más utilizadas del mundo (~1.8B consultas/mes) proyectan la imagen corporativa.
      </p>

      <h4>Universo de Análisis (Censo, no muestra)</h4>
      <p>
        <strong>174 empresas</strong> (100% mercado cotizado español): IBEX-35 (35), IBEX Medium Cap (20), 
        IBEX Small Cap (30), principales no cotizadas (89). Frecuencia: semanal (52 observaciones/año/empresa). 
        Total anual: ~54,000 observaciones (174 empresas × 6 modelos × 52 semanas).
      </p>

      <h4>Fuentes de Datos: 6 Modelos con Búsqueda Web Real</h4>
      <table>
        <thead>
          <tr>
            <th>Modelo</th>
            <th>Proveedor</th>
            <th>Método de Grounding</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>GPT-4.1</td>
            <td>OpenAI</td>
            <td>Web Search Preview</td>
          </tr>
          <tr>
            <td>Gemini 2.5 Pro</td>
            <td>Google</td>
            <td>Google Search Grounding</td>
          </tr>
          <tr>
            <td>Perplexity Sonar</td>
            <td>Perplexity AI</td>
            <td>Búsqueda nativa + citaciones</td>
          </tr>
          <tr>
            <td>DeepSeek Chat</td>
            <td>DeepSeek + Tavily</td>
            <td>RAG con Tavily API</td>
          </tr>
          <tr>
            <td>Grok-3</td>
            <td>xAI</td>
            <td>Live Search + X/Twitter</td>
          </tr>
          <tr>
            <td>Qwen Max</td>
            <td>Alibaba</td>
            <td>DashScope Web Search</td>
          </tr>
        </tbody>
      </table>
      <p>✅ 100% de los modelos acceden a Internet en tiempo real. Las URLs citadas son verificables externamente.</p>

      <h4>Sistema de Métricas (8 dimensiones) — Glosario Canónico</h4>
      <table>
        <thead>
          <tr>
            <th>Métrica</th>
            <th>Peso</th>
            <th>Nombre Técnico → Ejecutivo</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>NVM</strong></td>
            <td>15%</td>
            <td>Narrative Value Metric → Calidad de la Narrativa: coherencia del discurso, nivel de controversia, afirmaciones verificables</td>
          </tr>
          <tr>
            <td><strong>DRM</strong></td>
            <td>15%</td>
            <td>Data Reliability Metric → Fortaleza de Evidencia: calidad de fuentes primarias, corroboración, trazabilidad documental</td>
          </tr>
          <tr>
            <td><strong>SIM</strong></td>
            <td>12%</td>
            <td>Source Integrity Metric → Autoridad de Fuentes: jerarquía de fuentes (T1: reguladores/financieros → T4: opinión/redes)</td>
          </tr>
          <tr>
            <td><strong>RMM</strong></td>
            <td>12%</td>
            <td>Reputational Momentum Metric → Actualidad y Empuje: frescura temporal de menciones dentro de ventana analizada</td>
          </tr>
          <tr>
            <td><strong>CEM</strong></td>
            <td>12%</td>
            <td>Controversy Exposure Metric → Gestión de Controversias: exposición a riesgos (inverso: 100=sin controversias)</td>
          </tr>
          <tr>
            <td><strong>GAM</strong></td>
            <td>12%</td>
            <td>Governance Autonomy Metric → Percepción de Gobierno: señales de independencia y buenas prácticas de gobernanza</td>
          </tr>
          <tr>
            <td><strong>DCM</strong></td>
            <td>12%</td>
            <td>Data Consistency Metric → Coherencia Informativa: consistencia de información entre diferentes modelos de IA</td>
          </tr>
          <tr>
            <td><strong>CXM</strong></td>
            <td>10%</td>
            <td>Corporate Execution Metric → Ejecución Corporativa: percepción de ejecución en mercado, cotización bursátil (solo cotizadas)</td>
          </tr>
        </tbody>
      </table>
      <p>Fórmula: <span class="formula">RIX = Σ(métrica × peso) / Σ(pesos)</span>. Si CXM no aplica, pesos se redistribuyen proporcionalmente.</p>
      <p style="font-size: 7px; color: #9ca3af; margin-top: 8px;">
        ⚠️ NOTA: SIM mide jerarquía de fuentes, NO sostenibilidad. DRM mide calidad de evidencia, NO desempeño financiero. DCM mide coherencia entre IAs, NO innovación digital.
      </p>

      <h4>Control de Calidad: Flags Automáticos</h4>
      <p>
        El sistema detecta automáticamente: <strong>pocas_fechas</strong> (&lt;3 fechas verificables) | 
        <strong>sin_fuentes</strong> (sin URLs citadas) | <strong>datos_antiguos</strong> (&lt;50% en ventana temporal) | 
        <strong>respuesta_corta</strong> (&lt;2,000 tokens) | <strong>alto_riesgo</strong> (CEM &lt;40) | 
        <strong>drm_bajo</strong>/<strong>sim_bajo</strong> (fiabilidad comprometida).
      </p>
      <p>
        <strong>Penalizaciones:</strong> Si DRM &lt;40 o SIM &lt;40 → RIX máximo = 64 | Si datos_antiguos → RMM máximo = 69
      </p>

      <h4>Garantías de Reproducibilidad</h4>
      <p>
        <strong>Ejecución:</strong> API machine-to-machine (sin interfaz de usuario) | 
        <strong>Frecuencia:</strong> Semanal (domingos, 52 ciclos/año) | 
        <strong>Prompt:</strong> Estructurado e invariable | 
        <strong>Temperatura:</strong> 0 (determinismo máximo). 
        Esta arquitectura elimina sesgos por contexto, usuario o historial de conversación.
      </p>

      <h4>Capa de Razonamiento Conversacional</h4>
      <p>
        Las respuestas analíticas que el sistema entrega al usuario se generan a partir 
        de un DataPack pre-computado (datos de los 6 modelos, agregados, divergencias y 
        métricas) sobre el que opera un modelo de razonamiento. Esta capa es independiente 
        de la captura semanal: no introduce datos nuevos, solo interpreta los ya recogidos.
      </p>
      <table>
        <thead>
          <tr>
            <th>Componente</th>
            <th>Valor</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Modelo primario</td>
            <td>OpenAI <span class="formula">o3-2025-04-16</span> (reasoning effort: medium)</td>
          </tr>
          <tr>
            <td>Modelo de fallback</td>
            <td>Google <span class="formula">gemini-2.5-pro</span></td>
          </tr>
          <tr>
            <td>Activación del fallback</td>
            <td>Clave OpenAI ausente, error en el stream o respuesta vacía del primario</td>
          </tr>
          <tr>
            <td>Temperatura</td>
            <td>0</td>
          </tr>
          <tr>
            <td>Límite de salida</td>
            <td>32.000 tokens por respuesta</td>
          </tr>
        </tbody>
      </table>

      <h4>Trazabilidad de la Respuesta</h4>
      <p>
        Cada respuesta expone, en sus cabeceras HTTP (vía CORS), los siguientes campos 
        de auditoría que permiten verificar qué modelo respondió y si se activó el fallback:
      </p>
      <table>
        <thead>
          <tr>
            <th>Cabecera</th>
            <th>Significado</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><span class="formula">x-rix-engine-version</span></td>
            <td>Versión del motor conversacional (actual: <span class="formula">v2</span>)</td>
          </tr>
          <tr>
            <td><span class="formula">x-rix-model-requested</span></td>
            <td>Modelo solicitado por la aplicación</td>
          </tr>
          <tr>
            <td><span class="formula">x-rix-model-effective</span></td>
            <td>Modelo que efectivamente generó la respuesta</td>
          </tr>
          <tr>
            <td><span class="formula">x-rix-fallback</span></td>
            <td>
              <span class="formula">none</span> si respondió el primario; 
              identificador del fallback en caso contrario
            </td>
          </tr>
        </tbody>
      </table>

      <h4>Control de Sesgo: Divergencia Inter-modelo</h4>
      <p>
        La divergencia (σ) entre 6 modelos independientes es una medida de incertidumbre epistémica. 
        <strong>σ &lt;5:</strong> consenso robusto | <strong>σ 5-15:</strong> narrativa estable | 
        <strong>σ &gt;15:</strong> alta incertidumbre. Modelos con diferentes datasets, arquitecturas y 
        proveedores que coinciden generan señal robusta.
      </p>

      <h4>Incertidumbre Intermodelo (±X)</h4>
      <p>
        El valor ±X que acompaña al RIX mediano representa la dispersión aproximada entre los 6 modelos 
        de IA consultados, calculada como <span class="formula">rango / 4</span> (donde rango = RIX máximo − RIX mínimo). 
        No es un intervalo de confianza estadístico clásico (que requeriría una muestra mayor), sino una medida 
        práctica de la concordancia entre modelos. Un valor bajo (<strong>±3 o menos</strong>) indica alto consenso; 
        un valor alto (<strong>±8 o más</strong>) indica fuerte desacuerdo entre IAs y mayor incertidumbre en la estimación.
      </p>

      <h4>Variables de Contraste (Validación Empírica)</h4>
      <p>
        El sistema recoge variables empíricas para calibración: 
        <strong>precio de cierre semanal</strong> (133 cotizadas, fuente: EODHD) y 
        <strong>volumen de menciones Tier-1</strong> (proxy: NVM agregado). 
        La ponderación actual es criterio experto; evolucionará según evidencia estadística.
      </p>

      <h4>Jerarquía de Fuentes (SIM)</h4>
      <p>
        <strong>Tier 1 (45%):</strong> CNMV, SEC, Reuters, Bloomberg, FT, WSJ, Expansión, Cinco Días, casas de análisis | 
        <strong>Tier 2 (30%):</strong> Generalistas referencia (El País, El Mundo) | 
        <strong>Tier 3 (15%):</strong> Especializados verificados | 
        <strong>Tier 4 (10%):</strong> Opinión, redes sociales, foros.
      </p>

      <h4>Filosofía del Radar Reputacional</h4>
      <p>
        RepIndex no mide la reputación tradicional. Mide la <strong>probabilidad de que una narrativa 
        gane tracción en el ecosistema informativo algorítmico</strong>.
      </p>
      <p>
        En ${currentYear}, las IAs son el primer filtro cognitivo. El primer punto de contacto reputacional. 
        El lugar donde se decide qué es relevante, creíble o dudoso. La reputación ya no se pierde en una 
        portada: se pierde cuando un modelo deja de confiar en tu narrativa.
      </p>
      <p>
        RepIndex detecta anomalías semánticas cuando aún no hay titulares, trending topics ni caídas 
        bursátiles. Solo hay una grieta en el relato algorítmico. Esta es la <strong>ventaja estratégica</strong>: 
        anticiparse a la reputación antes de que exista.
      </p>
      <p style="font-style: italic; color: #6b7280;">
        "RepIndex no pregunta qué opinan las personas; pregunta qué dirían las IAs si alguien 
        consultara ahora mismo sobre esta empresa."
      </p>

      <div class="disclaimer-box">
        <h4 style="border: none; margin-top: 0;">Limitaciones Metodológicas</h4>
        <p>(1) El RIX mide percepción algorítmica, no reputación real. (2) Las IAs pueden heredar sesgos de sus datos de entrenamiento. (3) La cobertura depende de la visibilidad mediática. (4) No sustituye estudios de stakeholders (encuestas, NPS). (5) No debe usarse como única fuente para decisiones de M&A, inversión regulada o ESG certificado.</p>
        <p style="margin-top: 8px;">(6) La ponderación actual (NVM 15%, DRM 15%, etc.) es criterio experto inicial. (7) La calibración empírica RIX vs. métricas de negocio está en desarrollo (dataset longitudinal en construcción).</p>
        <p style="margin-top: 8px;"><strong>DISCLAIMER LEGAL:</strong> Este informe refleja la percepción de sistemas de IA y no constituye asesoramiento financiero, legal o de inversión. Las fuentes citadas son responsabilidad de los modelos de IA. RepIndex no garantiza la exactitud de las citas externas.</p>
      </div>

      <div class="two-column">
        <div class="column-box valid">
          <h5>✅ Usos Válidos</h5>
          <ul>
            <li>• Monitoreo narrativa IA</li>
            <li>• War room reputacional</li>
            <li>• Benchmark sectorial</li>
            <li>• Detección temprana de crisis</li>
            <li>• Comunicación estratégica</li>
          </ul>
        </div>
        <div class="column-box invalid">
          <h5>❌ Usos No Recomendados</h5>
          <ul>
            <li>• Decisiones de M&A</li>
            <li>• Inversión regulada</li>
            <li>• Due diligence legal</li>
            <li>• ESG certificado</li>
            <li>• Rating crediticio</li>
          </ul>
        </div>
      </div>

      <p style="text-align: center; margin-top: 20px; font-size: 7px; color: #9ca3af;">
        © ${currentYear} RepIndex® — repindex.ai — Anexo técnico generado automáticamente
      </p>
    </div>
  `;
}

/**
 * Generates the HTML for the Report Header Card (Ficha de Cabecera)
 * to be placed at the top of PDF/HTML exports, before the report content.
 */
export function generateReportHeaderCardHtml(options?: TechnicalSheetOptions): string {
  if (!options?.companyName && !options?.userQuestion) return '';

  const rows: string[] = [];

  if (options.userQuestion) {
    rows.push(`<div class="header-row"><span class="header-label">Consulta:</span> ${options.userQuestion}</div>`);
  }

  if (options.companyName) {
    let line = `<span class="header-label">Empresa:</span> ${options.companyName}`;
    if (options.ticker) {
      line += `<span class="header-separator">|</span><span class="header-label">Ticker:</span> ${options.ticker}`;
    }
    rows.push(`<div class="header-row">${line}</div>`);
  }

  if (options.periodFrom || options.periodTo) {
    const from = options.periodFrom || '–';
    const to = options.periodTo || '–';
    rows.push(`<div class="header-row"><span class="header-label">Período analizado:</span> ${from} – ${to}</div>`);
  }

  if (options.modelsUsed?.length) {
    const n = options.modelsUsed.length;
    rows.push(`<div class="header-row"><span class="header-label">${n === 1 ? 'Modelo consultado' : 'Modelos consultados'}:</span> ${options.modelsUsed.join(', ')} (${n} ${n === 1 ? 'modelo' : 'modelos'})</div>`);
  }

  if (options.observationsCount) {
    rows.push(`<div class="header-row"><span class="header-label">Observaciones:</span> ${options.observationsCount} registros</div>`);
  }

  if (options.perspective) {
    rows.push(`<div class="header-row"><span class="header-label">Perspectiva:</span> ${options.perspective}</div>`);
  }

  if (options.elaborationDate) {
    rows.push(`<div class="header-row"><span class="header-label">Fecha de elaboración:</span> ${options.elaborationDate}</div>`);
  }

  if (rows.length === 0) return '';

  return `<div class="report-header-card">${rows.join('\n')}</div>`;
}
