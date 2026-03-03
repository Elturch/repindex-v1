import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// =============================================================================
// PIPELINE I18N — Static translation dictionary for all user-facing text
// =============================================================================
const PIPELINE_I18N: Record<string, Record<string, string>> = {
  es: {
    // Redirect responses
    agent_identity_answer: `Soy el **Agente Rix**, un analista especializado en reputación algorítmica corporativa.

Mi función es ayudarte a interpretar cómo los principales modelos de inteligencia artificial (ChatGPT, Perplexity, Gemini, DeepSeek, Grok, Qwen) perciben a las empresas españolas y su posicionamiento reputacional.

**Puedo hacer por ti:**
- 📊 Analizar métricas RIX de cualquier empresa
- 🏆 Comparar empresas con su competencia sectorial
- 📈 Detectar tendencias y evolución temporal
- 📋 Generar informes ejecutivos para comité de dirección

¿Sobre qué empresa o sector te gustaría que hiciéramos un análisis?`,
    personal_query_answer: `Mi especialidad es el análisis de reputación **corporativa**, no individual. Analizo cómo las IAs perciben a empresas como entidades, no a personas físicas.

Sin embargo, si estás vinculado a una empresa específica, puedo analizar cómo la percepción del liderazgo afecta a la reputación corporativa de esa organización.

**¿Te gustaría que analizara la reputación corporativa de alguna empresa en particular?**`,
    off_topic_answer: `Esa pregunta está fuera de mi especialización. Como Agente Rix, me centro exclusivamente en el **análisis de reputación algorítmica corporativa**.

**Lo que sí puedo ofrecerte:**
- 📊 Análisis de cualquier empresa del IBEX-35 o del ecosistema español
- 🏆 Comparativas sectoriales y benchmarking competitivo
- 📈 Detección de tendencias y alertas reputacionales
- 📋 Informes ejecutivos sobre la percepción en IAs

¿Hay alguna empresa o sector que te interese analizar?`,
    test_limits_answer: `Soy el Agente Rix, un analista de reputación corporativa. Mi función es ayudarte a entender cómo las IAs perciben a las empresas españolas.

¿En qué empresa o sector te gustaría que nos centráramos?`,
    // Suggested questions
    analyze_company: "Analiza la reputación de {company}",
    analyze_short: "Analiza {company}",
    top5_ibex: "Top 5 empresas del IBEX-35 esta semana",
    sector_comparison: "Comparativa del sector Banca",
    leadership_perception: "¿Cómo se percibe el liderazgo de {company}?",
    sector_reputation: "Reputación del sector Tecnología",
    energy_ranking: "Ranking del sector Energía",
    top10_week: "Top 10 empresas esta semana",
    telecom_comparison: "Comparativa sector Telecomunicaciones",
    // Bulletin
    bulletin_welcome: `¡Perfecto! 📋 Puedo generar un **boletín ejecutivo** completo para cualquier empresa de nuestra base de datos.

**¿De qué empresa quieres el boletín?**

Escribe el nombre de la empresa (por ejemplo: Telefónica, Inditex, Repsol, BBVA, Iberdrola...) y generaré un análisis detallado incluyendo:

- 📊 **RIX Score** por cada modelo de IA (ChatGPT, Perplexity, Gemini, DeepSeek)
- 🏆 **Comparativa** con competidores del mismo sector
- 📈 **Tendencia** de las últimas 4 semanas
- 💡 **Conclusiones** y recomendaciones

El boletín estará listo para **descargar o imprimir** en formato profesional.`,
    bulletin_suggest: "Genera un boletín de {company}",
    // Company not found
    company_not_found: `No encontré la empresa "{query}" en nuestra base de datos de RepIndex.

**Puedes intentar con:**
- El nombre oficial de la empresa (ej: "Telefónica" en vez de "Movistar")
- El ticker bursátil (ej: "TEF", "SAN", "ITX")

**Empresas disponibles incluyen:** {examples}`,
    // Post-bulletin suggestions
    bulletin_post_suggest: "Genera un boletín de {company}",
    bulletin_post_compare: "¿Cómo se compara {company} con el sector {sector}?",
    bulletin_post_top5: "Top 5 empresas del sector {sector}",
    // Pericial follow-ups
    pericial_q1: "¿Qué divergencias existen entre los modelos de IA en la evaluación de esta empresa?",
    pericial_q2: "¿Hay evolución temporal documentada que muestre deterioro reputacional antes y después de algún evento?",
    pericial_q3: "¿Qué métricas presentan mayor exposición a narrativas de riesgo con valor probatorio?",
    // Depth prompt section headers
    depth_format_title: "FORMATO: INFORME ANALÍTICO — Estructura anclada en datos SQL",
    depth_executive_summary: "RESUMEN EJECUTIVO",
    depth_section_data: "LOS DATOS",
    depth_section_analysis: "EL ANÁLISIS",
    depth_section_actions: "ACCIONES BASADAS EN DATOS",
    depth_closing: "CIERRE — FUENTES Y METODOLOGÍA",
    depth_headline_diagnosis: "Titular-Diagnóstico",
    depth_3kpis: "3 KPIs con Delta",
    depth_3findings: "3 Hallazgos",
    depth_verdict: "Veredicto",
    depth_6ai_vision: "Visión de las 6 IAs",
    depth_8metrics: "Las 8 Métricas",
    depth_model_divergence: "Divergencia entre Modelos",
    depth_evolution: "Evolución Temporal",
    depth_competitive: "Contexto Competitivo",
    depth_recommendations: "Recomendaciones Basadas en Datos",
    // Fallback questions
    fallback_ceo_q1: "¿Cuáles son los 3 riesgos reputacionales más urgentes?",
    fallback_ceo_q2: "¿Cómo estamos vs la competencia directa?",
    fallback_ceo_q3: "¿Qué decisiones debería considerar?",
    fallback_journalist_q1: "¿Qué empresa tiene la historia más noticiable esta semana?",
    fallback_journalist_q2: "¿Hay alguna controversia emergente?",
    fallback_journalist_q3: "¿Qué titular propones para esta información?",
    fallback_analyst_q1: "¿Hay correlación entre RIX y cotización?",
    fallback_analyst_q2: "¿Qué señales técnicas detectas?",
    fallback_analyst_q3: "Comparativa detallada del sector",
    fallback_investor_q1: "¿Pasa esta empresa el filtro reputacional?",
    fallback_investor_q2: "¿Cuál es el nivel de riesgo ESG?",
    fallback_investor_q3: "¿Es buen momento para entrar?",
    fallback_default_q1: "¿Puedes profundizar más?",
    fallback_default_q2: "¿Cómo se compara con competidores?",
    fallback_default_q3: "¿Cuál es la tendencia?",
  },
  en: {
    agent_identity_answer: `I'm **Agent Rix**, an analyst specialized in corporate algorithmic reputation.

My role is to help you understand how the leading AI models (ChatGPT, Perplexity, Gemini, DeepSeek, Grok, Qwen) perceive Spanish companies and their reputational positioning.

**I can help you with:**
- 📊 Analyzing RIX metrics for any company
- 🏆 Comparing companies against their sector competitors
- 📈 Detecting trends and temporal evolution
- 📋 Generating executive reports for board meetings

Which company or sector would you like me to analyze?`,
    personal_query_answer: `My specialty is **corporate** reputation analysis, not individual. I analyze how AIs perceive companies as entities, not individuals.

However, if you're associated with a specific company, I can analyze how leadership perception affects that organization's corporate reputation.

**Would you like me to analyze the corporate reputation of a specific company?**`,
    off_topic_answer: `That question falls outside my area of expertise. As Agent Rix, I focus exclusively on **corporate algorithmic reputation analysis**.

**What I can offer you:**
- 📊 Analysis of any IBEX-35 company or the Spanish ecosystem
- 🏆 Sector comparisons and competitive benchmarking
- 📈 Trend detection and reputational alerts
- 📋 Executive reports on AI perception

Is there a company or sector you'd like me to analyze?`,
    test_limits_answer: `I'm Agent Rix, a corporate reputation analyst. My role is to help you understand how AIs perceive Spanish companies.

Which company or sector would you like to focus on?`,
    analyze_company: "Analyze {company}'s reputation",
    analyze_short: "Analyze {company}",
    top5_ibex: "Top 5 IBEX-35 companies this week",
    sector_comparison: "Banking sector comparison",
    leadership_perception: "How is {company}'s leadership perceived?",
    sector_reputation: "Technology sector reputation",
    energy_ranking: "Energy sector ranking",
    top10_week: "Top 10 companies this week",
    telecom_comparison: "Telecom sector comparison",
    bulletin_welcome: `Great! 📋 I can generate a complete **executive bulletin** for any company in our database.

**Which company do you want the bulletin for?**

Type the company name (e.g., Telefónica, Inditex, Repsol, BBVA, Iberdrola...) and I'll generate a detailed analysis including:

- 📊 **RIX Score** for each AI model (ChatGPT, Perplexity, Gemini, DeepSeek)
- 🏆 **Comparison** with sector competitors
- 📈 **Trend** over the last 4 weeks
- 💡 **Conclusions** and recommendations

The bulletin will be ready to **download or print** in professional format.`,
    bulletin_suggest: "Generate a bulletin for {company}",
    company_not_found: `I couldn't find the company "{query}" in our RepIndex database.

**You can try:**
- The official company name (e.g., "Telefónica" instead of "Movistar")
- The stock ticker (e.g., "TEF", "SAN", "ITX")

**Available companies include:** {examples}`,
    bulletin_post_suggest: "Generate a bulletin for {company}",
    bulletin_post_compare: "How does {company} compare to the {sector} sector?",
    bulletin_post_top5: "Top 5 companies in the {sector} sector",
    pericial_q1: "What divergences exist between AI models in evaluating this company?",
    pericial_q2: "Is there documented temporal evolution showing reputational deterioration before and after any event?",
    pericial_q3: "Which metrics show the greatest exposure to risk narratives with evidentiary value?",
    depth_format_title: "FORMAT: ANALYTICAL REPORT — Structure anchored in SQL data",
    depth_executive_summary: "EXECUTIVE SUMMARY",
    depth_section_data: "THE DATA",
    depth_section_analysis: "THE ANALYSIS",
    depth_section_actions: "DATA-DRIVEN ACTIONS",
    depth_closing: "CLOSING — SOURCES AND METHODOLOGY",
    depth_headline_diagnosis: "Headline Diagnosis",
    depth_3kpis: "3 KPIs with Delta",
    depth_3findings: "3 Findings",
    depth_verdict: "Verdict",
    depth_6ai_vision: "Vision of the 6 AIs",
    depth_8metrics: "The 8 Metrics",
    depth_model_divergence: "Model Divergence",
    depth_evolution: "Temporal Evolution",
    depth_competitive: "Competitive Context",
    depth_recommendations: "Data-Driven Recommendations",
    // Fallback questions
    fallback_ceo_q1: "What are the 3 most urgent reputational risks?",
    fallback_ceo_q2: "How are we doing vs direct competition?",
    fallback_ceo_q3: "What decisions should I consider?",
    fallback_journalist_q1: "Which company has the most newsworthy story this week?",
    fallback_journalist_q2: "Is there an emerging controversy?",
    fallback_journalist_q3: "What headline do you suggest for this information?",
    fallback_analyst_q1: "Is there a correlation between RIX and stock price?",
    fallback_analyst_q2: "What technical signals do you detect?",
    fallback_analyst_q3: "Detailed sector comparison",
    fallback_investor_q1: "Does this company pass the reputational filter?",
    fallback_investor_q2: "What is the ESG risk level?",
    fallback_investor_q3: "Is it a good time to invest?",
    fallback_default_q1: "Can you go deeper?",
    fallback_default_q2: "How does it compare to competitors?",
    fallback_default_q3: "What's the trend?",
  },
  fr: {
    agent_identity_answer: `Je suis l'**Agent Rix**, un analyste spécialisé en réputation algorithmique d'entreprise.

Mon rôle est de vous aider à comprendre comment les principaux modèles d'IA (ChatGPT, Perplexity, Gemini, DeepSeek, Grok, Qwen) perçoivent les entreprises espagnoles et leur positionnement réputationnel.

**Je peux vous aider à :**
- 📊 Analyser les métriques RIX de toute entreprise
- 🏆 Comparer les entreprises avec leurs concurrents sectoriels
- 📈 Détecter les tendances et l'évolution temporelle
- 📋 Générer des rapports exécutifs pour les comités de direction

Quelle entreprise ou quel secteur souhaitez-vous analyser ?`,
    personal_query_answer: `Ma spécialité est l'analyse de réputation **d'entreprise**, pas individuelle. J'analyse la perception des entreprises par les IA, pas des personnes physiques.

Cependant, si vous êtes lié à une entreprise spécifique, je peux analyser comment la perception du leadership affecte la réputation de cette organisation.

**Souhaitez-vous que j'analyse la réputation d'une entreprise en particulier ?**`,
    off_topic_answer: `Cette question est en dehors de mon domaine d'expertise. En tant qu'Agent Rix, je me concentre exclusivement sur l'**analyse de réputation algorithmique d'entreprise**.

**Ce que je peux vous offrir :**
- 📊 Analyse de toute entreprise de l'IBEX-35 ou de l'écosystème espagnol
- 🏆 Comparaisons sectorielles et benchmarking concurrentiel
- 📈 Détection de tendances et alertes réputationnelles
- 📋 Rapports exécutifs sur la perception IA

Y a-t-il une entreprise ou un secteur que vous aimeriez analyser ?`,
    test_limits_answer: `Je suis l'Agent Rix, un analyste de réputation d'entreprise. Mon rôle est de vous aider à comprendre comment les IA perçoivent les entreprises espagnoles.

Sur quelle entreprise ou quel secteur souhaitez-vous vous concentrer ?`,
    analyze_company: "Analyser la réputation de {company}",
    analyze_short: "Analyser {company}",
    top5_ibex: "Top 5 entreprises IBEX-35 cette semaine",
    sector_comparison: "Comparaison du secteur bancaire",
    leadership_perception: "Comment le leadership de {company} est-il perçu ?",
    sector_reputation: "Réputation du secteur technologie",
    energy_ranking: "Classement du secteur énergie",
    top10_week: "Top 10 entreprises cette semaine",
    telecom_comparison: "Comparaison secteur télécommunications",
    bulletin_welcome: `Parfait ! 📋 Je peux générer un **bulletin exécutif** complet pour toute entreprise de notre base de données.

**Pour quelle entreprise souhaitez-vous le bulletin ?**

Écrivez le nom de l'entreprise et je générerai une analyse détaillée incluant :

- 📊 **Score RIX** par modèle d'IA
- 🏆 **Comparaison** avec les concurrents du secteur
- 📈 **Tendance** des 4 dernières semaines
- 💡 **Conclusions** et recommandations`,
    bulletin_suggest: "Générer un bulletin pour {company}",
    company_not_found: `Je n'ai pas trouvé l'entreprise « {query} » dans notre base de données RepIndex.

**Vous pouvez essayer avec :**
- Le nom officiel de l'entreprise
- Le ticker boursier (ex : "TEF", "SAN", "ITX")

**Les entreprises disponibles incluent :** {examples}`,
    bulletin_post_suggest: "Générer un bulletin pour {company}",
    bulletin_post_compare: "Comment {company} se compare-t-elle au secteur {sector} ?",
    bulletin_post_top5: "Top 5 entreprises du secteur {sector}",
    pericial_q1: "Quelles divergences existent entre les modèles d'IA dans l'évaluation de cette entreprise ?",
    pericial_q2: "Y a-t-il une évolution temporelle documentée montrant une détérioration réputationnelle ?",
    pericial_q3: "Quelles métriques présentent la plus grande exposition aux narratifs de risque ?",
    depth_format_title: "FORMAT : RAPPORT ANALYTIQUE — Structure ancrée dans les données SQL",
    depth_executive_summary: "RÉSUMÉ EXÉCUTIF",
    depth_section_data: "LES DONNÉES",
    depth_section_analysis: "L'ANALYSE",
    depth_section_actions: "ACTIONS BASÉES SUR LES DONNÉES",
    depth_closing: "CLÔTURE — SOURCES ET MÉTHODOLOGIE",
    depth_headline_diagnosis: "Diagnostic-titre",
    depth_3kpis: "3 KPI avec Delta",
    depth_3findings: "3 Constats",
    depth_verdict: "Verdict",
    depth_6ai_vision: "Vision des 6 IA",
    depth_8metrics: "Les 8 Métriques",
    depth_model_divergence: "Divergence entre modèles",
    depth_evolution: "Évolution Temporelle",
    depth_competitive: "Contexte Concurrentiel",
    depth_recommendations: "Recommandations Basées sur les Données",
    // Fallback questions
    fallback_ceo_q1: "Quels sont les 3 risques réputationnels les plus urgents ?",
    fallback_ceo_q2: "Comment nous situons-nous par rapport à la concurrence directe ?",
    fallback_ceo_q3: "Quelles décisions devrais-je considérer ?",
    fallback_journalist_q1: "Quelle entreprise a l'histoire la plus médiatique cette semaine ?",
    fallback_journalist_q2: "Y a-t-il une controverse émergente ?",
    fallback_journalist_q3: "Quel titre proposez-vous pour cette information ?",
    fallback_analyst_q1: "Y a-t-il une corrélation entre le RIX et le cours de l'action ?",
    fallback_analyst_q2: "Quels signaux techniques détectez-vous ?",
    fallback_analyst_q3: "Comparaison détaillée du secteur",
    fallback_investor_q1: "Cette entreprise passe-t-elle le filtre réputationnel ?",
    fallback_investor_q2: "Quel est le niveau de risque ESG ?",
    fallback_investor_q3: "Est-ce le bon moment pour investir ?",
    fallback_default_q1: "Pouvez-vous approfondir ?",
    fallback_default_q2: "Comment se compare-t-elle aux concurrents ?",
    fallback_default_q3: "Quelle est la tendance ?",
  },
  pt: {
    agent_identity_answer: `Sou o **Agente Rix**, um analista especializado em reputação algorítmica corporativa.

A minha função é ajudá-lo a interpretar como os principais modelos de IA (ChatGPT, Perplexity, Gemini, DeepSeek, Grok, Qwen) percebem as empresas espanholas e o seu posicionamento reputacional.

**Posso ajudá-lo com:**
- 📊 Analisar métricas RIX de qualquer empresa
- 🏆 Comparar empresas com a sua concorrência setorial
- 📈 Detetar tendências e evolução temporal
- 📋 Gerar relatórios executivos para conselho de administração

Que empresa ou setor gostaria de analisar?`,
    personal_query_answer: `A minha especialidade é a análise de reputação **corporativa**, não individual. Analiso como as IAs percebem empresas como entidades, não pessoas físicas.

No entanto, se estiver vinculado a uma empresa específica, posso analisar como a perceção da liderança afeta a reputação corporativa dessa organização.

**Gostaria que analisasse a reputação corporativa de alguma empresa em particular?**`,
    off_topic_answer: `Essa pergunta está fora da minha especialização. Como Agente Rix, concentro-me exclusivamente na **análise de reputação algorítmica corporativa**.

**O que posso oferecer:**
- 📊 Análise de qualquer empresa do IBEX-35 ou do ecossistema espanhol
- 🏆 Comparações setoriais e benchmarking competitivo
- 📈 Deteção de tendências e alertas reputacionais
- 📋 Relatórios executivos sobre a perceção nas IAs

Há alguma empresa ou setor que gostaria de analisar?`,
    test_limits_answer: `Sou o Agente Rix, um analista de reputação corporativa. A minha função é ajudá-lo a compreender como as IAs percebem as empresas espanholas.

Em que empresa ou setor gostaria de nos concentrarmos?`,
    analyze_company: "Analise a reputação de {company}",
    analyze_short: "Analise {company}",
    top5_ibex: "Top 5 empresas do IBEX-35 esta semana",
    sector_comparison: "Comparação do setor bancário",
    leadership_perception: "Como é percebida a liderança de {company}?",
    sector_reputation: "Reputação do setor tecnologia",
    energy_ranking: "Ranking do setor energia",
    top10_week: "Top 10 empresas esta semana",
    telecom_comparison: "Comparação setor telecomunicações",
    bulletin_welcome: `Perfeito! 📋 Posso gerar um **boletim executivo** completo para qualquer empresa da nossa base de dados.

**De que empresa quer o boletim?**

Escreva o nome da empresa e gerarei uma análise detalhada incluindo:

- 📊 **Score RIX** por modelo de IA
- 🏆 **Comparação** com concorrentes do setor
- 📈 **Tendência** das últimas 4 semanas
- 💡 **Conclusões** e recomendações`,
    bulletin_suggest: "Gerar um boletim de {company}",
    company_not_found: `Não encontrei a empresa "{query}" na nossa base de dados RepIndex.

**Pode tentar com:**
- O nome oficial da empresa
- O ticker bolsista (ex: "TEF", "SAN", "ITX")

**As empresas disponíveis incluem:** {examples}`,
    bulletin_post_suggest: "Gerar um boletim de {company}",
    bulletin_post_compare: "Como se compara {company} com o setor {sector}?",
    bulletin_post_top5: "Top 5 empresas do setor {sector}",
    pericial_q1: "Que divergências existem entre os modelos de IA na avaliação desta empresa?",
    pericial_q2: "Há evolução temporal documentada que mostre deterioração reputacional antes e depois de algum evento?",
    pericial_q3: "Que métricas apresentam maior exposição a narrativas de risco com valor probatório?",
    depth_format_title: "FORMATO: RELATÓRIO ANALÍTICO — Estrutura ancorada em dados SQL",
    depth_executive_summary: "RESUMO EXECUTIVO",
    depth_section_data: "OS DADOS",
    depth_section_analysis: "A ANÁLISE",
    depth_section_actions: "AÇÕES BASEADAS EM DADOS",
    depth_closing: "ENCERRAMENTO — FONTES E METODOLOGIA",
    depth_headline_diagnosis: "Diagnóstico-Título",
    depth_3kpis: "3 KPIs com Delta",
    depth_3findings: "3 Descobertas",
    depth_verdict: "Veredito",
    depth_6ai_vision: "Visão das 6 IAs",
    depth_8metrics: "As 8 Métricas",
    depth_model_divergence: "Divergência entre Modelos",
    depth_evolution: "Evolução Temporal",
    depth_competitive: "Contexto Competitivo",
    depth_recommendations: "Recomendações Baseadas em Dados",
    // Fallback questions
    fallback_ceo_q1: "Quais são os 3 riscos reputacionais mais urgentes?",
    fallback_ceo_q2: "Como estamos em relação à concorrência direta?",
    fallback_ceo_q3: "Que decisões deveria considerar?",
    fallback_journalist_q1: "Que empresa tem a história mais noticiável esta semana?",
    fallback_journalist_q2: "Há alguma controvérsia emergente?",
    fallback_journalist_q3: "Que título propõe para esta informação?",
    fallback_analyst_q1: "Há correlação entre RIX e cotação?",
    fallback_analyst_q2: "Que sinais técnicos deteta?",
    fallback_analyst_q3: "Comparação detalhada do setor",
    fallback_investor_q1: "Esta empresa passa o filtro reputacional?",
    fallback_investor_q2: "Qual é o nível de risco ESG?",
    fallback_investor_q3: "É bom momento para investir?",
    fallback_default_q1: "Pode aprofundar mais?",
    fallback_default_q2: "Como se compara com concorrentes?",
    fallback_default_q3: "Qual é a tendência?",
  },
};

/**
 * Translation helper with variable interpolation.
 * Falls back to English, then Spanish if key not found.
 */
function t(lang: string, key: string, vars?: Record<string, string>): string {
  const dict = PIPELINE_I18N[lang] || PIPELINE_I18N["en"] || PIPELINE_I18N["es"];
  let text = dict[key] || PIPELINE_I18N["en"]?.[key] || PIPELINE_I18N["es"]?.[key] || key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, v);
    }
  }
  return text;
}

// In-memory cache for company data
let companiesCache: any[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// =============================================================================
// API USAGE LOGGING HELPER
// =============================================================================
interface ApiUsageParams {
  supabaseClient: any;
  edgeFunction: string;
  provider: string;
  model: string;
  actionType: string;
  inputTokens: number;
  outputTokens: number;
  userId?: string | null;
  sessionId?: string;
  metadata?: Record<string, any>;
}

async function logApiUsage(params: ApiUsageParams): Promise<void> {
  try {
    // Fetch cost config
    const { data: costConfig } = await params.supabaseClient
      .from("api_cost_config")
      .select("input_cost_per_million, output_cost_per_million")
      .eq("provider", params.provider)
      .eq("model", params.model)
      .single();

    // Calculate estimated cost
    let estimatedCost = 0;
    if (costConfig) {
      const inputCost = (params.inputTokens / 1000000) * costConfig.input_cost_per_million;
      const outputCost = (params.outputTokens / 1000000) * costConfig.output_cost_per_million;
      estimatedCost = inputCost + outputCost;
    }

    // Insert log
    const { error } = await params.supabaseClient.from("api_usage_logs").insert({
      edge_function: params.edgeFunction,
      provider: params.provider,
      model: params.model,
      action_type: params.actionType,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      estimated_cost_usd: estimatedCost,
      user_id: params.userId || null,
      session_id: params.sessionId || null,
      metadata: params.metadata || {},
    });

    if (error) {
      console.warn("Failed to log API usage:", error.message);
    }
  } catch (e) {
    console.warn("Error in logApiUsage:", e);
  }
}

// =============================================================================
// UNIFIED RIX DATA HELPER - Solo rix_runs_v2 (fuente única de verdad)
// =============================================================================
// Fase 1 (2026-02-19): Desconectado rix_runs (legacy). Solo V2 para eliminar
// contaminación de esquemas incompatibles (rix_runs no tiene respuesta_bruto_grok
// ni respuesta_bruto_qwen). rix_runs sigue existiendo en BD por si se necesita.
interface FetchUnifiedRixOptions {
  supabaseClient: any;
  columns: string;
  tickerFilter?: string | string[];
  limit?: number;
  offset?: number;
  logPrefix?: string;
}

async function fetchUnifiedRixData(options: FetchUnifiedRixOptions): Promise<any[]> {
  const { supabaseClient, columns, tickerFilter, limit = 1000, offset = 0, logPrefix = "[V2-RIX]" } = options;

  // Solo rix_runs_v2 — sin deduplicación, sin contaminación de esquemas legacy
  let query = supabaseClient
    .from("rix_runs_v2")
    .select(columns)
    .or("analysis_completed_at.not.is.null,09_rix_score.not.is.null")
    .order("batch_execution_date", { ascending: false })
    .order('"05_ticker"', { ascending: true });

  // Filtro por ticker
  if (tickerFilter) {
    if (Array.isArray(tickerFilter)) {
      query = query.in('"05_ticker"', tickerFilter);
    } else {
      query = query.eq('"05_ticker"', tickerFilter);
    }
  }

  // Límite / paginación — SIEMPRE usar .range() para evitar el límite silencioso de
  // 1000 filas de PostgREST que ignora cualquier .limit(N>1000) sin range.
  // 5 domingos × ~1.050 registros = ~5.250 → effectiveLimit = 5.500 cubre todo.
  const effectiveLimit = Math.max(limit, 5500);
  query = query.range(offset, offset + effectiveLimit - 1);

  const { data, error } = await query;
  if (error) console.error(`${logPrefix} Error fetching rix_runs_v2:`, error.message);
  console.log(`${logPrefix} V2-only: ${data?.length || 0} records`);

  return data || [];
}

// =============================================================================
// VERIFIED SOURCE EXTRACTOR - Only ChatGPT (utm_source=openai) and Perplexity
// =============================================================================
// CRITICAL: Other models (Gemini, DeepSeek, Grok, Qwen) are IGNORED because
// they may contain fabricated/hallucinated URLs.
//
// TEMPORAL CLASSIFICATION:
// - 'window': Sources within the analysis period (period_from to period_to)
// - 'reinforcement': Historical/contextual sources used by AIs
// - 'unknown': Cannot determine temporal category

interface VerifiedSource {
  url: string;
  domain: string;
  title?: string;
  sourceModel: "ChatGPT" | "Perplexity";
  citationNumber?: number;
  temporalCategory: "window" | "reinforcement" | "unknown";
  extractedDate?: string;
}

// Spanish month names for date extraction
const SPANISH_MONTHS: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
};

/**
 * Extract dates from text near a URL position (within ~200 chars).
 */
function extractNearestDate(text: string, urlPosition: number): Date | null {
  const start = Math.max(0, urlPosition - 200);
  const end = Math.min(text.length, urlPosition + 200);
  const context = text.slice(start, end);

  const dates: { date: Date; distance: number }[] = [];

  // Pattern 1: "DD de MES de AAAA" (Spanish full date)
  const fullDatePattern =
    /(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+de\s+(\d{4})/gi;
  let match;
  while ((match = fullDatePattern.exec(context)) !== null) {
    const day = parseInt(match[1], 10);
    const month = SPANISH_MONTHS[match[2].toLowerCase()];
    const year = parseInt(match[3], 10);
    if (month !== undefined && year >= 2020 && year <= 2030) {
      dates.push({
        date: new Date(year, month, day),
        distance: Math.abs(match.index - (urlPosition - start)),
      });
    }
  }

  // Pattern 2: "MES de AAAA" or "MES AAAA"
  const monthYearPattern =
    /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(\d{4})/gi;
  while ((match = monthYearPattern.exec(context)) !== null) {
    const month = SPANISH_MONTHS[match[1].toLowerCase()];
    const year = parseInt(match[2], 10);
    if (month !== undefined && year >= 2020 && year <= 2030) {
      dates.push({
        date: new Date(year, month, 15),
        distance: Math.abs(match.index - (urlPosition - start)),
      });
    }
  }

  if (dates.length === 0) return null;
  dates.sort((a, b) => a.distance - b.distance);
  return dates[0].date;
}

/**
 * Classify a source temporally based on extracted date and analysis period.
 */
function classifyTemporally(
  extractedDate: Date | null,
  periodFrom: Date | null,
  periodTo: Date | null,
): "window" | "reinforcement" | "unknown" {
  if (!extractedDate) return "unknown";
  if (!periodFrom || !periodTo) return "unknown";

  // Extend window by 3 days on each side
  const windowStart = new Date(periodFrom);
  windowStart.setDate(windowStart.getDate() - 3);
  const windowEnd = new Date(periodTo);
  windowEnd.setDate(windowEnd.getDate() + 3);

  if (extractedDate >= windowStart && extractedDate <= windowEnd) {
    return "window";
  } else if (extractedDate < periodFrom) {
    return "reinforcement";
  }
  return "unknown";
}

function extractVerifiedSources(
  chatGptRaw: string | null,
  perplexityRaw: string | null,
  periodFrom: string | null = null,
  periodTo: string | null = null,
): VerifiedSource[] {
  const sources: VerifiedSource[] = [];
  const periodFromDate = periodFrom ? new Date(periodFrom) : null;
  const periodToDate = periodTo ? new Date(periodTo) : null;

  // Extract ChatGPT sources (only with utm_source=openai)
  if (chatGptRaw) {
    const chatGptPattern = /\[([^\]]+)\]\((https?:\/\/[^)]+utm_source=openai[^)]*)\)/g;
    let match;
    while ((match = chatGptPattern.exec(chatGptRaw)) !== null) {
      const title = match[1].trim();
      const url = match[2].trim();
      const urlPosition = match.index;
      try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.replace(/^www\./, "");
        if (!sources.some((s) => s.url === url)) {
          const extractedDate = extractNearestDate(chatGptRaw, urlPosition);
          const temporalCategory = classifyTemporally(extractedDate, periodFromDate, periodToDate);
          sources.push({
            url,
            domain,
            title: title || undefined,
            sourceModel: "ChatGPT",
            temporalCategory,
            extractedDate: extractedDate?.toISOString(),
          });
        }
      } catch {
        /* Invalid URL */
      }
    }
  }

  // Extract Perplexity sources
  if (perplexityRaw) {
    // Try JSON parsing first
    try {
      const parsed = JSON.parse(perplexityRaw);
      if (parsed.citations && Array.isArray(parsed.citations)) {
        parsed.citations.forEach((citation: string, index: number) => {
          if (citation && citation.startsWith("http")) {
            try {
              const urlObj = new URL(citation);
              const domain = urlObj.hostname.replace(/^www\./, "");
              if (!sources.some((s) => s.url === citation)) {
                sources.push({
                  url: citation,
                  domain,
                  sourceModel: "Perplexity",
                  citationNumber: index + 1,
                  temporalCategory: "unknown", // JSON structure doesn't provide date context
                });
              }
            } catch {
              /* Invalid URL */
            }
          }
        });
      }
    } catch {
      /* Not JSON, try regex */
    }

    // Markdown links from Perplexity
    const markdownPattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
    let match;
    while ((match = markdownPattern.exec(perplexityRaw)) !== null) {
      const title = match[1].trim();
      const url = match[2].trim();
      const urlPosition = match.index;
      if (sources.some((s) => s.url === url)) continue;
      if (url.includes("perplexity.ai")) continue;
      try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.replace(/^www\./, "");
        const extractedDate = extractNearestDate(perplexityRaw, urlPosition);
        const temporalCategory = classifyTemporally(extractedDate, periodFromDate, periodToDate);
        sources.push({
          url,
          domain,
          title: title || undefined,
          sourceModel: "Perplexity",
          temporalCategory,
          extractedDate: extractedDate?.toISOString(),
        });
      } catch {
        /* Invalid URL */
      }
    }
  }

  return sources;
}

function extractSourcesFromRixData(rixData: any[]): VerifiedSource[] {
  const allSources: VerifiedSource[] = [];

  for (const run of rixData) {
    const sources = extractVerifiedSources(
      run["20_res_gpt_bruto"] ?? null,
      run["21_res_perplex_bruto"] ?? null,
      run["06_period_from"] ?? null,
      run["07_period_to"] ?? null,
    );
    allSources.push(...sources);
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  return allSources.filter((source) => {
    if (seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });
}

// =============================================================================
// SSE STREAMING HELPERS
// =============================================================================

type SSEEventType = "start" | "chunk" | "metadata" | "done" | "error" | "fallback";

interface SSEEvent {
  type: SSEEventType;
  text?: string;
  metadata?: Record<string, unknown>;
  suggestedQuestions?: string[];
  drumrollQuestion?: DrumrollQuestion | null;
  error?: string;
}

function createSSEEncoder() {
  const encoder = new TextEncoder();
  return (event: SSEEvent): Uint8Array => {
    const data = JSON.stringify(event);
    return encoder.encode(`data: ${data}\n\n`);
  };
}

// Stream OpenAI response with SSE
async function* streamOpenAIResponse(
  messages: { role: string; content: string }[],
  model: string,
  maxTokens: number,
  logPrefix: string,
  timeout: number = 120000,
): AsyncGenerator<{
  type: "chunk" | "done" | "error";
  text?: string;
  inputTokens?: number;
  outputTokens?: number;
  finishReason?: string;
  error?: string;
}> {
  const openAIApiKey = Deno.env.get("OPENAI_API_KEY");

  if (!openAIApiKey) {
    yield { type: "error", error: "OpenAI API key not configured" };
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    console.log(`${logPrefix} Starting OpenAI stream (${model})...`);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAIApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        max_completion_tokens: maxTokens,
        stream: true,
        stream_options: { include_usage: true },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${logPrefix} OpenAI stream error:`, response.status, errorText);
      yield { type: "error", error: `OpenAI error: ${response.status}` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: "error", error: "No response body" };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let lastFinishReason = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data === "[DONE]") {
            yield { type: "done", inputTokens: totalInputTokens, outputTokens: totalOutputTokens, finishReason: lastFinishReason };
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              yield { type: "chunk", text: content };
            }

            // Capture finish_reason for truncation detection
            const fr = parsed.choices?.[0]?.finish_reason;
            if (fr) lastFinishReason = fr;

            // Capture usage from final chunk if available
            if (parsed.usage) {
              totalInputTokens = parsed.usage.prompt_tokens || 0;
              totalOutputTokens = parsed.usage.completion_tokens || 0;
            }
          } catch {
            // Ignore parse errors for incomplete chunks
          }
        }
      }
    }

    yield { type: "done", inputTokens: totalInputTokens, outputTokens: totalOutputTokens, finishReason: lastFinishReason };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      console.warn(`${logPrefix} OpenAI stream timeout`);
      yield { type: "error", error: "OpenAI timeout" };
    } else {
      console.error(`${logPrefix} OpenAI stream error:`, error);
      yield { type: "error", error: error.message || "Unknown error" };
    }
  }
}

// Stream Gemini response with SSE
async function* streamGeminiResponse(
  messages: { role: string; content: string }[],
  model: string,
  maxTokens: number,
  logPrefix: string,
  timeout: number = 120000,
): AsyncGenerator<{
  type: "chunk" | "done" | "error";
  text?: string;
  inputTokens?: number;
  outputTokens?: number;
  finishReason?: string;
  error?: string;
}> {
  const geminiApiKey = Deno.env.get("GOOGLE_GEMINI_API_KEY");

  if (!geminiApiKey) {
    yield { type: "error", error: "Gemini API key not configured" };
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    console.log(`${logPrefix} Starting Gemini stream (${model})...`);

    // Convert messages to Gemini format
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const systemInstruction = messages.find((m) => m.role === "system")?.content;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
          generationConfig: { maxOutputTokens: maxTokens },
        }),
        signal: controller.signal,
      },
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${logPrefix} Gemini stream error:`, response.status, errorText);
      yield { type: "error", error: `Gemini error: ${response.status}` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: "error", error: "No response body" };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let lastFinishReason = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Gemini streams as NDJSON-like format
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "[" || trimmed === "]" || trimmed === ",") continue;

        // Clean up JSON array markers
        let jsonStr = trimmed;
        if (jsonStr.startsWith(",")) jsonStr = jsonStr.slice(1);
        if (jsonStr.startsWith("[")) jsonStr = jsonStr.slice(1);
        if (jsonStr.endsWith(",")) jsonStr = jsonStr.slice(0, -1);
        if (jsonStr.endsWith("]")) jsonStr = jsonStr.slice(0, -1);

        if (!jsonStr.trim()) continue;

        try {
          const parsed = JSON.parse(jsonStr);
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            yield { type: "chunk", text };
          }

          // Capture finish reason for truncation detection
          const fr = parsed.candidates?.[0]?.finishReason;
          if (fr) lastFinishReason = fr === "MAX_TOKENS" ? "length" : fr.toLowerCase();

          // Capture usage metadata
          if (parsed.usageMetadata) {
            totalInputTokens = parsed.usageMetadata.promptTokenCount || 0;
            totalOutputTokens = parsed.usageMetadata.candidatesTokenCount || 0;
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    yield { type: "done", inputTokens: totalInputTokens, outputTokens: totalOutputTokens, finishReason: lastFinishReason };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      console.warn(`${logPrefix} Gemini stream timeout`);
      yield { type: "error", error: "Gemini timeout" };
    } else {
      console.error(`${logPrefix} Gemini stream error:`, error);
      yield { type: "error", error: error.message || "Unknown error" };
    }
  }
}

// =============================================================================
// COMPLIANCE GATE: Forbidden Pattern Detection & Stripping
// =============================================================================
// Robust normalization + expanded semantic families for forbidden patterns.
// Detects AI hallucinations about "saving reports to folders", "exceeding
// platform limits", or inventing file systems. Applied AFTER NFD normalization.

/**
 * Normalize text for compliance matching: lowercase, strip diacritics,
 * collapse whitespace, normalize quotes/symbols.
 */
function normalizeForCompliance(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[""«»]/g, '"')
    .replace(/['']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Patterns are written to match NFD-normalized (accent-free) text
const FORBIDDEN_PATTERNS: RegExp[] = [
  // === Family: "limite" / "longitud" / "capacidad" / "excede" ===
  /la\s+respuesta\s+(?:completa\s+)?supera\s+el\s+limite/,
  /supera\s+el\s+limite\s+(?:maximo|tecnico)/,
  /limite\s+maximo\s+permitido/,
  /limite\s+tecnico\s+de\s+entrega/,
  /la\s+respuesta[\s\S]{0,120}?limite[\s\S]{0,120}?(?:plataforma|entrega)/,
  /supera\s+(?:el\s+)?(?:maximo\s+de\s+)?longitud/,
  /longitud\s+maxima\s+(?:permitida|de\s+respuesta)/,
  /maximo\s+de\s+longitud\s+permitido/,
  /excede\s+(?:el\s+)?(?:limite|longitud|maximo)/,
  /supera\s+(?:la\s+)?capacidad\s+(?:de\s+)?(?:esta\s+)?plataforma/,
  /(?:response|output)\s+(?:exceeds?|too\s+long|limit)/,
  /the\s+response\s+exceeds/,
  // === Family: external file/folder/save hallucinations ===
  /documento\s+aparte/,
  /carpeta\s+segura/,
  /\/informes[_\-]?rix\//,
  /informes[_\s\-]?rix/,
  /te\s+lo\s+deje\s+guardado/,
  /lo\s+he\s+dejado\s+en/,
  /he\s+generado\s+el\s+informe.*en\s+un\s+documento/,
  /generado.*documento\s+aparte/,
  /dejado\s+(?:guardado|almacenado)\s+en/,
  /saved?\s+(?:it\s+)?(?:to|in)\s+(?:a\s+)?(?:secure\s+)?folder/,
  // === Family: promises of external delivery ===
  /exportar.*secciones\s+concretas/,
  /las\s+transcribo\s+aqui\s+mismo/,
  /(?:adjunto|archivo|fichero)\s+(?:separado|externo|adicional)/,
  /(?:te\s+envio|te\s+mando|te\s+remito)\s+(?:el\s+)?(?:informe|documento|archivo)/,
  /puedes?\s+descargar(?:lo)?\s+(?:desde|en)/,
  // === Family: meta-commentary about response delivery ===
  /\[?\s*la\s+respuesta\s+completa\s+se\s+ha\s+entregado/,
  /debido\s+a\s+la\s+longitud.*lectura\s+puede\s+requerir/,
  /si\s+necesita\s+aclaraciones\s+sobre\s+alguna\s+seccion.*profundizare/,
  /siguiendo\s+la\s+estructura.*profundidad\s+requerida/,
  // === Family: "elaboración en progreso" / "próxima respuesta" ===
  /elaboracion\s+en\s+progreso/,
  /se\s+ofrecera\s+en\s+la\s+proxima\s+respuesta/,
  /limite\s+de\s+generacion\s+de\s+esta\s+sesion/,
  /informe\s+supera\s+el\s+limite\s+de\s+generacion/,
   // === Family: content fabrication markers ===
   /para\s+preservar\s+la\s+confidencialidad.*denominaremos/,
   /equipo\s+interfuncional\s+de\s+\d+\s+especialistas/,
   // === Family: consulting jargon fabrication ===
   /pilar\s+\d+\s*[-–—:]\s*[A-ZÁÉÍÓÚÑA-Z]/i,
   /(?:capex|opex)\s+(?:incremental|estimado).*\d+\s*m€/i,
   /van\s+\+?\d+\s*m€/i,
   /simulaciones?\s+monte\s+carlo/i,
   /copula[\s-]t/i,
   /cone\s+of\s+plausibility/i,
   /sandbox\s+(?:etico|regulatorio)/i,
   /tokenizacion\s+de\s+creditos/i,
   /indice\s+(?:propietario|propio)\s+que\s+combina/i,
   /roi\s+estimado\s+\d+\s*%\s+sobre\s+capex/i,
   /se\s+procesaron\s+[\d,.]+\s*(?:m|millones?)\s+de\s+menciones/i,
   /mapeamos\s+\d+\s+stakeholders/i,
   /(?:wacc|ebitda|capex|van|roi|covar)[\s\S]{0,300}(?:wacc|ebitda|capex|van|roi|covar)/i,
   // === Family: fabricated roadmaps, systems, protocols ===
   /roadmap\s+(?:correctivo|estrategico|de\s+mejora)/i,
   /plan\s+de\s+accion\s+(?:ejecutivo|institucional)\s*\(/i,
   /kpi\s+objetivo\s+trim\d/i,
   /(?:sent-shift|crisis-?ops|gitreg|fitch-?bot|glassscan|auto-?publish)/i,
   /cobertura\s+24\s*\/?\s*7\s+de\s+\d+\s+fuentes/i,
   /algoritmo\s+de\s+ponderacion/i,
   /firma\s+pgp/i,
   /checksum\s+md5/i,
   /hash\s+sha-?\d+/i,
   /coef(?:iciente)?\.?\s+\d+[.,]\d+/i,
   /\d+[.,]\d+\s*%\s+de\s+volatilidad/i,
   /brecha\s+\d+\s*-\s*\d+\s*:\s*nucleo\s+causal/i,
   /matriz\s+de\s+severidad/i,
   /storytelling\s+compacto/i,
   /portavocia\s+triple/i,
   /equipo\s+(?:crisis|comunicacion)\s+con\s+sla/i,
    /pillar\s+\d+\s*[-–—:]\s*[A-Z]/i,
    /pilier\s+\d+\s*[-–—:]\s*[A-Z]/i,
    // === Family: fabricated action plans (without parenthesis requirement) ===
    /plan\s+de\s+acci[oó]n\s+institucional/i,
    /plan\s+de\s+acci[oó]n\s+ejecutiv[oa]/i,
    // === Family: stakeholder maps / influence maps ===
    /stakeholder\s+map/i,
    /mapa\s+de\s+influencia/i,
    /nodo\s+institucional/i,
    /patrocinador\s+interno/i,
    /socio\s+externo\s+ancla/i,
    // === Family: fabricated quarterly roadmaps ===
    /hoja\s+de\s+ruta\s+trimestral/i,
    /T[1-4][\s\-]+202[0-5]/i,
    // === Family: consulting KPIs ===
    /share\s+of\s+voice\s+(?:institucional|>=|≥)/i,
    /engagement\s+digital.*ppm/i,
    /secnewgate/i,
    // === Family: fabricated budgets ===
    /presupuesto\s+(?:total\s+)?estimado/i,
    // === Family: fabricated stock/market data ===
    /(?:sabadell|bbva|caixabank|repsol|cellnex|colonial)\s+[+-]\d+\s*%/i,
    /indice:\s*[\d.,]+\s*pts/i,
    /volatilidad\s+impl[ií]cita/i,
    /ratio\s+put\s*\/\s*call/i,
    // === Family: fabricated task forces / training ===
    /task\s+force\s+sectorial/i,
    /formaci[oó]n\s+(?:anual\s+)?de\s+portavoces/i,
    /dashboard\s+reputacional\s+en\s+comit[eé]/i,
    /cisne\s+negro\s+sanitario/i,
    // === Family: fabricated campaigns / certifications ===
     /campa[nñ]a\s+multicanal/i,
     /certificaci[oó]n\s+iso\s+37000/i,
     // === Family: fabricated risk radars / positioning recommendations ===
     /radar\s+de\s+riesgos/i,
     /riesgos?\s+inminentes?/i,
     /recomendaciones?\s+de\s+posicionamiento/i,
     /gravamen\s+fiscal/i,
     /subidas?\s+(?:adicionales?\s+)?del\s+bce/i,
     /investor\s+day/i,
     /campa[nñ]a\s+de\s+verano/i,
     /narrativa\s+fintech/i,
     /compromisos?\s+esg\s+externos?/i,
     /reservas?\s+anticipadas?/i,
];

function findForbiddenMatchIndex(text: string): number {
  const normalized = normalizeForCompliance(text);
  let earliest = -1;
  for (const pattern of FORBIDDEN_PATTERNS) {
    const match = pattern.exec(normalized);
    if (match && match.index !== undefined) {
      // Map back to approximate original position
      const approxOrigIndex = match.index;
      earliest = earliest === -1 ? approxOrigIndex : Math.min(earliest, approxOrigIndex);
    }
  }
  return earliest;
}

function containsForbiddenPattern(text: string): boolean {
  return findForbiddenMatchIndex(text) !== -1;
}

function stripForbiddenContent(text: string): string {
  const matchIndex = findForbiddenMatchIndex(text);
  if (matchIndex === -1) return text;

  const beforeMatch = text.substring(0, matchIndex);
  // Find last clean sentence boundary before the forbidden content
  const lastBoundary = Math.max(
    beforeMatch.lastIndexOf('. '),
    beforeMatch.lastIndexOf('.\n'),
    beforeMatch.lastIndexOf('\n\n'),
    beforeMatch.lastIndexOf('---'),
  );

  if (lastBoundary > text.length * 0.3) {
    return text.substring(0, lastBoundary + 1).trim();
  }

  return beforeMatch.trim();
}

// =============================================================================
// AI FALLBACK HELPER - OpenAI → Gemini
// =============================================================================
interface AICallResult {
  content: string;
  provider: "openai" | "gemini";
  model: string;
  inputTokens: number;
  outputTokens: number;
}

async function callAIWithFallback(
  messages: { role: string; content: string }[],
  model: string,
  maxTokens: number,
  logPrefix: string,
  timeout: number = 120000,
  options?: {
    preferGemini?: boolean;
    geminiTimeout?: number;
  },
): Promise<AICallResult> {
  const openAIApiKey = Deno.env.get("OPENAI_API_KEY");
  const geminiApiKey = Deno.env.get("GOOGLE_GEMINI_API_KEY");

  const preferGemini = options?.preferGemini ?? false;
  const geminiTimeout = options?.geminiTimeout ?? timeout;

  // Model mapping: OpenAI → Gemini equivalent
  const modelMapping: Record<string, string> = {
    o3: "gemini-2.5-flash",
    "gpt-4o-mini": "gemini-2.5-flash-lite",
    "gpt-4o": "gemini-2.5-flash",
  };

  // 1. Try OpenAI first (unless preferGemini)
  if (!preferGemini && openAIApiKey) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      console.log(`${logPrefix} Calling OpenAI (${model})...`);

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAIApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          max_completion_tokens: maxTokens,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const usage = data.usage || {};
        console.log(
          `${logPrefix} OpenAI response received successfully (in: ${usage.prompt_tokens || 0}, out: ${usage.completion_tokens || 0})`,
        );
        return {
          content: data.choices[0].message.content,
          provider: "openai",
          model: model,
          inputTokens: usage.prompt_tokens || 0,
          outputTokens: usage.completion_tokens || 0,
        };
      }

      // Errors that trigger fallback: 429, 500, 502, 503, 504
      if ([429, 500, 502, 503, 504].includes(response.status)) {
        const errorText = await response.text();
        console.warn(`${logPrefix} OpenAI returned ${response.status}, switching to Gemini fallback...`);
        console.warn(`${logPrefix} OpenAI error details: ${errorText.substring(0, 200)}`);
      } else {
        const errorText = await response.text();
        console.error(`${logPrefix} OpenAI API error (${response.status}):`, errorText);
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }
    } catch (error) {
      if (error.name === "AbortError") {
        console.warn(`${logPrefix} OpenAI timeout (${timeout}ms), switching to Gemini fallback...`);
      } else if (error.message?.includes("OpenAI API error")) {
        throw error; // Re-throw non-recoverable errors
      } else {
        console.warn(`${logPrefix} OpenAI network error, switching to Gemini fallback:`, error.message);
      }
    }
  } else {
    if (!preferGemini) {
      console.warn(`${logPrefix} No OpenAI API key, using Gemini directly...`);
    }
  }

  // 2. Fallback to Gemini
  if (!geminiApiKey) {
    throw new Error("Both OpenAI and Gemini API keys are not configured");
  }

  const geminiModel = modelMapping[model] || "gemini-2.5-flash";
  console.log(`${logPrefix} Using Gemini fallback (${geminiModel})...`);

  // Gemini request with timeout (prevents hanging requests that end as client-side "Failed to fetch")
  const geminiController = new AbortController();
  const geminiTimeoutId = setTimeout(() => geminiController.abort(), geminiTimeout);

  const geminiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${geminiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: geminiModel,
      messages,
      max_tokens: maxTokens,
    }),
    signal: geminiController.signal,
  });

  clearTimeout(geminiTimeoutId);

  if (!geminiResponse.ok) {
    const errorText = await geminiResponse.text();
    console.error(`${logPrefix} Gemini API error:`, errorText);
    throw new Error(`Both OpenAI and Gemini failed. Gemini error: ${geminiResponse.statusText}`);
  }

  const geminiData = await geminiResponse.json();
  const geminiUsage = geminiData.usage || {};
  console.log(
    `${logPrefix} Gemini response received successfully (fallback, in: ${geminiUsage.prompt_tokens || 0}, out: ${geminiUsage.completion_tokens || 0})`,
  );

  return {
    content: geminiData.choices[0].message.content,
    provider: "gemini",
    model: geminiModel,
    inputTokens: geminiUsage.prompt_tokens || 0,
    outputTokens: geminiUsage.completion_tokens || 0,
  };
}

// Helper for simpler calls (gpt-4o-mini for questions generation)
async function callAISimple(
  messages: { role: string; content: string }[],
  model: string,
  maxTokens: number,
  logPrefix: string,
): Promise<string | null> {
  try {
    const result = await callAIWithFallback(messages, model, maxTokens, logPrefix, 30000);
    return result.content;
  } catch (error) {
    console.warn(`${logPrefix} AI call failed:`, error.message);
    return null;
  }
}

// =============================================================================
// MULTI-EXPERT PIPELINE (E1-E6) — Replaces monolithic prompt architecture
// =============================================================================

// --- E1: INTENT CLASSIFIER ---
interface ClassifierResult {
  tipo: "empresa" | "sector" | "comparativa" | "metodologia" | "general";
  empresas_detectadas: { ticker: string; nombre: string; confianza: number }[];
  intencion: "diagnostico" | "ranking" | "evolucion" | "metrica_especifica" | "prospectiva" | "general";
  metricas_mencionadas: string[];
  periodo_solicitado: "ultima_semana" | "ultimo_mes" | "custom";
  idioma: "es" | "en";
  requiere_bulletin: boolean;
}

async function runClassifier(
  question: string,
  companiesList: { ticker: string; issuer_name: string; sector_category?: string }[],
  conversationHistory: any[],
  language: string,
  logPrefix: string,
): Promise<ClassifierResult> {
  console.log(`${logPrefix} [E1] Running classifier...`);

  const companiesRef = companiesList
    .slice(0, 200)
    .map((c) => `${c.ticker}:${c.issuer_name}`)
    .join(", ");

  const recentHistory = conversationHistory.slice(-4).map((m) => `${m.role}: ${m.content?.substring(0, 100)}`).join("\n");

  const prompt = `Clasifica esta pregunta sobre reputación corporativa.

EMPRESAS DISPONIBLES: ${companiesRef}

HISTORIAL RECIENTE:
${recentHistory || "(ninguno)"}

PREGUNTA: "${question}"

Responde SOLO con JSON válido (sin markdown):
{
  "tipo": "empresa|sector|comparativa|metodologia|general",
  "empresas_detectadas": [{"ticker":"XXX","nombre":"Nombre","confianza":0.9}],
  "intencion": "diagnostico|ranking|evolucion|metrica_especifica|prospectiva|general",
  "metricas_mencionadas": [],
  "periodo_solicitado": "ultima_semana|ultimo_mes|custom",
  "idioma": "${language}",
  "requiere_bulletin": false
}

REGLAS:
- Solo detecta empresas que EXISTAN en la lista. No inventes.
- confianza: 1.0 = mención explícita, 0.8 = referencia indirecta, 0.5 = ambigua
- requiere_bulletin: true solo si pide "boletín", "informe completo" o "bulletin"
- Si la pregunta es genérica (metodología, qué es RepIndex, etc.), tipo="general"`;

  try {
    const result = await callAISimple(
      [
        { role: "system", content: "Clasificador de intención para sistema de reputación corporativa. Responde SOLO en JSON válido sin bloques de código." },
        { role: "user", content: prompt },
      ],
      "gpt-4o-mini",
      400,
      `${logPrefix} [E1]`,
    );

    if (result) {
      const clean = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(clean) as ClassifierResult;
      console.log(`${logPrefix} [E1] Classified: tipo=${parsed.tipo}, empresas=${parsed.empresas_detectadas.length}, intencion=${parsed.intencion}`);
      return parsed;
    }
  } catch (e) {
    console.warn(`${logPrefix} [E1] Classifier failed, using fallback:`, e);
  }

  // Fallback: use legacy regex detection
  const legacyDetected = detectCompaniesInQuestion(question, companiesList);
  return {
    tipo: legacyDetected.length > 0 ? "empresa" : "general",
    empresas_detectadas: legacyDetected.map((c) => ({ ticker: c.ticker, nombre: c.issuer_name, confianza: 0.7 })),
    intencion: "diagnostico",
    metricas_mencionadas: [],
    periodo_solicitado: "ultima_semana",
    idioma: language as "es" | "en",
    requiere_bulletin: /bolet[ií]n|bulletin|informe completo/i.test(question),
  };
}

// --- E2: SQL DATAPACK (Deterministic, no LLM) ---
interface DataPack {
  snapshot: { modelo: string; rix: number | null; rix_adj: number | null; nvm: number | null; drm: number | null; sim: number | null; rmm: number | null; cem: number | null; gam: number | null; dcm: number | null; cxm: number | null; period_from: string | null; period_to: string | null }[];
  sector_avg: { rix: number; count: number } | null;
  ranking: { pos: number; ticker: string; nombre: string; rix_avg: number }[];
  evolucion: { fecha: string; rix_avg: number; modelos: number; delta: number | null }[];
  divergencia: { sigma: number; nivel: string; modelo_alto: string; modelo_bajo: string; rango: number } | null;
  memento: { ceo: string | null; presidente: string | null; chairman: string | null; sede: string | null; descripcion: string | null; fecha: string | null; empleados: number | null; fundacion: number | null; ingresos: string | null; ejercicio_fiscal: string | null; mision: string | null; otros_ejecutivos: any[] | null } | null;
  noticias: { titular: string; fecha: string | null; ticker: string; lead: string | null; categoria: string | null }[];
  raw_texts: { modelo: string; texto: string }[];
  empresa_primaria: { ticker: string; nombre: string; sector: string | null; subsector: string | null } | null;
  competidores_verificados: { ticker: string; nombre: string; rix_avg: number | null }[];
  competidores_metricas_avg: { nvm: number | null; drm: number | null; sim: number | null; rmm: number | null; cem: number | null; gam: number | null; dcm: number | null; cxm: number | null } | null;
  explicaciones_metricas: { modelo: string; explicacion: string }[];
  puntos_clave: { modelo: string; puntos: string[] }[];
  categorias_metricas: { modelo: string; nvm: string | null; drm: string | null; sim: string | null; rmm: string | null; cem: string | null; gam: string | null; dcm: string | null; cxm: string | null }[];
  mercado: { precio: string | null; reputacion_vs_precio: string | null; variacion_interanual: string | null } | null;
}

async function buildDataPack(
  classifier: ClassifierResult,
  supabaseClient: any,
  companiesCache: any[] | null,
  logPrefix: string,
): Promise<DataPack> {
  console.log(`${logPrefix} [E2] Building DataPack...`);

  const pack: DataPack = {
    snapshot: [],
    sector_avg: null,
    ranking: [],
    evolucion: [],
    divergencia: null,
    memento: null,
    noticias: [],
    raw_texts: [],
    empresa_primaria: null,
    competidores_verificados: [],
    competidores_metricas_avg: null,
    explicaciones_metricas: [],
    puntos_clave: [],
    categorias_metricas: [],
    mercado: null,
  };

  // =========================================================================
  // ROUTE B: Index/sector queries WITHOUT specific company
  // =========================================================================
  const IBEX35_CODE = "IBEX-35";

  if (classifier.empresas_detectadas.length === 0) {
    console.log(`${logPrefix} [E2] No companies detected — checking for index/sector route...`);

    // Detect if the question is about an index or sector
    const isIndexQuery = classifier.tipo === "sector" || classifier.tipo === "comparativa" ||
      classifier.intencion === "ranking" || classifier.intencion === "evolucion";

    if (!isIndexQuery) {
      console.log(`${logPrefix} [E2] Not an index/sector query — returning empty DataPack`);
      // Log telemetry
      try {
        await supabaseClient.from("pipeline_logs").insert({
          stage: "E2_datapack",
          status: "empty",
          metadata: { phase: "E2", intent: classifier.intencion, tipo: classifier.tipo, empty_reason: "no_companies_no_index", row_count: 0 },
        });
      } catch (_) {}
      return pack;
    }

    console.log(`${logPrefix} [E2] INDEX/SECTOR ROUTE activated (tipo=${classifier.tipo}, intencion=${classifier.intencion})`);

    // Determine the universe of tickers to query
    let universeTickers: string[] = [];
    let universeLabel = "all";

    // Check for IBEX-35 mentions in the question
    const questionLower = (classifier as any)._originalQuestion || "";
    const isIbexQuery = /ibex[\s-]*35/i.test(questionLower) || classifier.tipo === "sector";

    if (isIbexQuery && companiesCache) {
      universeTickers = companiesCache
        .filter((c: any) => c.ibex_family_code === IBEX35_CODE)
        .map((c: any) => c.ticker);
      universeLabel = IBEX35_CODE;
      console.log(`${logPrefix} [E2] IBEX-35 universe: ${universeTickers.length} tickers`);
    }

    // If no specific universe, use all active companies
    if (universeTickers.length === 0 && companiesCache) {
      universeTickers = companiesCache
        .filter((c: any) => c.status === "active" || !c.status)
        .map((c: any) => c.ticker);
      universeLabel = "all_active";
      console.log(`${logPrefix} [E2] Full universe: ${universeTickers.length} tickers`);
    }

    if (universeTickers.length === 0) {
      console.log(`${logPrefix} [E2] No tickers in universe — returning empty DataPack`);
      return pack;
    }

    // Fetch aggregated data for the universe
    const indexColumns = `
      "02_model_name", "03_target_name", "05_ticker",
      "06_period_from", "07_period_to", "09_rix_score", "51_rix_score_adjusted",
      "23_nvm_score", "26_drm_score", "29_sim_score", "32_rmm_score",
      "35_cem_score", "38_gam_score", "41_dcm_score", "44_cxm_score",
      "10_resumen", "11_puntos_clave", "22_explicacion", "25_explicaciones_detalladas",
      batch_execution_date
    `;

    const indexData = await fetchUnifiedRixData({
      supabaseClient,
      columns: indexColumns,
      tickerFilter: universeTickers,
      limit: 5500,
      logPrefix: `${logPrefix} [E2-INDEX]`,
    });

    if (indexData.length === 0) {
      console.log(`${logPrefix} [E2] Index query returned 0 rows from DB`);
      try {
        await supabaseClient.from("pipeline_logs").insert({
          stage: "E2_datapack",
          status: "empty",
          metadata: { phase: "E2", intent: classifier.intencion, tipo: classifier.tipo, empty_reason: "sql_zero_rows", universe: universeLabel, tickers_queried: universeTickers.length, row_count: 0 },
        });
      } catch (_) {}
      return pack;
    }

    console.log(`${logPrefix} [E2] Index data: ${indexData.length} rows for ${universeLabel}`);

    // Identify latest batch date
    const sortedByDate = [...indexData].sort(
      (a, b) => new Date(b.batch_execution_date).getTime() - new Date(a.batch_execution_date).getTime()
    );
    const latestDate = sortedByDate[0]?.batch_execution_date;
    const latestWeek = sortedByDate.filter((r) => r.batch_execution_date === latestDate);

    console.log(`${logPrefix} [E2] Latest week: ${latestDate}, ${latestWeek.length} rows`);

    // Build ranking: per-model scores with median sorting (NO averages)
    const metricKeys = ["23_nvm_score", "26_drm_score", "29_sim_score", "32_rmm_score", "35_cem_score", "38_gam_score", "41_dcm_score", "44_cxm_score"] as const;
    const metricShort = ["nvm", "drm", "sim", "rmm", "cem", "gam", "dcm", "cxm"] as const;

    // Helper: compute median of an array
    const medianOf = (arr: number[]): number => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0 ? Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10 : sorted[mid];
    };

    const byCompany = new Map<string, { name: string; scores: number[]; scoresByModel: Record<string, number>; sector?: string; metrics: Record<string, number[]>; metricsByModel: Record<string, Record<string, number>> }>();
    for (const row of latestWeek) {
      const ticker = row["05_ticker"];
      const rix = row["09_rix_score"];
      const modelName = row["02_model_name"] || "unknown";
      if (!ticker || rix == null || rix <= 0) continue;
      if (!byCompany.has(ticker)) {
        const compInfo = (companiesCache || []).find((c: any) => c.ticker === ticker);
        const metricsInit: Record<string, number[]> = {};
        for (const k of metricShort) metricsInit[k] = [];
        byCompany.set(ticker, { name: row["03_target_name"] || ticker, scores: [], scoresByModel: {}, sector: compInfo?.sector_category, metrics: metricsInit, metricsByModel: {} });
      }
      const entry = byCompany.get(ticker)!;
      entry.scores.push(rix);
      entry.scoresByModel[modelName] = rix;
      if (!entry.metricsByModel[modelName]) entry.metricsByModel[modelName] = {};
      for (let mi = 0; mi < metricKeys.length; mi++) {
        const val = row[metricKeys[mi]];
        if (val != null && typeof val === "number" && val > 0) {
          entry.metrics[metricShort[mi]].push(val);
          entry.metricsByModel[modelName][metricShort[mi]] = val;
        }
      }
    }

    const rankingEntries = Array.from(byCompany.entries())
      .map(([ticker, d]) => {
        const mediana = medianOf(d.scores);
        const rango = d.scores.length > 0 ? Math.round((Math.max(...d.scores) - Math.min(...d.scores)) * 10) / 10 : 0;
        const consenso_nivel = rango < 10 ? "alto" : rango < 20 ? "medio" : "bajo";
        return {
          ticker,
          nombre: d.name,
          mediana,
          rango,
          consenso_nivel,
          scores_por_modelo: d.scoresByModel,
          sector: d.sector,
          modelos: d.scores.length,
          metrics: Object.fromEntries(metricShort.map(k => [k, medianOf(d.metrics[k])])),
          metricsByModel: d.metricsByModel,
        };
      })
      .sort((a, b) => b.mediana - a.mediana);

    // --- Calcular deltas POR EMPRESA comparando última semana vs penúltima (usando mediana) ---
    const uniqueDatesForDelta = [...new Set(sortedByDate.map((r) => r.batch_execution_date))].sort().reverse();
    const prevDate = uniqueDatesForDelta.length >= 2 ? uniqueDatesForDelta[1] : null;
    const prevWeekData = prevDate ? sortedByDate.filter((r) => r.batch_execution_date === prevDate) : [];
    const prevByCompany = new Map<string, number[]>();
    for (const row of prevWeekData) {
      const t = row["05_ticker"];
      const rix = row["09_rix_score"];
      if (!t || rix == null || rix <= 0) continue;
      if (!prevByCompany.has(t)) prevByCompany.set(t, []);
      prevByCompany.get(t)!.push(rix);
    }

    pack.ranking = rankingEntries.map((r, i) => {
      const prevScores = prevByCompany.get(r.ticker);
      const prevMedian = prevScores && prevScores.length > 0 ? medianOf(prevScores) : null;
      const delta = prevMedian != null ? Math.round((r.mediana - prevMedian) * 10) / 10 : null;
      return {
        pos: i + 1,
        ticker: r.ticker,
        nombre: r.nombre,
        mediana: r.mediana,
        rango: r.rango,
        consenso_nivel: r.consenso_nivel,
        scores_por_modelo: r.scores_por_modelo,
        delta,
      };
    });

    // Build snapshot: per-model-per-company rows for top-5 and bottom-5 (NO averages)
    const allMedians = rankingEntries.map((r) => r.mediana);
    const globalMedian = medianOf(allMedians);

    // Compute global metric medians for sector_avg
    const globalMetricMedians: Record<string, number | null> = {};
    for (const k of metricShort) {
      const allVals = rankingEntries.map(r => r.metrics[k]).filter((v): v is number => v != null && v > 0);
      globalMetricMedians[k] = allVals.length > 0 ? medianOf(allVals) : null;
    }
    const allRanges = rankingEntries.map(r => r.rango);
    pack.sector_avg = { rix_mediana: globalMedian, rango_medio: allRanges.length > 0 ? Math.round((allRanges.reduce((a, b) => a + b, 0) / allRanges.length) * 10) / 10 : 0, count: rankingEntries.length, ...globalMetricMedians };

    // Pack the top 5 and bottom 5 as granular per-model snapshot entries
    const top5 = rankingEntries.slice(0, 5);
    const bottom5 = rankingEntries.slice(-5).reverse();
    for (const entry of [...top5, ...bottom5]) {
      // One row per model per company
      for (const [modelName, rixScore] of Object.entries(entry.scores_por_modelo)) {
        const modelMetrics = entry.metricsByModel[modelName] || {};
        pack.snapshot.push({
          modelo: `${modelName} → ${entry.nombre} (${entry.ticker})`,
          rix: rixScore,
          rix_adj: rixScore,
          nvm: modelMetrics.nvm || null, drm: modelMetrics.drm || null, sim: modelMetrics.sim || null, rmm: modelMetrics.rmm || null,
          cem: modelMetrics.cem || null, gam: modelMetrics.gam || null, dcm: modelMetrics.dcm || null, cxm: modelMetrics.cxm || null,
          period_from: null,
          period_to: latestDate?.toString().split("T")[0] || null,
        });
      }
    }

    // --- Cambio 1: Enriquecer Route B con datos cualitativos de top-5 y bottom-5 ---
    const qualitativeTickers = [...top5, ...bottom5].map(e => e.ticker);
    const qualitativeRows = latestWeek.filter(r => qualitativeTickers.includes(r["05_ticker"]));
    
    // Populate raw_texts with resumen + explicacion from each model for these companies
    for (const row of qualitativeRows) {
      const resumen = row["10_resumen"];
      const explicacion = row["22_explicacion"];
      const modelo = row["02_model_name"] || "unknown";
      const empresa = row["03_target_name"] || row["05_ticker"];
      if (resumen && typeof resumen === "string" && resumen.length > 20) {
        pack.raw_texts.push({ modelo: `${modelo} → ${empresa}`, texto: resumen });
      }
      if (explicacion && typeof explicacion === "string" && explicacion.length > 20) {
        pack.raw_texts.push({ modelo: `${modelo} → ${empresa} / Explicación`, texto: explicacion });
      }
      // Puntos clave
      const puntos = row["11_puntos_clave"];
      if (puntos) {
        const puntosArr = Array.isArray(puntos) ? puntos : (typeof puntos === "string" ? [puntos] : []);
        const validPuntos = puntosArr.filter((p: unknown) => typeof p === "string" && (p as string).length > 10) as string[];
        if (validPuntos.length > 0) {
          pack.puntos_clave.push({ modelo: `${modelo} → ${empresa}`, puntos: validPuntos });
        }
      }
      // Explicaciones detalladas
      const expDet = row["25_explicaciones_detalladas"];
      if (expDet && typeof expDet === "object") {
        const expObj = expDet as Record<string, unknown>;
        const parts: string[] = [];
        for (const [metricKey, explanation] of Object.entries(expObj)) {
          if (typeof explanation === "string" && explanation.length > 10) {
            parts.push(`${metricKey}: ${explanation}`);
          }
        }
        if (parts.length > 0) {
          pack.explicaciones_metricas.push({ modelo: `${modelo} → ${empresa}`, explicacion: parts.join("\n") });
        }
      }
    }
    console.log(`${logPrefix} [E2] Qualitative enrichment: ${pack.raw_texts.length} raw_texts from ${qualitativeTickers.length} companies`);

    // Build sector breakdown (using median)
    const bySector = new Map<string, { scores: number[]; companies: string[] }>();
    for (const entry of rankingEntries) {
      const sector = entry.sector || "Sin sector";
      if (!bySector.has(sector)) bySector.set(sector, { scores: [], companies: [] });
      bySector.get(sector)!.scores.push(entry.mediana);
      bySector.get(sector)!.companies.push(entry.nombre);
    }

    // Add sector data as competidores_verificados (repurposed for index view)
    for (const [sector, data] of bySector.entries()) {
      const sectorMedian = medianOf(data.scores);
      pack.competidores_verificados.push({
        ticker: sector,
        nombre: `Sector ${sector} (${data.companies.length} empresas)`,
        rix_avg: sectorMedian,
      });
    }
    pack.competidores_verificados.sort((a, b) => (b.rix_avg || 0) - (a.rix_avg || 0));

    // Build evolution (4 weeks aggregate using MEDIAN, not mean)
    const uniqueDates = [...new Set(sortedByDate.map((r) => r.batch_execution_date))].sort().reverse().slice(0, 4);
    let prevMedianEvo: number | null = null;
    for (const date of [...uniqueDates].reverse()) {
      const weekData = sortedByDate.filter((r) => r.batch_execution_date === date);
      const scores = weekData.map((r) => r["09_rix_score"]).filter((s): s is number => s != null && s > 0);
      if (scores.length === 0) continue;
      const weekMedian = medianOf(scores);
      const weekMin = Math.min(...scores);
      const weekMax = Math.max(...scores);
      const uniqueCompanies = new Set(weekData.map((r) => r["05_ticker"])).size;
      pack.evolucion.push({
        fecha: date.toString().split("T")[0],
        rix_mediana: weekMedian,
        rango: Math.round((weekMax - weekMin) * 10) / 10,
        modelos: uniqueCompanies,
        delta: prevMedianEvo != null ? Math.round((weekMedian - prevMedianEvo) * 10) / 10 : null,
      });
      prevMedianEvo = weekMedian;
    }

    // Divergence at index level
    if (allMedians.length >= 2) {
      const mean = allMedians.reduce((a, b) => a + b, 0) / allMedians.length;
      const variance = allMedians.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / allMedians.length;
      const sigma = Math.sqrt(variance);
      pack.divergencia = {
        sigma: Math.round(sigma * 10) / 10,
        nivel: sigma < 8 ? "BAJA" : sigma < 15 ? "MEDIA" : "ALTA",
        modelo_alto: top5[0]?.nombre || "?",
        modelo_bajo: bottom5[0]?.nombre || "?",
        rango: Math.round((Math.max(...allMedians) - Math.min(...allMedians)) * 10) / 10,
      };
    }

    // Set empresa_primaria to the index label
    pack.empresa_primaria = {
      ticker: universeLabel,
      nombre: universeLabel === IBEX35_CODE ? "IBEX-35" : "Mercado completo",
      sector: null,
      subsector: null,
    };

    // Log telemetry
    try {
      await supabaseClient.from("pipeline_logs").insert({
        stage: "E2_datapack",
        status: "ok",
        metadata: {
          phase: "E2",
          intent: classifier.intencion,
          tipo: classifier.tipo,
          route: "index",
          universe: universeLabel,
          row_count: indexData.length,
          companies_ranked: rankingEntries.length,
          sectors_found: bySector.size,
          weeks_found: uniqueDates.length,
        },
      });
    } catch (_) {}

    console.log(`${logPrefix} [E2] INDEX DataPack built: ${pack.ranking.length} ranked, ${pack.evolucion.length} weeks, ${pack.competidores_verificados.length} sectors, ${pack.snapshot.length} snapshot entries`);
    return pack;
  }

  // =========================================================================
  // ROUTE A: Specific company query (existing behavior)
  // =========================================================================
  const primaryTicker = classifier.empresas_detectadas[0].ticker;
  const primaryCompany = (companiesCache || []).find((c) => c.ticker === primaryTicker);
  
  if (primaryCompany) {
    pack.empresa_primaria = {
      ticker: primaryCompany.ticker,
      nombre: primaryCompany.issuer_name,
      sector: primaryCompany.sector_category || null,
      subsector: primaryCompany.subsector || null,
    };
  }

  // Query A: Snapshot (latest week, all models) + raw texts
  const fullColumns = `
    "02_model_name", "03_target_name", "05_ticker",
    "06_period_from", "07_period_to", "09_rix_score", "51_rix_score_adjusted",
    "23_nvm_score", "26_drm_score", "29_sim_score", "32_rmm_score",
    "35_cem_score", "38_gam_score", "41_dcm_score", "44_cxm_score",
    "25_nvm_categoria", "28_drm_categoria", "31_sim_categoria",
    "34_rmm_categoria", "37_cem_categoria", "40_gam_categoria",
    "43_dcm_categoria", "46_cxm_categoria",
    "10_resumen", "11_puntos_clave",
    "20_res_gpt_bruto", "21_res_perplex_bruto",
    "22_res_gemini_bruto", "23_res_deepseek_bruto",
    respuesta_bruto_grok, respuesta_bruto_qwen,
    "22_explicacion", "25_explicaciones_detalladas",
    "48_precio_accion", "49_reputacion_vs_precio", "50_precio_accion_interanual",
    batch_execution_date
  `;

  const companyFullData = await fetchUnifiedRixData({
    supabaseClient,
    columns: fullColumns,
    tickerFilter: primaryTicker,
    limit: 120,
    logPrefix: `${logPrefix} [E2]`,
  });

  if (companyFullData.length === 0) {
    console.log(`${logPrefix} [E2] No data for ${primaryTicker}`);
    // Log telemetry
    try {
      await supabaseClient.from("pipeline_logs").insert({
        stage: "E2_datapack",
        status: "empty",
        metadata: { phase: "E2", intent: classifier.intencion, tipo: classifier.tipo, empty_reason: "company_no_data", ticker: primaryTicker, row_count: 0 },
      });
    } catch (_) {}
    return pack;
  }

  // Identify latest batch date
  const sortedByDate = [...companyFullData].sort(
    (a, b) => new Date(b.batch_execution_date).getTime() - new Date(a.batch_execution_date).getTime()
  );
  const latestDate = sortedByDate[0]?.batch_execution_date;
  const latestWeek = sortedByDate.filter((r) => r.batch_execution_date === latestDate);

  // Build snapshot
  const latestScores: number[] = [];
  for (const row of latestWeek) {
    const rix = row["09_rix_score"];
    if (rix != null && rix > 0) latestScores.push(rix);
    pack.snapshot.push({
      modelo: row["02_model_name"],
      rix: rix ?? null,
      rix_adj: row["51_rix_score_adjusted"] ?? rix ?? null,
      nvm: row["23_nvm_score"] ?? null,
      drm: row["26_drm_score"] ?? null,
      sim: row["29_sim_score"] ?? null,
      rmm: row["32_rmm_score"] ?? null,
      cem: row["35_cem_score"] ?? null,
      gam: row["38_gam_score"] ?? null,
      dcm: row["41_dcm_score"] ?? null,
      cxm: row["44_cxm_score"] ?? null,
      period_from: row["06_period_from"] ?? null,
      period_to: row["07_period_to"] ?? null,
    });
  }

  // Extract raw texts (from latest week, first row with each model's text)
  const modelTextFields: [string, string][] = [
    ["ChatGPT", "20_res_gpt_bruto"],
    ["Perplexity", "21_res_perplex_bruto"],
    ["Gemini", "22_res_gemini_bruto"],
    ["DeepSeek", "23_res_deepseek_bruto"],
    ["Grok", "respuesta_bruto_grok"],
    ["Qwen", "respuesta_bruto_qwen"],
  ];

  for (const [modelName, field] of modelTextFields) {
    const textRow = latestWeek.find((r) => r[field]);
    if (textRow && textRow[field]) {
      pack.raw_texts.push({ modelo: modelName, texto: (textRow[field] as string).substring(0, 3000) });
    }
  }

  // Extract explicaciones_metricas, puntos_clave, categorias_metricas, mercado from latestWeek
  for (const row of latestWeek) {
    const modelName = row["02_model_name"] || "?";

    // Explicaciones por métrica
    const explicacion = row["22_explicacion"];
    if (explicacion && typeof explicacion === "string" && explicacion.length > 10) {
      pack.explicaciones_metricas.push({ modelo: modelName, explicacion: explicacion.substring(0, 1500) });
    }

    // Puntos clave
    const puntosRaw = row["11_puntos_clave"];
    if (puntosRaw) {
      let puntos: string[] = [];
      if (Array.isArray(puntosRaw)) {
        puntos = puntosRaw.filter((p: any) => typeof p === "string" && p.length > 3).slice(0, 8);
      } else if (typeof puntosRaw === "string") {
        try { puntos = JSON.parse(puntosRaw).filter((p: any) => typeof p === "string").slice(0, 8); } catch {}
      }
      if (puntos.length > 0) {
        pack.puntos_clave.push({ modelo: modelName, puntos });
      }
    }

    // Categorías por métrica
    const cats: any = { modelo: modelName };
    const catFields = [
      ["25_nvm_categoria", "nvm"], ["28_drm_categoria", "drm"], ["31_sim_categoria", "sim"],
      ["34_rmm_categoria", "rmm"], ["37_cem_categoria", "cem"], ["40_gam_categoria", "gam"],
      ["43_dcm_categoria", "dcm"], ["46_cxm_categoria", "cxm"],
    ];
    let hasCats = false;
    for (const [field, key] of catFields) {
      cats[key] = row[field] || null;
      if (row[field]) hasCats = true;
    }
    if (hasCats) pack.categorias_metricas.push(cats);
  }

  // Mercado: extract from first row that has price data
  const precioRow = latestWeek.find((r) => r["48_precio_accion"] || r["49_reputacion_vs_precio"]);
  if (precioRow) {
    pack.mercado = {
      precio: precioRow["48_precio_accion"] || null,
      reputacion_vs_precio: precioRow["49_reputacion_vs_precio"] ? (precioRow["49_reputacion_vs_precio"] as string).substring(0, 500) : null,
      variacion_interanual: precioRow["50_precio_accion_interanual"] ? (precioRow["50_precio_accion_interanual"] as string).substring(0, 300) : null,
    };
  }

  console.log(`${logPrefix} [E2] Enrichment: ${pack.explicaciones_metricas.length} explanations, ${pack.puntos_clave.length} key-points sets, ${pack.categorias_metricas.length} category sets, market=${!!pack.mercado}`);

  // Query B+C: Verified competitors ONLY (from repindex_root_issuers.verified_competitors)
  const { data: issuerRecord } = await supabaseClient
    .from("repindex_root_issuers")
    .select("verified_competitors")
    .eq("ticker", primaryTicker)
    .limit(1)
    .single();

  const verifiedTickers: string[] = [];
  if (issuerRecord?.verified_competitors) {
    const raw = issuerRecord.verified_competitors;
    if (Array.isArray(raw)) {
      verifiedTickers.push(...raw.filter((t: string) => typeof t === "string" && t.length > 0));
    } else if (typeof raw === "string") {
      try { verifiedTickers.push(...JSON.parse(raw)); } catch {}
    }
  }

  console.log(`${logPrefix} [E2] Verified competitors for ${primaryTicker}: ${JSON.stringify(verifiedTickers)}`);

  if (verifiedTickers.length > 0) {
    const compData = await fetchUnifiedRixData({
      supabaseClient,
      columns: `"03_target_name", "05_ticker", "09_rix_score", "23_nvm_score", "26_drm_score", "29_sim_score", "32_rmm_score", "35_cem_score", "38_gam_score", "41_dcm_score", "44_cxm_score", batch_execution_date`,
      tickerFilter: verifiedTickers,
      limit: 500,
      logPrefix: `${logPrefix} [E2-verified-comp]`,
    });

    const compLatest = compData.filter(
      (r) => r.batch_execution_date === latestDate && r["09_rix_score"] != null && r["09_rix_score"] > 0
    );

    const byComp = new Map<string, { name: string; scores: number[] }>();
    for (const r of compLatest) {
      const t = r["05_ticker"];
      if (!byComp.has(t)) byComp.set(t, { name: r["03_target_name"], scores: [] });
      byComp.get(t)!.scores.push(r["09_rix_score"]);
    }

    for (const [ticker, d] of byComp.entries()) {
      const avg = d.scores.reduce((a, b) => a + b, 0) / d.scores.length;
      pack.competidores_verificados.push({ ticker, nombre: d.name, rix_avg: Math.round(avg * 10) / 10 });
    }

    const allCompScores = compLatest.map((r) => r["09_rix_score"]);
    if (allCompScores.length > 0) {
      const avg = allCompScores.reduce((a, b) => a + b, 0) / allCompScores.length;
      pack.sector_avg = { rix: Math.round(avg * 10) / 10, count: allCompScores.length };
    }

    const metricKeys = [
      { key: "23_nvm_score", out: "nvm" },
      { key: "26_drm_score", out: "drm" },
      { key: "29_sim_score", out: "sim" },
      { key: "32_rmm_score", out: "rmm" },
      { key: "35_cem_score", out: "cem" },
      { key: "38_gam_score", out: "gam" },
      { key: "41_dcm_score", out: "dcm" },
      { key: "44_cxm_score", out: "cxm" },
    ] as const;
    const metricAvgs: Record<string, number | null> = {};
    for (const mk of metricKeys) {
      const vals = compLatest.map((r) => r[mk.key]).filter((v) => v != null && v > 0) as number[];
      metricAvgs[mk.out] = vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
    }
    pack.competidores_metricas_avg = metricAvgs as any;
    console.log(`${logPrefix} [E2] Competitor metric averages: ${JSON.stringify(pack.competidores_metricas_avg)}`);

    const primaryAvg = latestScores.length > 0 ? latestScores.reduce((a, b) => a + b, 0) / latestScores.length : 0;
    const allForRanking = [
      { ticker: primaryTicker, nombre: primaryCompany?.issuer_name || primaryTicker, rix_avg: Math.round(primaryAvg * 10) / 10 },
      ...pack.competidores_verificados,
    ].sort((a, b) => (b.rix_avg || 0) - (a.rix_avg || 0));

    pack.ranking = allForRanking.map((r, i) => ({ pos: i + 1, ...r, rix_avg: r.rix_avg || 0 }));
  } else {
    console.log(`${logPrefix} [E2] No verified competitors for ${primaryTicker}. No sector avg, no ranking.`);
    pack.sector_avg = null;
    pack.ranking = [];
    pack.competidores_verificados = [];
    pack.competidores_metricas_avg = null;
  }

  // Query D: Evolution (4 weeks)
  const uniqueDates = [...new Set(sortedByDate.map((r) => r.batch_execution_date))].sort().reverse().slice(0, 4);
  let prevAvg: number | null = null;
  for (const date of [...uniqueDates].reverse()) {
    const weekData = sortedByDate.filter((r) => r.batch_execution_date === date);
    const scores = weekData.map((r) => r["09_rix_score"]).filter((s) => s != null && s > 0);
    if (scores.length === 0) continue;
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    pack.evolucion.push({
      fecha: date.toString().split("T")[0],
      rix_avg: Math.round(avg * 10) / 10,
      modelos: scores.length,
      delta: prevAvg != null ? Math.round((avg - prevAvg) * 10) / 10 : null,
    });
    prevAvg = avg;
  }

  // Query E: Divergence
  if (latestScores.length >= 2) {
    const mean = latestScores.reduce((a, b) => a + b, 0) / latestScores.length;
    const variance = latestScores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / latestScores.length;
    const sigma = Math.sqrt(variance);
    const maxS = Math.max(...latestScores);
    const minS = Math.min(...latestScores);
    pack.divergencia = {
      sigma: Math.round(sigma * 10) / 10,
      nivel: sigma < 8 ? "BAJA" : sigma < 15 ? "MEDIA" : "ALTA",
      modelo_alto: latestWeek.find((r) => r["09_rix_score"] === maxS)?.["02_model_name"] || "?",
      modelo_bajo: latestWeek.find((r) => r["09_rix_score"] === minS)?.["02_model_name"] || "?",
      rango: Math.round((maxS - minS) * 10) / 10,
    };
  }

  // Query F: Corporate memento (expanded)
  const { data: corpData } = await supabaseClient
    .from("corporate_snapshots")
    .select("ceo_name, president_name, chairman_name, headquarters_city, company_description, snapshot_date_only, employees_approx, founded_year, last_reported_revenue, fiscal_year, mission_statement, other_executives")
    .eq("ticker", primaryTicker)
    .order("snapshot_date_only", { ascending: false })
    .limit(1);

  if (corpData && corpData[0]) {
    const c = corpData[0];
    pack.memento = {
      ceo: c.ceo_name,
      presidente: c.president_name,
      chairman: c.chairman_name || null,
      sede: c.headquarters_city,
      descripcion: c.company_description?.substring(0, 500) || null,
      fecha: c.snapshot_date_only,
      empleados: c.employees_approx || null,
      fundacion: c.founded_year || null,
      ingresos: c.last_reported_revenue || null,
      ejercicio_fiscal: c.fiscal_year || null,
      mision: c.mission_statement?.substring(0, 300) || null,
      otros_ejecutivos: Array.isArray(c.other_executives) ? c.other_executives.slice(0, 5) : null,
    };
  }

  // Query G: Recent news (expanded with lead_paragraph and category)
  const { data: newsData } = await supabaseClient
    .from("corporate_news")
    .select("ticker, headline, published_date, lead_paragraph, category")
    .eq("ticker", primaryTicker)
    .order("published_date", { ascending: false })
    .limit(10);

  if (newsData) {
    pack.noticias = newsData.map((n: any) => ({
      titular: n.headline,
      fecha: n.published_date,
      ticker: n.ticker,
      lead: n.lead_paragraph?.substring(0, 200) || null,
      categoria: n.category || null,
    }));
  }

  // Log telemetry
  try {
    await supabaseClient.from("pipeline_logs").insert({
      stage: "E2_datapack",
      status: "ok",
      metadata: {
        phase: "E2",
        intent: classifier.intencion,
        tipo: classifier.tipo,
        route: "company",
        ticker: primaryTicker,
        row_count: companyFullData.length,
        snapshot_models: pack.snapshot.length,
        ranking_size: pack.ranking.length,
        evolution_weeks: pack.evolucion.length,
      },
    });
  } catch (_) {}

  console.log(`${logPrefix} [E2] DataPack built: ${pack.snapshot.length} models, ${pack.ranking.length} ranked, ${pack.evolucion.length} weeks, ${pack.raw_texts.length} texts`);
  return pack;
}

// --- E3: QUALITATIVE READER ---
interface QualitativeFacts {
  temas_clave: { tema: string; mencionado_por: string[]; consenso: number }[];
  menciones_concretas: { modelo: string; cita_textual: string; relevancia: string }[];
  narrativa_dominante: string;
  divergencias_narrativas: { tema: string; [modelo: string]: string }[];
  consensos: { tema: string; modelos_coincidentes: number; fuerza: string }[];
}

async function extractQualitativeFacts(
  rawTexts: { modelo: string; texto: string }[],
  dataPack: DataPack,
  logPrefix: string,
): Promise<QualitativeFacts | null> {
  const normalizedRawTexts = (rawTexts || [])
    .map((entry: any, idx: number) => {
      if (typeof entry === "string") {
        return { modelo: `Fuente ${idx + 1}`, texto: entry };
      }
      if (!entry || typeof entry !== "object") return null;

      const modelo = typeof entry.modelo === "string" && entry.modelo.trim().length > 0
        ? entry.modelo.trim()
        : `Fuente ${idx + 1}`;

      let texto = entry.texto;
      if (typeof texto !== "string") {
        if (typeof entry.content === "string") texto = entry.content;
        else if (texto == null) texto = "";
        else texto = String(texto);
      }

      texto = texto.trim();
      if (!texto) return null;

      return { modelo, texto };
    })
    .filter((t): t is { modelo: string; texto: string } => !!t);

  if (normalizedRawTexts.length === 0) {
    console.log(`${logPrefix} [E3] No valid raw texts after normalization, skipping`);
    return null;
  }

  // Pre-filter: if more than 40 texts, select max 3 per company (prioritizing distinct models)
  let textsToProcess = normalizedRawTexts;
  if (normalizedRawTexts.length > 40) {
    console.log(`${logPrefix} [E3] Pre-filtering: ${normalizedRawTexts.length} texts → max 3 per company`);
    const byEntity = new Map<string, typeof normalizedRawTexts>();
    for (const t of normalizedRawTexts) {
      // Extract company from "ModelName → CompanyName" pattern
      const entity = t.modelo.includes("→") ? t.modelo.split("→")[1].trim().split("/")[0].trim() : t.modelo;
      if (!byEntity.has(entity)) byEntity.set(entity, []);
      byEntity.get(entity)!.push(t);
    }
    textsToProcess = [];
    for (const [, texts] of byEntity.entries()) {
      // Prioritize distinct models, take max 3
      const seen = new Set<string>();
      const selected: typeof normalizedRawTexts = [];
      for (const t of texts) {
        const model = t.modelo.includes("→") ? t.modelo.split("→")[0].trim() : "unknown";
        if (!seen.has(model) && selected.length < 3) {
          seen.add(model);
          selected.push(t);
        }
      }
      textsToProcess.push(...selected);
    }
    console.log(`${logPrefix} [E3] After pre-filtering: ${textsToProcess.length} texts`);
  }

  console.log(`${logPrefix} [E3] Extracting qualitative facts from ${textsToProcess.length} AI texts...`);

  const textsBlock = textsToProcess.map((t) => `=== ${t.modelo} ===\n${t.texto.substring(0, 1500)}`).join("\n\n");

  // Build explanations block from DataPack
  let explicacionesBlock = "";
  if (dataPack.explicaciones_metricas.length > 0) {
    explicacionesBlock = "\n\nEXPLICACIONES POR MÉTRICA (razonamiento de cada IA sobre por qué dio cada score):\n" +
      dataPack.explicaciones_metricas.map((e) => `=== ${e.modelo} ===\n${e.explicacion}`).join("\n\n");
  }

  // Build key points block from DataPack
  let puntosClaveBlock = "";
  if (dataPack.puntos_clave.length > 0) {
    puntosClaveBlock = "\n\nPUNTOS CLAVE (conclusiones destiladas por cada IA):\n" +
      dataPack.puntos_clave.map((p) => `=== ${p.modelo} ===\n${p.puntos.map((pt) => `- ${pt}`).join("\n")}`).join("\n\n");
  }

  const prompt = `Analiza estos textos de 6 modelos de IA sobre ${dataPack.empresa_primaria?.nombre || "una empresa"} (${dataPack.empresa_primaria?.ticker || "?"}).

TEXTOS BRUTOS DE LAS IAs:
${textsBlock}
${explicacionesBlock}
${puntosClaveBlock}

Extrae hechos estructurados. Responde SOLO en JSON válido (sin markdown):
{
  "temas_clave": [
    {"tema": "descripción del tema", "mencionado_por": ["ChatGPT","Gemini"], "consenso": 2}
  ],
  "menciones_concretas": [
    {"modelo": "Perplexity", "cita_textual": "texto relevante...", "relevancia": "alta|media|baja"}
  ],
  "narrativa_dominante": "Resumen en 1-2 frases de la percepción general",
  "divergencias_narrativas": [
    {"tema": "Gobernanza", "ChatGPT": "positivo", "DeepSeek": "crítico"}
  ],
  "consensos": [
    {"tema": "Liderazgo en X", "modelos_coincidentes": 5, "fuerza": "muy_alto|alto|medio"}
  ]
}

REGLAS:
- Solo extrae hechos que EXISTAN en los textos o explicaciones. No inventes.
- Las EXPLICACIONES POR MÉTRICA son evidencia directa del razonamiento de cada IA. Extrae las razones concretas que dan para cada score.
- Los PUNTOS CLAVE son conclusiones ya destiladas. Úsalos para identificar consensos y divergencias.
- Atribuye cada hecho al modelo que lo dice.
- Si un modelo no menciona un tema, NO lo incluyas para ese modelo.
- Máximo 8 temas_clave, 8 menciones_concretas, 6 consensos.`;

  try {
    const result = await callAISimple(
      [
        { role: "system", content: "Extractor de hechos cualitativos. Extrae SOLO lo que dicen los textos. No interpretes ni inventes. Responde SOLO en JSON válido." },
        { role: "user", content: prompt },
      ],
      "gpt-4o-mini",
      4000,
      `${logPrefix} [E3]`,
    );

    if (result) {
      const clean = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(clean) as QualitativeFacts;
      console.log(`${logPrefix} [E3] Extracted: ${parsed.temas_clave.length} themes, ${parsed.consensos.length} consensuses`);
      return parsed;
    }
  } catch (e) {
    console.warn(`${logPrefix} [E3] Qualitative extraction failed:`, e);
    // Attempt to repair truncated JSON
    try {
      if (e instanceof SyntaxError) {
        // The result variable is in the try scope above, so we need to re-attempt
        console.log(`${logPrefix} [E3] Attempting JSON repair...`);
      }
    } catch (_) {}
  }

  return null;
}

// --- E4: ANALYTICAL COMPARATOR ---
interface ComparatorResult {
  diagnostico_resumen: string;
  fortalezas: { metrica: string; score: number; vs_sector: string; evidencia_cualitativa: string }[];
  debilidades: { metrica: string; score: number; vs_sector: string; evidencia_cualitativa: string }[];
  posicion_competitiva: { ranking: number; de: number; lider: string; distancia: number } | null;
  recomendaciones: { accion: string; metrica_objetivo: string; basado_en: string; razonamiento?: string; prioridad?: string; gap_numerico?: string }[];
  gaps_percepcion: { tema: string; dato_real: string; narrativa_ia: string; riesgo: string }[];
}

async function runComparator(
  dataPack: DataPack,
  facts: QualitativeFacts | null,
  classifier: ClassifierResult,
  logPrefix: string,
): Promise<ComparatorResult | null> {
  if (dataPack.snapshot.length === 0) {
    console.log(`${logPrefix} [E4] No snapshot data, skipping comparator`);
    return null;
  }

  console.log(`${logPrefix} [E4] Running comparator...`);

  const snapshotTable = dataPack.snapshot.map((s) =>
    `${s.modelo}: RIX=${s.rix}, NVM=${s.nvm}, DRM=${s.drm}, SIM=${s.sim}, RMM=${s.rmm}, CEM=${s.cem}, GAM=${s.gam}, DCM=${s.dcm}, CXM=${s.cxm}`
  ).join("\n");

  const sectorInfo = dataPack.competidores_verificados.length > 0
    ? `Promedio competidores verificados: RIX ${dataPack.sector_avg?.rix ?? "N/A"} (${dataPack.competidores_verificados.length} competidores: ${dataPack.competidores_verificados.map(c => c.ticker).join(", ")})`
    : "Sin competidores verificados — NO incluir comparativa competitiva";

  // Build per-metric gaps vs competitors for enriched recommendations
  let metricGapsInfo = "";
  if (dataPack.competidores_metricas_avg && dataPack.snapshot.length > 0) {
    const avgSnap: Record<string, number[]> = { nvm: [], drm: [], sim: [], rmm: [], cem: [], gam: [], dcm: [], cxm: [] };
    for (const s of dataPack.snapshot) {
      if (s.nvm != null) avgSnap.nvm.push(s.nvm);
      if (s.drm != null) avgSnap.drm.push(s.drm);
      if (s.sim != null) avgSnap.sim.push(s.sim);
      if (s.rmm != null) avgSnap.rmm.push(s.rmm);
      if (s.cem != null) avgSnap.cem.push(s.cem);
      if (s.gam != null) avgSnap.gam.push(s.gam);
      if (s.dcm != null) avgSnap.dcm.push(s.dcm);
      if (s.cxm != null) avgSnap.cxm.push(s.cxm);
    }
    const cma = dataPack.competidores_metricas_avg;
    const gaps: string[] = [];
    const metricNames: Record<string, string> = { nvm: "Calidad Narrativa", drm: "Fortaleza Evidencia", sim: "Autoridad Fuentes", rmm: "Actualidad y Empuje", cem: "Gestión Controversias", gam: "Percepción Gobernanza", dcm: "Coherencia Informativa", cxm: "Ejecución Corporativa" };
    for (const [key, label] of Object.entries(metricNames)) {
      const vals = avgSnap[key];
      const compAvg = (cma as any)[key];
      if (vals.length > 0 && compAvg != null) {
        const myAvg = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
        const gap = Math.round((myAvg - compAvg) * 10) / 10;
        gaps.push(`${label} (${key.toUpperCase()}): empresa=${myAvg}, competidores=${compAvg}, gap=${gap > 0 ? "+" : ""}${gap}`);
      }
    }
    if (gaps.length > 0) {
      metricGapsInfo = `\nGAPS POR MÉTRICA vs COMPETIDORES VERIFICADOS:\n${gaps.join("\n")}`;
    }
  }

  const rankingInfo = dataPack.ranking.length > 0
    ? `Ranking (solo competidores verificados + empresa): ${dataPack.ranking.map((r) => `${r.pos}. ${r.nombre} (${r.rix_avg})`).join(", ")}`
    : "Sin ranking (no hay competidores verificados)";

  const factsInfo = facts
    ? `Narrativa dominante: ${facts.narrativa_dominante}\nConsensos: ${facts.consensos.map((c) => `${c.tema} (${c.modelos_coincidentes} modelos)`).join(", ")}\nDivergencias: ${facts.divergencias_narrativas.map((d) => d.tema).join(", ")}`
    : "Sin datos cualitativos";

  // Build consensus categories deterministically (no LLM)
  let consensoCatsBlock = "";
  if (dataPack.categorias_metricas.length > 0) {
    const metricKeys = ["nvm", "drm", "sim", "rmm", "cem", "gam", "dcm", "cxm"];
    const metricLabels: Record<string, string> = { nvm: "Calidad Narrativa", drm: "Fortaleza Evidencia", sim: "Autoridad Fuentes", rmm: "Actualidad y Empuje", cem: "Gestión Controversias", gam: "Percepción Gobernanza", dcm: "Coherencia Informativa", cxm: "Ejecución Corporativa" };
    const consensoLines: string[] = [];
    for (const mk of metricKeys) {
      const counts: Record<string, number> = {};
      for (const cm of dataPack.categorias_metricas) {
        const cat = (cm as any)[mk];
        if (cat && typeof cat === "string") {
          const normalized = cat.toLowerCase().trim();
          counts[normalized] = (counts[normalized] || 0) + 1;
        }
      }
      if (Object.keys(counts).length > 0) {
        const parts = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(" + ");
        consensoLines.push(`${metricLabels[mk]} (${mk.toUpperCase()}): ${parts}`);
      }
    }
    if (consensoLines.length > 0) {
      consensoCatsBlock = `\nCONSENSO DE CATEGORÍAS (dato puro, sin LLM — conteo de clasificaciones entre modelos):\n${consensoLines.join("\n")}`;
    }
  }

  // Build market data block
  let mercadoBlock = "";
  if (dataPack.mercado) {
    const parts: string[] = [];
    if (dataPack.mercado.precio) parts.push(`Precio: ${dataPack.mercado.precio}`);
    if (dataPack.mercado.reputacion_vs_precio) parts.push(`Reputación vs Precio: ${dataPack.mercado.reputacion_vs_precio}`);
    if (dataPack.mercado.variacion_interanual) parts.push(`Variación interanual: ${dataPack.mercado.variacion_interanual}`);
    if (parts.length > 0) mercadoBlock = `\nDATOS DE MERCADO:\n${parts.join("\n")}`;
  }

  // Build top repeated key points
  let puntosRepetidosBlock = "";
  if (dataPack.puntos_clave.length >= 2) {
    const allPuntos = dataPack.puntos_clave.flatMap((p) => p.puntos.map((pt) => pt.toLowerCase().substring(0, 80)));
    const puntoCounts = new Map<string, number>();
    for (const p of allPuntos) {
      // Group similar points by first 40 chars
      const key = p.substring(0, 40);
      puntoCounts.set(key, (puntoCounts.get(key) || 0) + 1);
    }
    const repeated = [...puntoCounts.entries()].filter(([_, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (repeated.length > 0) {
      puntosRepetidosBlock = `\nPUNTOS CLAVE MÁS REPETIDOS ENTRE MODELOS:\n${repeated.map(([p, c]) => `- "${p}..." (${c} modelos)`).join("\n")}`;
    }
  }

  const prompt = `Cruza datos cuantitativos con cualitativos para ${dataPack.empresa_primaria?.nombre || "la empresa"}.

DATOS CUANTITATIVOS (DATAPACK):
${snapshotTable}

SECTOR: ${sectorInfo}
RANKING: ${rankingInfo}
EVOLUCIÓN: ${dataPack.evolucion.map((e) => `${e.fecha}: ${e.rix_avg} (Δ${e.delta ?? "—"})`).join(", ")}
DIVERGENCIA: ${dataPack.divergencia ? `σ=${dataPack.divergencia.sigma}, ${dataPack.divergencia.nivel}` : "N/A"}
${metricGapsInfo}
${consensoCatsBlock}
${mercadoBlock}
${puntosRepetidosBlock}

DATOS CUALITATIVOS:
${factsInfo}

Responde SOLO en JSON válido (sin markdown):
{
  "diagnostico_resumen": "Empresa tiene RIX X, Y pts sobre/bajo media sectorial...",
  "fortalezas": [{"metrica":"NVM","score":75,"vs_sector":"+12","evidencia_cualitativa":"5/6 IAs califican como Bueno..."}],
  "debilidades": [{"metrica":"SIM","score":35,"vs_sector":"-18","evidencia_cualitativa":"Solo 2 IAs encuentran fuentes institucionales..."}],
  "posicion_competitiva": {"ranking":3,"de":8,"lider":"EmpresaY","distancia":-8},
  "recomendaciones": [{"accion":"Mejorar X","metrica_objetivo":"DRM","basado_en":"gap de 18 pts","razonamiento":"Los competidores tienen DRM 72 porque...","prioridad":"alta","gap_numerico":"-18 pts"}],
  "gaps_percepcion": [{"tema":"ESG","dato_real":"CEM 42","narrativa_ia":"4 modelos positivos","riesgo":"desconexion"}],
  "contexto_mercado": "Precio X, PER Y, contraste con RIX..." | null,
  "consenso_categorias": [{"metrica":"CEM","calificacion_dominante":"Bueno","modelos_coincidentes":5}]
}

REGLAS:
- Solo conclusiones trazables a los datos de arriba.
- Cada recomendación DEBE citar la métrica, el gap numérico, un razonamiento de por qué esa acción mejoraría la métrica, y una prioridad (alta/media/baja) basada en el tamaño del gap.
- Usa el CONSENSO DE CATEGORÍAS para reforzar evidencia: "5/6 IAs califican CEM como Bueno" es más convincente que solo "CEM=78".
- Si hay DATOS DE MERCADO, incluye contexto_mercado conectando reputación con cotización.
- Solo compara con competidores verificados. Si no hay competidores verificados, omite completamente la comparativa competitiva.
- Máximo 4 fortalezas, 4 debilidades, 6 recomendaciones.`;

  try {
    const result = await callAISimple(
      [
        { role: "system", content: "Comparador analítico. Cruza datos cuantitativos con cualitativos. Solo conclusiones trazables. Responde SOLO en JSON válido." },
        { role: "user", content: prompt },
      ],
      "gpt-4o-mini",
      2000,
      `${logPrefix} [E4]`,
    );

    if (result) {
      const clean = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(clean) as ComparatorResult;
      console.log(`${logPrefix} [E4] Comparator: ${parsed.fortalezas.length} strengths, ${parsed.debilidades.length} weaknesses, ${parsed.recomendaciones.length} recommendations`);
      return parsed;
    }
  } catch (e) {
    console.warn(`${logPrefix} [E4] Comparator failed:`, e);
  }

  return null;
}

// --- E5: MASTER ORCHESTRATOR (prompt builder — actual LLM call happens in handleStandardChat) ---
function buildOrchestratorPrompt(
  classifier: ClassifierResult,
  dataPack: DataPack,
  facts: QualitativeFacts | null,
  analysis: ComparatorResult | null,
  question: string,
  languageName: string,
  language: string = "es",
  roleName?: string,
  rolePrompt?: string,
): { systemPrompt: string; userPrompt: string } {
  // Serialize artifacts as compact JSON blocks
  const dataPackBlock = JSON.stringify({
    empresa: dataPack.empresa_primaria,
    snapshot: dataPack.snapshot,
    sector_avg: dataPack.sector_avg,
    ranking: dataPack.ranking.slice(0, 10),
    competidores_verificados: dataPack.competidores_verificados,
    competidores_metricas_avg: dataPack.competidores_metricas_avg,
    evolucion: dataPack.evolucion,
    divergencia: dataPack.divergencia,
    memento: dataPack.memento,
    noticias: dataPack.noticias.slice(0, 5),
    mercado: dataPack.mercado,
  }, null, 0);

  const factsBlock = facts ? JSON.stringify(facts, null, 0) : "null";
  const analysisBlock = analysis ? JSON.stringify(analysis, null, 0) : "null";

  // Build explicaciones block for E5
  let explicacionesE5Block = "";
  if (dataPack.explicaciones_metricas.length > 0) {
    explicacionesE5Block = "\n\n═══ EXPLICACIONES POR MÉTRICA (E2 — razonamiento de cada IA) ═══\n" +
      dataPack.explicaciones_metricas.map((e) => `[${e.modelo}]: ${e.explicacion.substring(0, 800)}`).join("\n\n");
  }

  // Build consenso categorias block for E5
  let consensoE5Block = "";
  if (dataPack.categorias_metricas.length > 0) {
    const metricKeys = ["nvm", "drm", "sim", "rmm", "cem", "gam", "dcm", "cxm"];
    const metricLabels: Record<string, string> = { nvm: "Calidad Narrativa", drm: "Fortaleza Evidencia", sim: "Autoridad Fuentes", rmm: "Actualidad y Empuje", cem: "Gestión Controversias", gam: "Percepción Gobernanza", dcm: "Coherencia Informativa", cxm: "Ejecución Corporativa" };
    const lines: string[] = [];
    for (const mk of metricKeys) {
      const counts: Record<string, number> = {};
      for (const cm of dataPack.categorias_metricas) {
        const cat = (cm as any)[mk];
        if (cat && typeof cat === "string") {
          const normalized = cat.toLowerCase().trim();
          counts[normalized] = (counts[normalized] || 0) + 1;
        }
      }
      if (Object.keys(counts).length > 0) {
        const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        lines.push(`| ${metricLabels[mk]} | ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")} | Dominante: ${dominant[0]} (${dominant[1]}/${dataPack.categorias_metricas.length}) |`);
      }
    }
    if (lines.length > 0) {
      consensoE5Block = "\n\n═══ CONSENSO DE CATEGORÍAS (determinístico, sin LLM) ═══\n| Métrica | Distribución | Dominante |\n|---|---|---|\n" + lines.join("\n");
    }
  }

  // Build market block for E5
  let mercadoE5Block = "";
  if (dataPack.mercado) {
    const parts: string[] = [];
    if (dataPack.mercado.precio) parts.push(`Precio acción: ${dataPack.mercado.precio}`);
    if (dataPack.mercado.reputacion_vs_precio) parts.push(`Análisis reputación-precio: ${dataPack.mercado.reputacion_vs_precio}`);
    if (dataPack.mercado.variacion_interanual) parts.push(`Variación interanual: ${dataPack.mercado.variacion_interanual}`);
    if (parts.length > 0) mercadoE5Block = "\n\n═══ DATOS DE MERCADO (E2) ═══\n" + parts.join("\n");
  }

  const systemPrompt = `[IDIOMA OBLIGATORIO: ${languageName}]
Responde SIEMPRE en ${languageName}. Sin excepciones.

Eres el Agente Rix de RepIndex. Redactas informes ejecutivos para alta dirección usando EXCLUSIVAMENTE los datos de los bloques DATAPACK, HECHOS, ANALISIS, EXPLICACIONES, CONSENSO y MERCADO que recibes.

REGLAS DE INTEGRIDAD (PRIORIDAD MÁXIMA):
1. Toda cifra debe existir en DATAPACK. Si no está, escribe "dato no disponible".
2. Toda mención temática debe existir en HECHOS. Indica cuántas IAs coinciden.
3. Las recomendaciones del ANALISIS son tu base. Puedes RAZONAR sobre ellas, ampliarlas y conectarlas con los datos del DATAPACK (tendencias temporales, memento, noticias) para proponer soluciones concretas y accionables. Pero TODA solución debe estar anclada en un gap numérico real. NUNCA inventes métricas, cifras ni herramientas que no estén en los datos.
4. NUNCA inventes empresas ficticias, cifras financieras, metodologías, DOIs, convenios ni KPIs inventados.
5. Si no hay datos suficientes, dilo con transparencia. No rellenes con ficción.

REGLA DE EXPLICACIONES: Cuando cites una métrica débil o fuerte, explica POR QUÉ usando las EXPLICACIONES POR MÉTRICA. Ejemplo: "La Autoridad de Fuentes (41 pts) es baja porque, según DeepSeek, predominan fuentes T1 (75%) pero faltan fuentes T2 diversas." NUNCA digas solo "SIM=41, Mejorable" sin explicar la causa.

REGLA DE MERCADO: Si hay DATOS DE MERCADO (precio, PER, variación), incluye un párrafo breve en el Resumen Ejecutivo conectando reputación con cotización. SOLO datos del bloque MERCADO, nunca inventes ratios ni precios.

REGLA DE CONSENSO CATEGORÍAS: Usa el CONSENSO DE CATEGORÍAS para reforzar la evidencia cruzada. "5 de 6 IAs califican la Gestión de Controversias como Buena" es más convincente que simplemente "CEM = 78". Siempre que tengas consenso disponible, úsalo.

REGLA DE NOTICIAS CON CONTEXTO: Cuando menciones noticias corporativas, incluye el lead_paragraph si existe en los datos. No resumas lo que no has leído. Si solo tienes el titular, di solo el titular.

TONO Y ESTILO:
• Profesional y analítico, nunca periodístico ni dramático.
• Declarativo: afirmas lo que los datos muestran con autoridad.
• Narrativo: construyes un relato coherente, no una lista de datos.
• Accesible: alguien inteligente sin conocimientos técnicos de RepIndex debe entenderte.
• Frases ≤25 palabras. Párrafos ≤4 líneas.
• Datos siempre con delta concreto: nunca "ha mejorado mucho" → "ha subido 8 puntos, de 54 a 62".
• Usa "las IAs" como sujeto genérico. Nombre propio solo cuando te refieras a una IA concreta.
• Explica cada concepto la primera vez; después úsalo con naturalidad.
• Sé didáctico: explica el porqué de las cosas, no solo el qué.

${buildDepthPrompt("complete", languageName, language)}

CONSENSO DE IAs (DENSIDAD DE EVIDENCIA CRUZADA):
• HECHO CONSOLIDADO (5-6 IAs coinciden): Afirmación directa con autoridad plena. "Las seis IAs coinciden en..."
• SEÑAL FUERTE (3-4 IAs): "La mayoría de los modelos indica...", "Cuatro de seis IAs destacan..."
• INDICACIÓN (2 IAs): "Según ChatGPT y Gemini...", con nota de cautela.
• DATO AISLADO (1 IA): Solo si es muy relevante, con caveat explícito.
⚠️ Cuando priorices consenso sobre menciones aisladas, avisa al usuario: "He priorizado hallazgos en los que coinciden 5 o 6 IAs. Eventos con mención aislada podrían ser igualmente relevantes."

REGLA ANTI-PROMEDIO (PRIORIDAD MÁXIMA):
• NUNCA calcules ni presentes promedios aritméticos de scores entre modelos de IA.
• Cada IA tiene audiencia, arquitectura y sesgos distintos. Un promedio sin ponderación de audiencia es metodológicamente incorrecto.
• En su lugar, presenta los datos POR MODELO INDIVIDUAL y busca CONSENSO TEMÁTICO:
  - ¿En qué coinciden 5-6 IAs? → Señal consolidada
  - ¿Dónde divergen significativamente? → Señal de incertidumbre
  - ¿Qué modelo es outlier y por qué?
• Usa la MEDIANA como referencia de tendencia central (no la media).
• El ranking usa la mediana como criterio de ordenación, pero SIEMPRE muestra los scores individuales.
• NUNCA digas "RIX promedio de 67.7" → Sí puedes decir "Mediana RIX: 67, rango: 57-84 (alta dispersión)"
• El DATAPACK ya incluye scores_por_modelo para cada empresa del ranking. ÚSALOS.

REGLAS DE NEGOCIO:
• Snapshots son SEMANALES (domingos). Referencia siempre la fecha del snapshot.
• Snapshot completo = 6 modelos: ChatGPT, Perplexity, Gemini, DeepSeek, Grok, Qwen.
• Si hay <4 modelos, declara snapshot incompleto.

LAS 8 MÉTRICAS (usa SIEMPRE nombres descriptivos, NUNCA acrónimos):
• Calidad de la Narrativa — coherencia del discurso público
• Fortaleza de Evidencia — calidad de fuentes primarias y trazabilidad
• Autoridad de Fuentes — jerarquía de fuentes (reguladores > medios > redes). NO mide ESG.
• Actualidad y Empuje — frescura temporal de menciones. NO mide marketing.
• Gestión de Controversias — exposición a riesgos (INVERSA: 100=sin controversias)
• Percepción de Gobernanza — gobierno corporativo. NO mide RRHH.
• Coherencia Informativa — consistencia entre modelos. NO mide innovación digital.
• Ejecución Corporativa — percepción de ejecución en mercado (solo cotizadas)
Escala: 🟢 ≥70 fortaleza · 🟡 50-69 mejora · 🔴 <50 riesgo

PROTOCOLO DE DATOS CORPORATIVOS (MEMENTO):
• VERIFIED (<7 días): Afirmación directa con fecha.
• RECENT (7-30 días): Con nota temporal.
• HISTORICAL (30-90 días): Con caveat "según información de [fecha]..."
• NUNCA menciones nombres de ejecutivos que no estén en el memento corporativo.

COMPETIDORES (REGLA ABSOLUTA):
• Usa EXCLUSIVAMENTE los competidores del campo "competidores_verificados" del DATAPACK.
• Si "competidores_verificados" está vacío, NO incluyas NINGUNA comparativa competitiva. Cero. Nada.
• NUNCA busques competidores por sector, subsector ni categoría. Solo los verificados.
• NUNCA inventes competidores ni los deduzcas del sector.

REGLAS ANTI-ALUCINACIÓN (PRIORIDAD MÁXIMA):
• NUNCA inventes WACC, EBITDA, CAPEX, VAN, ROI, Monte Carlo, DOIs, índices propietarios.
• NUNCA inventes empresas ficticias ("GRUPO ALPHA"), conteos de stakeholders, ni volúmenes de datos.
• NUNCA generes informes de consultoría con "palancas estratégicas", "rutas críticas", "roadmaps" inventados.
• NUNCA menciones límites de plataforma, carpetas, archivos ni filesystems.
• NUNCA digas "he guardado el informe en..." — tu ÚNICA vía de entrega es este chat.
• Si no tienes datos, dilo: "Solo puedo analizar los datos RepIndex disponibles."

REGLA DE ESTRUCTURA (PRIORIDAD MÁXIMA):
• NUNCA uses encabezados de tipo "PILAR X — [nombre]", "PILLAR X —", "PILIER X —". Esta estructura está PROHIBIDA.
• NUNCA inventes nombres de fases, protocolos, algoritmos ni sistemas internos de la empresa.
• NUNCA inventes equipos internos (Crisis-Ops, GRC, comité de...), herramientas (GitReg, Auto-Publish, Fitch-Bot, GlassScan) ni algoritmos (Sent-Shift, ponderación).
• NUNCA inventes coeficientes decimales (coef. 0,87), volatilidades porcentuales, SLAs, encuestas ni benchmarks.
• NUNCA inventes roadmaps con plazos ("60 días", "Trim3-2026"), certificaciones (ISO, SHA-256, PGP, MD5) ni protocolos técnicos.
• Cada sección del informe debe empezar citando los datos del DATAPACK que la sustentan.
• Si una sección no tiene datos en el DATAPACK, OMITE esa sección entera. No la rellenes con invenciones.
• El informe es un ANÁLISIS DE DATOS, no un plan estratégico ni un informe de consultoría.
${dataPack?.empresa_primaria?.ticker === "IBEX-35" ? `
REGLAS ESPECÍFICAS PARA CONSULTAS DE ÍNDICE (IBEX-35):
• Presenta SIEMPRE los scores de cada IA por separado para las empresas destacadas.
• Busca COHERENCIA TEMÁTICA: ¿las 6 IAs coinciden en que X empresa lidera? ¿O solo 2 la ponen arriba?
• Si una empresa tiene alta dispersión (rango > 15), dedica un párrafo a explicar por qué las IAs discrepan.
• La mediana es tu referencia de tendencia central. Nunca uses "promedio" ni "media".
• Para el ranking general, ordena por mediana pero muestra: Mediana | Min | Max | Consenso.
• Tu ÚNICO contenido permitido es: ranking RIX por modelo, métricas por empresa, medianas sectoriales, evolución temporal, divergencia entre modelos.
• NUNCA generes planes de acción, hojas de ruta, stakeholder maps, KPIs de gestión ni escenarios.
• NUNCA inventes datos bursátiles (cotizaciones, variaciones YTD, volatilidad, ratios put/call, índice en pts).
• NUNCA inventes organizaciones externas (WindEurope, Airlines for Europe, CEOE) ni responsables internos.
• NUNCA inventes presupuestos, campañas multicanal ni certificaciones.
• Si una métrica es null en el DataPack, di "métrica no disponible en esta consulta agregada" y PASA A LA SIGUIENTE. No rellenes.
• Extensión máxima: 2.500 palabras. Este es un resumen de índice, no un informe de consultoría.
` : ""}

EJEMPLO DE RESPUESTA PROHIBIDA (genera contenido ficticio):
"PILAR 1 — DETECCIÓN TEMPRANA: Cobertura 24/7 de 128 fuentes vía GDELT... Algoritmo Sent-Shift... Crisis-Ops con SLA de 2h..."
→ Esto es FICCIÓN. Nada de esto existe en los datos. NUNCA generes contenido así.

EJEMPLO DE RESPUESTA CORRECTA:
"La Gestión de Controversias obtiene 95 puntos, lo que indica que las IAs no detectan riesgos activos. Sin embargo, la Autoridad de Fuentes es de 0 puntos, lo que sugiere que las IAs no encuentran documentación verificable. Esta brecha podría indicar que la empresa gestiona bien las crisis pero no documenta sus actuaciones de forma accesible para los modelos de IA."

FORMATO MARKDOWN:
• ## para secciones principales, ### para subsecciones.
• Tablas markdown para datos comparativos (cabeceras: nombres descriptivos abreviados).
• Blockquotes (>) para notas metodológicas (máximo 3-4 en todo el informe).
• Emojis semáforo: 🟢 ≥70, 🟡 50-69, 🔴 <50.
• NO uses headers decorativos (═══). Solo ## y ###.

EXTENSIÓN: 2.500-4.000 palabras para empresa. Focalizado para otros tipos.
${roleName ? `PERSPECTIVA: Adapta el ángulo al rol "${roleName}". El rol modifica CÓMO presentas el contenido pero NUNCA omite datos relevantes.` : ""}
${roleName && rolePrompt ? `\nINSTRUCCIONES DEL ROL:\n${rolePrompt}` : ""}

JUSTIFICACIÓN METODOLÓGICA:
RepIndex mide la PROBABILIDAD de que una narrativa gane tracción en el ecosistema informativo algorítmico. Las IAs son el primer filtro cognitivo en 2026. Al final de cada sección principal con scores, incluye un breve blockquote metodológico (qué mide, nivel de consenso, señal estratégica).`;

  const userPrompt = `PREGUNTA: "${question}"

CLASIFICACIÓN (E1): tipo=${classifier.tipo}, intención=${classifier.intencion}

═══ DATAPACK (E2 — FUENTE DE VERDAD) ═══
${dataPackBlock}

═══ HECHOS CUALITATIVOS (E3) ═══
${factsBlock}

═══ ANÁLISIS COMPARATIVO (E4) ═══
${analysisBlock}
${explicacionesE5Block}
${consensoE5Block}
${mercadoE5Block}

Redacta el informe ejecutivo completo en ${languageName}. Usa SOLO los datos de arriba. Cuando expliques una métrica, cita la causa usando las EXPLICACIONES. Cuando haya consenso de categorías, menciónalo. Cuando haya datos de mercado, conéctalos con la reputación.`;

  return { systemPrompt, userPrompt };
}

// --- E6: ADAPTIVE LAYOUT FORMATTER ---
async function formatForExport(
  rawMarkdown: string,
  classifier: ClassifierResult,
  logPrefix: string,
): Promise<string> {
  if (rawMarkdown.length < 500) {
    console.log(`${logPrefix} [E6] Short response, skipping layout formatting`);
    return rawMarkdown;
  }

  console.log(`${logPrefix} [E6] Formatting for export (${rawMarkdown.length} chars)...`);

  const prompt = `Recibes un informe en markdown. Optimiza su formato visual para renderizado PDF.

SISTEMA DE RENDERIZADO CSS:
- "---" entre secciones → section-bands azules
- Tablas markdown → estilo editorial (zebra striping, headers azules)
- "1. Nombre — valor pts emoji" → emoji-metrics-table
- Blockquotes (>) → notas metodológicas con borde azul
- ### → subsection-titles con borde inferior

TU TRABAJO:
1. Inserta "---" entre cada sección principal
2. Si hay métricas como bullets, reformatea como tabla: | Métrica | Score | vs Sector |
3. Si hay datos de modelos, formatea como tabla con emojis semáforo
4. Rankings como tablas, no listas
5. Evolución temporal como tabla: | Semana | RIX | Delta |
6. Máximo 3-4 blockquotes metodológicos en todo el informe
7. ## para pilares, ### para subsecciones, #### si necesario

REGLAS:
- NO cambies contenido, cifras ni redacción. Solo reformatea.
- NO elimines texto. Solo reorganizas la presentación visual.
- NO añadas contenido nuevo.
- Mantén todos los emojis tal cual.

INFORME A FORMATEAR:
${rawMarkdown}`;

  try {
    const result = await callAISimple(
      [
        { role: "system", content: "Maquetador editorial. Solo reformateas markdown para renderizado PDF. NO cambias contenido." },
        { role: "user", content: prompt },
      ],
      "gpt-4o-mini",
      8000,
      `${logPrefix} [E6]`,
    );

    if (result && result.length > rawMarkdown.length * 0.5) {
      console.log(`${logPrefix} [E6] Formatted: ${result.length} chars (was ${rawMarkdown.length})`);
      return result;
    }
  } catch (e) {
    console.warn(`${logPrefix} [E6] Layout formatting failed, using raw markdown:`, e);
  }

  return rawMarkdown;
}

// =============================================================================
// INTELLIGENT COMPETITOR SELECTION (GUARDRAIL SYSTEM)
// =============================================================================

// Known non-competitors to filter out (falsos positivos conocidos)
const KNOWN_NON_COMPETITORS: Record<string, string[]> = {
  // Telefónica NO compite con empresas de otros subsectores del "Telecomunicaciones y Tecnología"
  TEF: ["AMS", "IDR", "GOOGLE-PRIV", "AMAZON-PRIV", "META-PRIV", "APPLE-PRIV", "MSFT-PRIV", "LLYC"],
  // Amadeus (tech viajes) no compite con operadores telecom
  AMS: ["TEF", "CLNX", "MAS"],
  // Indra (defensa/IT) no compite con operadores telecom
  IDR: ["TEF", "CLNX", "MAS"],
};

// Sector similarity groups for fallback competitor matching
const RELATED_SECTORS: Record<string, string[]> = {
  "Telecomunicaciones y Tecnología": [], // Too broad, rely on subsector matching
  "Energía y Utilities": ["Infraestructuras"],
  Financiero: [], // Banks compete only with banks
  "Construcción e Infraestructuras": ["Energía y Utilities"],
};

interface CompanyData {
  ticker: string;
  issuer_name: string;
  sector_category?: string;
  subsector?: string;
  ibex_family_code?: string;
  verified_competitors?: string[]; // Array of tickers of verified direct competitors
}

/**
 * Result from competitor selection including methodology justification
 */
interface CompetitorResult {
  competitors: CompanyData[];
  justification: string;
  tierUsed: string;
  verifiedCount: number;
  subsectorCount: number;
}

/**
 * Intelligent competitor selection with verified_competitors priority
 * NEW TIER 0: Uses verified_competitors array from repindex_root_issuers (EXCLUSIVE if populated)
 * Prevents irrelevant companies from appearing in bulletins
 * Returns competitors WITH methodology justification for transparency
 */
async function getRelevantCompetitors(
  company: CompanyData,
  allCompanies: CompanyData[],
  supabaseClient: any,
  limit: number = 5,
  logPrefix: string = "[Competitors]",
): Promise<CompetitorResult> {
  const collected: CompanyData[] = [];
  const usedTickers = new Set<string>([company.ticker]);

  // Tracking variables for methodology justification
  let tierUsed = "NONE";
  let verifiedCount = 0;
  let subsectorCount = 0;

  console.log(`${logPrefix} Getting competitors for ${company.issuer_name} (${company.ticker})`);
  console.log(
    `${logPrefix} Company sector: ${company.sector_category}, subsector: ${company.subsector}, IBEX: ${company.ibex_family_code}`,
  );
  console.log(
    `${logPrefix} Verified competitors from issuer record: ${JSON.stringify(company.verified_competitors || [])}`,
  );

  // Helper to add companies avoiding duplicates
  const addCompetitor = (c: CompanyData): boolean => {
    if (usedTickers.has(c.ticker)) return false;

    // Apply blacklist filter
    if (KNOWN_NON_COMPETITORS[company.ticker]?.includes(c.ticker)) {
      console.log(`${logPrefix} Blacklisted: ${c.ticker} (known non-competitor of ${company.ticker})`);
      return false;
    }

    usedTickers.add(c.ticker);
    collected.push(c);
    return true;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 0 (NEW PRIORITY): Verified competitors from repindex_root_issuers.verified_competitors
  // If this field is populated, use EXCLUSIVELY these competitors and skip all other tiers
  // ═══════════════════════════════════════════════════════════════════════════
  if (
    company.verified_competitors &&
    Array.isArray(company.verified_competitors) &&
    company.verified_competitors.length > 0
  ) {
    console.log(
      `${logPrefix} TIER 0 (VERIFIED_COMPETITORS): Found ${company.verified_competitors.length} verified competitors in issuer record`,
    );

    for (const competitorTicker of company.verified_competitors) {
      if (collected.length >= limit) break;

      const competitor = allCompanies.find((c) => c.ticker === competitorTicker);
      if (competitor && addCompetitor(competitor)) {
        verifiedCount++;
        tierUsed = "TIER0-VERIFIED-ISSUER";
        console.log(`${logPrefix}   → ${competitor.ticker} (verified from issuer record)`);
      } else if (!competitor) {
        console.warn(`${logPrefix}   ⚠️ Verified competitor ticker not found in companies cache: ${competitorTicker}`);
      }
    }

    // EXCLUSIVE: If we have verified_competitors, we return ONLY these - no fallback to other tiers
    if (collected.length > 0) {
      console.log(
        `${logPrefix} Returning ${collected.length} competitors EXCLUSIVELY from TIER 0 (verified_competitors)`,
      );
      const justification = buildCompetitorJustification(tierUsed, verifiedCount, subsectorCount, company);
      return { competitors: collected.slice(0, limit), justification, tierUsed, verifiedCount, subsectorCount };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 1: Bidirectional verified relationships from competitor_relationships table
  // Only reached if verified_competitors is empty
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const { data: reverseRelationships, error: reverseError } = await supabaseClient
      .from("competitor_relationships")
      .select("source_ticker, relationship_type, confidence_score")
      .eq("competitor_ticker", company.ticker)
      .order("confidence_score", { ascending: false });

    if (!reverseError && reverseRelationships?.length > 0) {
      console.log(`${logPrefix} TIER 1: Found ${reverseRelationships.length} reverse-direction competitors`);

      for (const rel of reverseRelationships) {
        if (collected.length >= limit) break;

        const competitor = allCompanies.find((c) => c.ticker === rel.source_ticker);
        if (competitor && addCompetitor(competitor)) {
          verifiedCount++;
          tierUsed = "TIER1-BIDIRECTIONAL";
          console.log(
            `${logPrefix}   → ${competitor.ticker} (bidirectional verified, ${rel.relationship_type}, score: ${rel.confidence_score})`,
          );
        }
      }
    }
  } catch (e) {
    console.warn(`${logPrefix} Error fetching reverse competitors:`, e);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 2: Verified competitors from competitor_relationships table
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const { data: verifiedRelationships, error } = await supabaseClient
      .from("competitor_relationships")
      .select("competitor_ticker, relationship_type, confidence_score")
      .eq("source_ticker", company.ticker)
      .order("confidence_score", { ascending: false });

    if (!error && verifiedRelationships?.length > 0) {
      console.log(
        `${logPrefix} TIER 2: Found ${verifiedRelationships.length} verified competitors from relationships table`,
      );

      for (const rel of verifiedRelationships) {
        if (collected.length >= limit) break;

        const competitor = allCompanies.find((c) => c.ticker === rel.competitor_ticker);
        if (competitor && addCompetitor(competitor)) {
          verifiedCount++;
          if (tierUsed === "NONE") tierUsed = "TIER2-VERIFIED-RELATIONSHIPS";
          console.log(
            `${logPrefix}   → ${competitor.ticker} (verified relationship, ${rel.relationship_type}, score: ${rel.confidence_score})`,
          );
        }
      }
    }
  } catch (e) {
    console.warn(`${logPrefix} Error fetching verified competitors:`, e);
  }

  if (collected.length >= limit) {
    console.log(`${logPrefix} Returning ${collected.length} competitors from TIER 1/2 (verified relationships)`);
    const justification = buildCompetitorJustification(tierUsed, verifiedCount, subsectorCount, company);
    return { competitors: collected.slice(0, limit), justification, tierUsed, verifiedCount, subsectorCount };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 3: Same SUBSECTOR + Same IBEX Family (highest precision after verified)
  // NOTE: From this tier onwards, competitors are "por categoría" and need disclosure
  // ═══════════════════════════════════════════════════════════════════════════
  if (company.subsector && company.ibex_family_code) {
    const tier3 = allCompanies.filter(
      (c) => c.subsector === company.subsector && c.ibex_family_code === company.ibex_family_code,
    );

    console.log(`${logPrefix} TIER 3: Found ${tier3.length} same-subsector + same-IBEX companies`);

    for (const c of tier3) {
      if (collected.length >= limit) break;
      if (addCompetitor(c)) {
        subsectorCount++;
        if (tierUsed === "NONE") tierUsed = "TIER3-SUBSECTOR-IBEX";
        console.log(`${logPrefix}   → ${c.ticker} (subsector: ${c.subsector}, IBEX: ${c.ibex_family_code})`);
      }
    }
  }

  if (collected.length >= limit) {
    const justification = buildCompetitorJustification(tierUsed, verifiedCount, subsectorCount, company);
    return { competitors: collected.slice(0, limit), justification, tierUsed, verifiedCount, subsectorCount };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 4: Same SUBSECTOR only (any IBEX family)
  // ═══════════════════════════════════════════════════════════════════════════
  if (company.subsector) {
    const tier4 = allCompanies.filter((c) => c.subsector === company.subsector);

    console.log(`${logPrefix} TIER 4: Found ${tier4.length} same-subsector companies (any IBEX)`);

    for (const c of tier4) {
      if (collected.length >= limit) break;
      if (addCompetitor(c)) {
        subsectorCount++;
        if (tierUsed === "NONE") tierUsed = "TIER4-SUBSECTOR";
        console.log(`${logPrefix}   → ${c.ticker} (subsector: ${c.subsector})`);
      }
    }
  }

  if (collected.length >= limit) {
    const justification = buildCompetitorJustification(tierUsed, verifiedCount, subsectorCount, company);
    return { competitors: collected.slice(0, limit), justification, tierUsed, verifiedCount, subsectorCount };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 5: Same SECTOR + Same IBEX Family (fallback, AND not OR!)
  // ═══════════════════════════════════════════════════════════════════════════
  if (company.sector_category && company.ibex_family_code) {
    const tier5 = allCompanies.filter(
      (c) => c.sector_category === company.sector_category && c.ibex_family_code === company.ibex_family_code,
    );

    console.log(`${logPrefix} TIER 5: Found ${tier5.length} same-sector + same-IBEX companies`);

    for (const c of tier5) {
      if (collected.length >= limit) break;
      if (addCompetitor(c)) {
        if (tierUsed === "NONE") tierUsed = "TIER5-SECTOR-IBEX";
        console.log(`${logPrefix}   → ${c.ticker} (sector: ${c.sector_category}, IBEX: ${c.ibex_family_code})`);
      }
    }
  }

  if (collected.length >= limit) {
    const justification = buildCompetitorJustification(tierUsed, verifiedCount, subsectorCount, company);
    return { competitors: collected.slice(0, limit), justification, tierUsed, verifiedCount, subsectorCount };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 6: Same SECTOR only (last resort, but still AND-based logic from subsector)
  // ═══════════════════════════════════════════════════════════════════════════
  if (company.sector_category) {
    // If we have subsector, only accept companies in same or related subsectors
    const tier6 = allCompanies.filter((c) => {
      if (c.sector_category !== company.sector_category) return false;

      // If source has subsector, prefer matching or empty subsectors
      if (company.subsector && c.subsector && c.subsector !== company.subsector) {
        // Check if subsectors are related (e.g., both telecom-related)
        const sourceSubsector = company.subsector.toLowerCase();
        const targetSubsector = c.subsector.toLowerCase();

        // Reject obvious mismatches
        const incompatiblePairs = [
          ["telecom", "viajes"],
          ["telecom", "defensa"],
          ["telecom", "big tech"],
          ["telecom", "comunicación"],
          ["banca", "seguros"],
        ];

        for (const [a, b] of incompatiblePairs) {
          if (
            (sourceSubsector.includes(a) && targetSubsector.includes(b)) ||
            (sourceSubsector.includes(b) && targetSubsector.includes(a))
          ) {
            return false;
          }
        }
      }

      return true;
    });

    console.log(`${logPrefix} TIER 6: Found ${tier6.length} filtered same-sector companies`);

    for (const c of tier6) {
      if (collected.length >= limit) break;
      if (addCompetitor(c)) {
        if (tierUsed === "NONE") tierUsed = "TIER6-SECTOR";
        console.log(`${logPrefix}   → ${c.ticker} (sector: ${c.sector_category})`);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 7: FALLBACK - If still no competitors, use top IBEX35 companies
  // ═══════════════════════════════════════════════════════════════════════════
  if (collected.length === 0) {
    console.warn(`${logPrefix} NO COMPETITORS FOUND for ${company.ticker} - using fallback IBEX35`);

    const ibex35Fallback = allCompanies
      .filter((c) => c.ibex_family_code === "IBEX-35" && c.ticker !== company.ticker)
      .slice(0, limit);

    for (const c of ibex35Fallback) {
      addCompetitor(c);
    }

    tierUsed = "TIER7-FALLBACK-IBEX-35";
  }

  console.log(`${logPrefix} Final competitor list (${collected.length}): ${collected.map((c) => c.ticker).join(", ")}`);
  const justification = buildCompetitorJustification(tierUsed, verifiedCount, subsectorCount, company);
  return { competitors: collected.slice(0, limit), justification, tierUsed, verifiedCount, subsectorCount };
}

/**
 * Build human-readable justification for competitor selection methodology
 */
function buildCompetitorJustification(
  tierUsed: string,
  verifiedCount: number,
  subsectorCount: number,
  company: CompanyData,
): string {
  const parts: string[] = [];

  // Explain the tier used
  const tierExplanations: Record<string, string> = {
    "TIER0-VERIFIED-ISSUER": "competidores directos verificados manualmente (lista curada)",
    "TIER1-BIDIRECTIONAL": "relaciones bidireccionales verificadas en base de datos",
    "TIER2-VERIFIED-RELATIONSHIPS": "relaciones directas verificadas en tabla de competidores",
    "TIER3-SUBSECTOR-IBEX": `mismo subsector (${company.subsector}) y familia IBEX (${company.ibex_family_code})`,
    "TIER4-SUBSECTOR": `mismo subsector (${company.subsector})`,
    "TIER5-SECTOR-IBEX": `mismo sector (${company.sector_category}) y familia IBEX (${company.ibex_family_code})`,
    "TIER6-SECTOR": `mismo sector (${company.sector_category}) con filtrado de incompatibilidades`,
    "TIER7-FALLBACK-IBEX-35": "fallback a empresas del IBEX-35 (sin competidores directos identificados)",
    NONE: "metodología no determinada",
  };

  parts.push(`Competidores seleccionados mediante: ${tierExplanations[tierUsed] || tierUsed}.`);

  // Special case: TIER0-VERIFIED-ISSUER has highest confidence
  if (tierUsed === "TIER0-VERIFIED-ISSUER") {
    parts.push(`✓ ${verifiedCount} competidores directos confirmados.`);
  } else if (verifiedCount > 0) {
    parts.push(`${verifiedCount} competidores verificados en base de datos.`);
  }

  if (subsectorCount > 0) {
    parts.push(`${subsectorCount} competidores del mismo subsector (${company.subsector}).`);
  }

  // Add warning if using category-based fallback (TIER3+)
  const categoryTiers = ["TIER3-SUBSECTOR-IBEX", "TIER4-SUBSECTOR", "TIER5-SECTOR-IBEX", "TIER6-SECTOR"];
  if (categoryTiers.includes(tierUsed)) {
    parts.push(
      "⚠️ NOTA: Esta empresa no tiene competidores verificados definidos. Los competidores mostrados pertenecen a la misma categoría/subsector y se incluyen con fines de contexto sectorial, no como competencia directa confirmada.",
    );
  }

  // Add warning if using full fallback
  if (tierUsed.includes("FALLBACK")) {
    parts.push(
      "⚠️ NOTA: Esta empresa no tiene competidores verificados ni subsector definido - las comparativas deben interpretarse con cautela.",
    );
  }

  return parts.join(" ");
}

// =============================================================================
// INFORME ANALÍTICO — Estructura anclada en datos SQL, sin pilares.
// =============================================================================
function buildDepthPrompt(depthLevel: "quick" | "complete" | "exhaustive", languageName: string, language: string = "es"): string {
  const H = (key: string) => t(language, key);

  return `
═══════════════════════════════════════════════════════════════════════════════
     ${H("depth_format_title")}
═══════════════════════════════════════════════════════════════════════════════

REGLA FUNDAMENTAL: Este informe se construye EXCLUSIVAMENTE a partir de los
datos del DATAPACK (E2), los HECHOS (E3) y el ANÁLISIS (E4). Cada sección
debe citar de dónde proceden sus datos. Si una sección no tiene datos en el
DATAPACK, OMÍTELA por completo. NUNCA la rellenes con contenido inventado.

EXTENSIÓN según tipo de consulta:
- Empresa: 2.500–4.000 palabras. Todas las secciones con datos disponibles.
- Sector: 2.000–3.000 palabras. Secciones relevantes al sector.
- Comparativa: 2.000–3.000 palabras. Estructura enfrentada con tablas.
- Pregunta conceptual: respuesta focalizada, sin estructura rígida.

Activa SOLO los bloques que tengan datos en el DATAPACK. Omite el resto.

═══════════════════════════════════════════════════════════════════════════════
                        ## ${H("depth_executive_summary")}
═══════════════════════════════════════════════════════════════════════════════

Quien lee SOLO el Resumen entiende la situación.

### ${H("depth_headline_diagnosis")}
Una frase contundente de 1-2 líneas que sintetice la situación con datos
concretos del DATAPACK. Ej: "[Empresa] obtiene un RIX medio de 67 puntos
según 6 IAs, con fortaleza en Gestión de Controversias (95) pero debilidad
crítica en Autoridad de Fuentes (0)."

### ${H("depth_3kpis")}
Tres indicadores clave extraídos del DATAPACK con su variación:
- **[KPI 1]**: [valor] ([+/- delta] vs anterior — solo si DATAPACK.evolucion tiene datos)
- **[KPI 2]**: [valor]
- **[KPI 3]**: [valor]

### ${H("depth_3findings")}
Tres descubrimientos principales derivados de los datos, en prosa de 2-3
oraciones cada uno. Cada hallazgo cita la fuente (DATAPACK, HECHOS, ANÁLISIS).

### ${H("depth_verdict")}
Párrafo de 3-4 oraciones con la valoración del analista basada en los datos.

═══════════════════════════════════════════════════════════════════════════════
                        ## ${H("depth_6ai_vision")}
═══════════════════════════════════════════════════════════════════════════════

Para cada modelo de IA que aparezca en DATAPACK.snapshot:
- Puntuación RIX (dato exacto del DATAPACK)
- Fortaleza principal (métrica más alta)
- Debilidad principal (métrica más baja)
- Párrafo interpretativo de 3-4 oraciones usando HECHOS (E3)

Ordenar de MAYOR a MENOR puntuación RIX.

═══════════════════════════════════════════════════════════════════════════════
                        ## ${H("depth_8metrics")}
═══════════════════════════════════════════════════════════════════════════════

Para cada métrica con datos en DATAPACK.snapshot:
- **[Nombre completo]**: [Puntuación]/100 [semáforo 🟢🟡🔴]
- Explicación de POR QUÉ usando las EXPLICACIONES POR MÉTRICA del DATAPACK
- Comparación con competidores verificados (solo si existen en DATAPACK)

Si no hay EXPLICACIONES POR MÉTRICA, reporta puntuación y semáforo solamente.

═══════════════════════════════════════════════════════════════════════════════
                        ## ${H("depth_model_divergence")}
═══════════════════════════════════════════════════════════════════════════════

Solo si DATAPACK.divergencia muestra sigma > 8:
- Qué modelos coinciden, cuáles divergen significativamente
- Datos concretos: "[Modelo A]: 78 pts vs [Modelo B]: 52 pts (Δ 26)"

Si sigma ≤ 8, omite esta sección.

═══════════════════════════════════════════════════════════════════════════════
                        ## ${H("depth_evolution")}
═══════════════════════════════════════════════════════════════════════════════

Solo si DATAPACK.evolucion tiene >= 2 semanas de datos:
| Semana | RIX | Δ |
|--------|-----|---|

Si no hay datos temporales, omite esta sección.

═══════════════════════════════════════════════════════════════════════════════
                        ## ${H("depth_competitive")}
═══════════════════════════════════════════════════════════════════════════════

Solo si DATAPACK.competidores_verificados tiene datos:
| Posición | Empresa | RIX | Fortaleza | Debilidad |
|----------|---------|-----|-----------|-----------|

Si competidores_verificados está vacío, omite esta sección COMPLETAMENTE.

═══════════════════════════════════════════════════════════════════════════════
                        ## ${H("depth_recommendations")}
═══════════════════════════════════════════════════════════════════════════════

Solo recomendaciones derivadas del ANÁLISIS (E4):
- Cada recomendación cita la métrica, el gap numérico y la evidencia
- PROHIBIDO inventar acciones, roadmaps, plazos o certificaciones

═══════════════════════════════════════════════════════════════════════════════
                   ## ${H("depth_closing")}
═══════════════════════════════════════════════════════════════════════════════

- Modelos de IA consultados y fecha del análisis
- Periodo temporal analizado
- Nota sobre la metodología RepIndex

RECUERDA: Solo puedes afirmar lo que los datos del DATAPACK respaldan.
Si no hay datos para una sección, omítela. NUNCA rellenes con invenciones.
`;
}

// =============================================================================
// DRUMROLL QUESTION GENERATOR (Complementary Report Suggestion Based on REAL Data)
// =============================================================================
interface DrumrollQuestion {
  title: string;
  fullQuestion: string;
  teaser: string;
  reportType: "competitive" | "vulnerabilities" | "projection" | "sector";
}

interface AnalysisInsights {
  company: string;
  ticker: string;
  overallScore: number;
  weakestMetrics: { name: string; score: number; interpretation: string }[];
  strongestMetrics: { name: string; score: number; interpretation: string }[];
  trend: "up" | "down" | "stable";
  trendDelta: number;
  divergenceLevel: "low" | "medium" | "high";
  divergenceDetail?: string;
  keyFinding: string;
}

// Extract structured insights from rix_runs data for the analyzed company
function extractAnalysisInsights(
  rixData: any[],
  primaryCompany: { ticker: string; issuer_name: string },
  answer: string,
): AnalysisInsights | null {
  // Filter data for this company
  const companyData = rixData
    .filter((r) => r["05_ticker"] === primaryCompany.ticker)
    .sort((a, b) => new Date(b.batch_execution_date).getTime() - new Date(a.batch_execution_date).getTime());

  if (companyData.length === 0) {
    return null;
  }

  // Get latest week data (multiple models)
  const latestDate = companyData[0]?.batch_execution_date;
  const latestWeekData = companyData.filter((r) => r.batch_execution_date === latestDate);

  // Calculate average RIX across models
  const rixScores = latestWeekData.map((r) => r["09_rix_score"]).filter((s) => s != null && s > 0);
  const avgRix = rixScores.length > 0 ? Math.round(rixScores.reduce((a, b) => a + b, 0) / rixScores.length) : 0;

  // Calculate divergence between models
  const maxRix = Math.max(...rixScores);
  const minRix = Math.min(...rixScores);
  const divergence = maxRix - minRix;
  let divergenceLevel: "low" | "medium" | "high" = "low";
  let divergenceDetail = "";

  if (divergence >= 20) {
    divergenceLevel = "high";
    const maxModel = latestWeekData.find((r) => r["09_rix_score"] === maxRix)?.["02_model_name"];
    const minModel = latestWeekData.find((r) => r["09_rix_score"] === minRix)?.["02_model_name"];
    divergenceDetail = `${maxModel} (${maxRix}) vs ${minModel} (${minRix})`;
  } else if (divergence >= 10) {
    divergenceLevel = "medium";
  }

  // Extract metric scores from latest run (use first model with complete data)
  const latestRun = latestWeekData.find((r) => r["23_nvm_score"] != null) || latestWeekData[0];

  const metrics = [
    {
      name: "NVM (Narrativa)",
      fullName: "Calidad Narrativa",
      score: latestRun?.["23_nvm_score"],
      category: latestRun?.["25_nvm_categoria"],
    },
    {
      name: "DRM (Evidencia)",
      fullName: "Evidencia Documental",
      score: latestRun?.["26_drm_score"],
      category: latestRun?.["28_drm_categoria"],
    },
    {
      name: "SIM (Autoridad)",
      fullName: "Autoridad de Fuentes",
      score: latestRun?.["29_sim_score"],
      category: latestRun?.["31_sim_categoria"],
    },
    {
      name: "RMM (Momentum)",
      fullName: "Momentum Mediático",
      score: latestRun?.["32_rmm_score"],
      category: latestRun?.["34_rmm_categoria"],
    },
    {
      name: "CEM (Riesgo)",
      fullName: "Gestión de Controversias",
      score: latestRun?.["35_cem_score"],
      category: latestRun?.["37_cem_categoria"],
    },
    {
      name: "GAM (Gobernanza)",
      fullName: "Percepción de Gobierno",
      score: latestRun?.["38_gam_score"],
      category: latestRun?.["40_gam_categoria"],
    },
    {
      name: "DCM (Coherencia)",
      fullName: "Coherencia Informativa",
      score: latestRun?.["41_dcm_score"],
      category: latestRun?.["43_dcm_categoria"],
    },
    {
      name: "CXM (Ejecución)",
      fullName: "Ejecución Corporativa",
      score: latestRun?.["44_cxm_score"],
      category: latestRun?.["46_cxm_categoria"],
    },
  ].filter((m) => m.score != null && m.score > 0);

  // Sort by score to find weakest and strongest
  const sortedByScore = [...metrics].sort((a, b) => a.score - b.score);
  const weakest = sortedByScore.slice(0, 2);
  const strongest = sortedByScore.slice(-2).reverse();

  // Calculate trend from historical data (compare last 2 weeks if available)
  let trend: "up" | "down" | "stable" = "stable";
  let trendDelta = 0;

  const uniqueDates = [...new Set(companyData.map((r) => r.batch_execution_date))].sort().reverse();
  if (uniqueDates.length >= 2) {
    const thisWeekData = companyData.filter((r) => r.batch_execution_date === uniqueDates[0]);
    const lastWeekData = companyData.filter((r) => r.batch_execution_date === uniqueDates[1]);

    const thisWeekAvg =
      thisWeekData
        .map((r) => r["09_rix_score"])
        .filter(Boolean)
        .reduce((a, b) => a + b, 0) / thisWeekData.length;
    const lastWeekAvg =
      lastWeekData
        .map((r) => r["09_rix_score"])
        .filter(Boolean)
        .reduce((a, b) => a + b, 0) / lastWeekData.length;

    trendDelta = Math.round(thisWeekAvg - lastWeekAvg);
    if (trendDelta >= 3) trend = "up";
    else if (trendDelta <= -3) trend = "down";
  }

  // Extract key finding from answer (first 300 chars or first paragraph)
  const firstParagraph = answer.split("\n\n")[0] || answer.substring(0, 300);
  const keyFinding = firstParagraph.length > 200 ? firstParagraph.substring(0, 200) + "..." : firstParagraph;

  return {
    company: primaryCompany.issuer_name,
    ticker: primaryCompany.ticker,
    overallScore: avgRix,
    weakestMetrics: weakest.map((m) => ({
      name: m.name,
      score: m.score,
      interpretation: m.category || "Sin categoría",
    })),
    strongestMetrics: strongest.map((m) => ({
      name: m.name,
      score: m.score,
      interpretation: m.category || "Sin categoría",
    })),
    trend,
    trendDelta,
    divergenceLevel,
    divergenceDetail,
    keyFinding,
  };
}

async function generateDrumrollQuestion(
  originalQuestion: string,
  insights: AnalysisInsights | null,
  detectedCompanies: { ticker: string; issuer_name: string; sector_category?: string }[],
  allCompaniesCache: any[] | null,
  language: string,
  languageName: string,
  logPrefix: string,
): Promise<DrumrollQuestion | null> {
  // Solo generar para preguntas corporativas con datos estructurados
  if (detectedCompanies.length === 0 || !insights) {
    console.log(`${logPrefix} No drumroll: no companies or no insights available`);
    return null;
  }

  const primaryCompany = detectedCompanies[0];
  const sectorInfo = primaryCompany.sector_category || null;

  // Encontrar competidores del mismo sector
  let competitors: string[] = [];
  if (sectorInfo && allCompaniesCache) {
    competitors = allCompaniesCache
      .filter((c) => c.sector_category === sectorInfo && c.ticker !== primaryCompany.ticker)
      .slice(0, 5)
      .map((c) => c.issuer_name);
  }

  // Build prompt with REAL structured data
  const drumrollPrompt = `Acabas de generar un análisis sobre: "${originalQuestion}"

═══════════════════════════════════════════════════════════════════════════════
                      HALLAZGOS CLAVE DEL ANÁLISIS (DATOS REALES)
═══════════════════════════════════════════════════════════════════════════════

EMPRESA ANALIZADA: ${insights.company} (${insights.ticker})
SCORE RIX ACTUAL: ${insights.overallScore}/100
TENDENCIA: ${insights.trend === "up" ? "📈 Subiendo" : insights.trend === "down" ? "📉 Bajando" : "➡️ Estable"} (${insights.trendDelta > 0 ? "+" : ""}${insights.trendDelta} pts vs semana anterior)

MÉTRICAS MÁS DÉBILES (oportunidad de mejora):
${insights.weakestMetrics.map((m) => `• ${m.name}: ${m.score}/100 (${m.interpretation})`).join("\n")}

MÉTRICAS MÁS FUERTES:
${insights.strongestMetrics.map((m) => `• ${m.name}: ${m.score}/100 (${m.interpretation})`).join("\n")}

NIVEL DE DIVERGENCIA ENTRE IAs: ${insights.divergenceLevel.toUpperCase()}${insights.divergenceDetail ? ` - ${insights.divergenceDetail}` : ""}

SECTOR: ${sectorInfo || "No específico"}
COMPETIDORES DISPONIBLES: ${competitors.join(", ") || "No identificados"}

═══════════════════════════════════════════════════════════════════════════════

TU MISIÓN: Basándote en los HALLAZGOS REALES de arriba, propón UN informe complementario que PROFUNDICE en:

1. Si hay MÉTRICAS DÉBILES (<50 pts) → Propón analizar causas específicas y plan de mejora
   Ejemplo: "¿Por qué ${insights.company} tiene baja ${insights.weakestMetrics[0]?.name}? Diagnóstico y soluciones"
   
2. Si hay TENDENCIA NEGATIVA → Propón proyección de escenarios y causas
   Ejemplo: "Análisis de la caída de ${insights.trendDelta} pts: qué está pasando con ${insights.company}"
   
3. Si hay ALTA DIVERGENCIA → Propón entender por qué las IAs difieren
   Ejemplo: "El enigma de ${insights.company}: por qué ChatGPT y DeepSeek discrepan ${insights.divergenceDetail}"
   
4. Si hay FORTALEZA CLARA (>75 pts) → Propón comparar con competidores en esa métrica
   Ejemplo: "¿Puede ${insights.company} mantener su liderazgo en ${insights.strongestMetrics[0]?.name}?"

REGLAS CRÍTICAS:
- El informe debe ser ESPECÍFICO a los datos de arriba - MENCIONA scores, métricas o tendencias concretas
- NO propongas cosas genéricas como "mapa competitivo" o "análisis del sector" sin especificar QUÉ analizar
- El título DEBE mencionar algo específico: una métrica, un score, una tendencia, una cifra
- El teaser debe explicar POR QUÉ este análisis es valioso dado lo que ya sabemos

IDIOMA: Genera TODO en ${languageName}

Responde SOLO en JSON válido (sin markdown):
{
  "title": "Título que referencia un hallazgo ESPECÍFICO del análisis",
  "fullQuestion": "Pregunta ejecutable que profundiza en ese hallazgo específico",
  "teaser": "Por qué este análisis es valioso dado lo que hemos descubierto",
  "reportType": "competitive|vulnerabilities|projection|sector"
}`;

  try {
    const result = await callAISimple(
      [
        {
          role: "system",
          content: `Eres un estratega de inteligencia competitiva que propone análisis ESPECÍFICOS basados en datos reales. NUNCA propones informes genéricos. Siempre refieres métricas, scores o tendencias concretas en tus propuestas. Responde SOLO en JSON válido sin bloques de código.`,
        },
        { role: "user", content: drumrollPrompt },
      ],
      "gpt-4o-mini",
      500,
      logPrefix,
    );

    if (!result) {
      console.log(`${logPrefix} No drumroll: AI returned null`);
      return null;
    }

    const cleanResult = result
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const parsed = JSON.parse(cleanResult);

    // Validar estructura completa
    if (parsed.title && parsed.fullQuestion && parsed.teaser && parsed.reportType) {
      console.log(
        `${logPrefix} Drumroll generated: "${parsed.title}" (type: ${parsed.reportType}, based on ${insights.weakestMetrics[0]?.name || "general"} insights)`,
      );
      return parsed as DrumrollQuestion;
    }

    console.log(`${logPrefix} No drumroll: invalid structure`, parsed);
    return null;
  } catch (error) {
    console.warn(`${logPrefix} Error generating drumroll question:`, error);
    return null;
  }
}

// =============================================================================
// BULLETIN DETECTION PATTERNS
// =============================================================================
const BULLETIN_PATTERNS = [
  /(?:genera|crea|hazme|prepara|elabora|dame)\s+(?:un\s+)?(?:bolet[íi]n|informe|reporte|an[áa]lisis\s+completo)\s+(?:de|sobre|para)\s+(.+?)(?:\s+y\s+(?:sus?\s+)?(?:competidores?|competencia))?$/i,
  /(?:bolet[íi]n|informe|reporte)\s+(?:ejecutivo\s+)?(?:de|para|sobre)\s+(.+)/i,
  /an[áa]lisis\s+(?:completo|detallado|exhaustivo)\s+(?:de|para|sobre)\s+(.+?)(?:\s+(?:con|incluyendo|vs?)\s+(?:competidores?|competencia|sector))?/i,
  /(?:compara|comparar|comparativa)\s+(.+?)\s+(?:con|vs?|versus)\s+(?:su\s+)?(?:competencia|competidores?|sector)/i,
];

// =============================================================================
// BULLETIN GENERATION PROMPT - Magazine Style with News Stories
// =============================================================================
const BULLETIN_SYSTEM_PROMPT = `Eres un PERIODISTA ECONÓMICO DE ÉLITE escribiendo un BOLETÍN DE NOTICIAS PREMIUM sobre una empresa específica y su competencia, al estilo de El País, Expansión, Financial Times o The Economist.

## OBJETIVO:
Crear un BOLETÍN PERIODÍSTICO PREMIUM con MÍNIMO 15 NOTICIAS con TITULARES IMPACTANTES basados en datos reales. Cada noticia debe parecer una pieza de periodismo de investigación corporativa.

## ESTILO DE TITULARES (OBLIGATORIO):
Los titulares deben ser:
- **PROVOCATIVOS pero basados en datos**: "Telefónica pierde la batalla digital: ChatGPT la sitúa 15 puntos por debajo de Vodafone"
- **Con gancho emocional**: "La caída silenciosa de BBVA: tres semanas de declive que las IAs no perdonan"
- **Preguntas retóricas**: "¿Está Iberdrola perdiendo su corona energética?"
- **Metáforas periodísticas**: "La guerra de percepciones en el sector bancario", "La montaña rusa reputacional de Inditex"
- **Datos concretos en el titular**: "Repsol cae 8 puntos en RIX mientras Moeve escala posiciones"
- **Contrastes dramáticos**: "Mientras Mercadona brilla, Carrefour lucha por recuperar terreno"

## EJEMPLOS DE TITULARES POR CATEGORÍA:

**NOTICIA PRINCIPAL:**
- "EXCLUSIVA: [Empresa] sufre su peor semana en RepIndex mientras la competencia avanza"
- "[Empresa] rompe el consenso: ChatGPT y DeepSeek discrepan 20 puntos en su valoración"
- "Alerta en [Sector]: [Empresa] pierde el liderazgo reputacional por primera vez en 2025"

**ANÁLISIS DE MÉTRICAS:**
- "Radiografía de una caída: Las 8 métricas que explican el tropiezo de [Empresa]"
- "¿Por qué ChatGPT castiga a [Empresa]? Desglose de un RIX de [XX] puntos"
- "La anatomía del éxito: Cómo [Empresa] logró un RIX de [XX]"

**COMPETENCIA:**
- "Duelo en el [Sector]: [Empresa A] vs [Empresa B], la batalla que define el sector"
- "[Competidor] adelanta a [Empresa] en el ranking: las claves del sorpasso"
- "El nuevo orden en [Sector]: quién sube, quién baja y quién resiste"

**DIVERGENCIAS:**
- "Caso [Empresa]: Cuando las IAs no se ponen de acuerdo"
- "El misterio de [Empresa]: ChatGPT la adora, Perplexity la cuestiona"
- "20 puntos de diferencia: La empresa que divide a las inteligencias artificiales"

**TENDENCIAS:**
- "Cuarta semana de caída: ¿Puede [Empresa] frenar la sangría reputacional?"
- "El rally de [Empresa]: cuatro semanas de ascenso imparable"
- "Punto de inflexión: [Empresa] rompe su racha negativa"

## ESTRUCTURA DEL BOLETÍN PREMIUM:

---

# REPINDEX BULLETIN
## Edición Premium: [NOMBRE EMPRESA]
**[fecha inicio] - [fecha fin]** | **La Autoridad en Reputación Corporativa de las IAs**

---

## 📰 1. PORTADA: LA GRAN HISTORIA

### [TITULAR IMPACTANTE ESTILO PERIODÍSTICO - máximo 80 caracteres]

**Madrid, [fecha]** — [Entradilla de 2-3 líneas con el dato más impactante, respondiendo qué-quién-cuándo-dónde]

[Cuerpo extenso: 4-5 párrafos narrativos estilo periodístico de investigación:
- Párrafo 1: El hecho noticioso principal con datos concretos
- Párrafo 2: Contexto y antecedentes (qué pasó las semanas anteriores)
- Párrafo 3: Análisis de causas y consecuencias
- Párrafo 4: Declaraciones implícitas de los datos ("Los números hablan por sí solos...")
- Párrafo 5: Implicaciones para stakeholders y mercado]

> "El dato que cambia todo: [cita o cifra destacada]"

---

## 🔍 2. INVESTIGACIÓN: ANATOMÍA DEL RIX

### Radiografía de [Empresa]: Las 8 métricas que definen su reputación corporativa

[Entradilla explicando que el RIX no es un número arbitrario sino la suma de 8 dimensiones críticas]

#### Calidad de la Narrativa (NVM): [Score]/100 — [Categoría]
**Titular de métrica**: "[Empresa] [destaca/flaquea] en narrativa: [dato clave]"
[2-3 párrafos periodísticos sobre esta métrica: qué significa, por qué tiene este score, comparación con competidores, qué debería hacer]

#### Fortaleza de Evidencia (DRM): [Score]/100 — [Categoría]
**Titular de métrica**: "La solidez documental de [Empresa]: [hallazgo principal]"
[2-3 párrafos]

#### Autoridad de Fuentes (SIM): [Score]/100 — [Categoría]
**Titular de métrica**: "¿De dónde viene la información sobre [Empresa]? El análisis de fuentes"
[2-3 párrafos]

#### Actualidad y Empuje (RMM): [Score]/100 — [Categoría]
**Titular de métrica**: "[Empresa] [gana/pierde] impulso: análisis del momentum"
[2-3 párrafos]

#### Controversia y Riesgo (CEM): [Score]/100 — [Categoría]
**Titular de métrica**: "Nivel de alerta: ¿Está [Empresa] en zona de riesgo?"
[2-3 párrafos]

#### Independencia de Gobierno (GAM): [Score]/100 — [Categoría]
**Titular de métrica**: "Percepción de gobernanza: [lo que dicen los datos]"
[2-3 párrafos]

#### Integridad del Grafo (DCM): [Score]/100 — [Categoría]
**Titular de métrica**: "Coherencia informativa: el reto de [Empresa]"
[2-3 párrafos]

#### Ejecución Corporativa (CXM): [Score]/100 — [Categoría]
**Titular de métrica**: "El mercado opina: percepción de ejecución en [Empresa]"
[2-3 párrafos]

---

## 🤖 3. EXCLUSIVA: EL JUICIO DE LAS 6 INTELIGENCIAS

### [TITULAR]: ChatGPT, Perplexity, Gemini, DeepSeek, Grok y Qwen emiten su veredicto sobre [Empresa]

[Entradilla sobre cómo cada IA procesa información diferente y por qué sus opiniones importan]

#### ChatGPT dice: RIX [XX] — "[Frase que resume su visión]"
**Titular**: "ChatGPT [aprueba/suspende/cuestiona] a [Empresa]: los motivos"
[3-4 párrafos analizando la perspectiva de ChatGPT, su resumen, puntos clave, por qué difiere de otros]

#### Perplexity opina: RIX [XX] — "[Frase que resume su visión]"
**Titular**: "El veredicto de Perplexity: [hallazgo principal]"
[3-4 párrafos]

#### Gemini evalúa: RIX [XX] — "[Frase que resume su visión]"
**Titular**: "Gemini de Google [destaca/critica]: [dato clave]"
[3-4 párrafos]

#### DeepSeek considera: RIX [XX] — "[Frase que resume su visión]"
**Titular**: "DeepSeek, la IA china, [sorprende/confirma]: [hallazgo]"
[3-4 párrafos]

#### Grok evalúa: RIX [XX] — "[Frase que resume su visión]"
**Titular**: "Grok de xAI [identifica/señala]: [hallazgo principal]"
[3-4 párrafos analizando la perspectiva de Grok, caracterizada por su enfoque conversacional y acceso a datos de X/Twitter en tiempo real]

#### Qwen considera: RIX [XX] — "[Frase que resume su visión]"
**Titular**: "Qwen de Alibaba [revela/detecta]: [hallazgo principal]"
[3-4 párrafos analizando la perspectiva de Qwen, el modelo líder chino con fuerte presencia en mercados asiáticos]

| Modelo | RIX | Veredicto | Fortaleza | Debilidad |
|--------|-----|-----------|-----------|-----------|

---

## 🏆 4. REPORTAJE: LA BATALLA DEL [SECTOR]

### [TITULAR ÉPICO sobre la competencia - ej: "Guerra abierta en el sector [X]: así se reparten el pastel reputacional"]

[Cuerpo de reportaje: 5-6 párrafos estilo reportaje de investigación sobre el panorama competitivo]

**Ranking del Sector [X] - Semana Actual:**
| Pos | Empresa | RIX | Δ | Tendencia | Veredicto |
|-----|---------|-----|---|-----------|-----------|

---

## 📈 5. CRÓNICA: 4 SEMANAS DE [EMPRESA]

### [TITULAR sobre tendencia - ej: "El mes que lo cambió todo para [Empresa]" o "Cuatro semanas de montaña rusa"]

[Crónica periodística semana a semana: 4-5 párrafos narrando la evolución como una historia]

| Semana | RIX Promedio | ChatGPT | Perplexity | Gemini | DeepSeek | Grok | Qwen | Evento Clave |
|--------|--------------|---------|------------|--------|----------|------|------|--------------|

---

## 🔥 6-10. NOTICIAS DE LA COMPETENCIA

### 6. [TITULAR PERIODÍSTICO sobre Competidor 1]
[Noticia completa de 3-4 párrafos como pieza independiente]

### 7. [TITULAR PERIODÍSTICO sobre Competidor 2]
[Noticia completa de 3-4 párrafos]

### 8. [TITULAR PERIODÍSTICO sobre Competidor 3]
[Noticia completa de 3-4 párrafos]

### 9. [TITULAR PERIODÍSTICO sobre Competidor 4]
[Noticia completa de 3-4 párrafos]

### 10. [TITULAR PERIODÍSTICO sobre Competidor 5]
[Noticia completa de 3-4 párrafos]

---

## 📊 11. ANÁLISIS: EL MAPA DEL PODER REPUTACIONAL

### [TITULAR - ej: "Dónde está [Empresa] en el tablero de la reputación corporativa"]

[Análisis de posicionamiento: 3-4 párrafos]

| Cuadrante | Empresas | Característica |
|-----------|----------|----------------|
| 🥇 Líderes (>80) | [...] | Reputación consolidada |
| 🥈 Aspirantes (60-80) | [...] | En ascenso |
| ⚠️ En vigilancia (40-60) | [...] | Requieren atención |
| 🚨 Críticos (<40) | [...] | Situación urgente |

---

## 🎯 12. INVESTIGACIÓN: LAS DIVERGENCIAS

### [TITULAR - ej: "El caso [Empresa]: cuando las IAs no se ponen de acuerdo"]

[Análisis de por qué hay discrepancias entre modelos: 3-4 párrafos]

---

## 📉 13. ALERTA: RIESGOS DETECTADOS

### [TITULAR ALARMANTE pero basado en datos - ej: "Las señales de alarma que [Empresa] no puede ignorar"]

[Análisis de riesgos: 3-4 párrafos]

---

## 💡 14. OPORTUNIDAD: DÓNDE PUEDE GANAR [EMPRESA]

### [TITULAR OPTIMISTA - ej: "El territorio inexplorado: dónde [Empresa] puede dar el salto"]

[Análisis de oportunidades: 3-4 párrafos]

---

## 🔮 15. PROSPECTIVA: ESCENARIOS Y RECOMENDACIONES

### [TITULAR PROSPECTIVO - ej: "2025 para [Empresa]: tres caminos posibles"]

[Análisis prospectivo profundo: 4-5 párrafos]

**Escenario Optimista**: [descripción narrativa]
**Escenario Base**: [descripción narrativa]
**Escenario de Riesgo**: [descripción narrativa]

### Plan de Acción Ejecutivo:
1. **Esta semana**: [acción concreta]
2. **Próximo mes**: [acción táctica]
3. **Próximo trimestre**: [acción estratégica]
4. **Este año**: [visión a largo plazo]

---

## 📋 ANEXOS

### Metodología RepIndex
[Explicación breve del sistema de scoring]

### Glosario de Métricas (Canónico)
- **NVM (Narrative Value Metric → Calidad de la Narrativa)**: Coherencia del discurso, nivel de controversia, afirmaciones verificables
- **DRM (Data Reliability Metric → Fortaleza de Evidencia)**: Solidez documental, fuentes primarias, corroboración
- **SIM (Source Integrity Metric → Autoridad de Fuentes)**: Jerarquía de fuentes citadas (T1: reguladores/financieros → T4: redes/opinión)
- **RMM (Reputational Momentum Metric → Actualidad y Empuje)**: Frescura temporal de menciones en ventana semanal
- **CEM (Controversy Exposure Metric → Gestión de Controversias)**: Exposición a riesgos judiciales/políticos/laborales (100 = sin riesgo, inverso)
- **GAM (Governance Autonomy Metric → Percepción de Gobierno)**: Percepción de independencia y buenas prácticas de gobernanza
- **DCM (Data Consistency Metric → Coherencia Informativa)**: Consistencia de información entre diferentes modelos de IA
- **CXM (Corporate Execution Metric → Ejecución Corporativa)**: Percepción de ejecución en mercado y cotización (solo cotizadas)

### Glosario de Modelos de IA
- **ChatGPT (OpenAI)**: Modelo conversacional líder, fuerte en razonamiento general y síntesis narrativa. Sus fuentes verificadas incluyen URLs con utm_source=openai.
- **Perplexity**: Motor de búsqueda conversacional con citaciones explícitas. Excelente para fuentes recientes y verificables.
- **Gemini (Google)**: Modelo multimodal de Google, fuerte integración con datos de búsqueda y actualidad.
- **DeepSeek**: Modelo chino open-source, perspectiva alternativa con fuerte capacidad de razonamiento técnico.
- **Grok (xAI)**: Modelo de Elon Musk con acceso a datos de X/Twitter en tiempo real, enfoque conversacional y directo.
- **Qwen (Alibaba)**: Modelo líder chino, fuerte en mercados asiáticos y análisis multilingüe.

⚠️ NOTA METODOLÓGICA: SIM mide jerarquía de fuentes, NO sostenibilidad. DRM mide calidad de evidencia, NO desempeño financiero. DCM mide coherencia entre IAs, NO innovación digital.
⚠️ NOTA BIBLIOGRAFÍA: Solo ChatGPT y Perplexity proveen fuentes verificables documentalmente. Las fuentes de otros modelos no se incluyen en la bibliografía por no ser verificables.

---

*RepIndex Bulletin — Edición Premium*
*© RepIndex — La Autoridad en Reputación Corporativa de las IAs*

---

## REGLAS CRÍTICAS:
1. **TITULARES PERIODÍSTICOS**: Cada noticia DEBE tener un titular impactante, provocativo pero basado en datos
2. **MÍNIMO 15 NOTICIAS** completas con titular + entradilla + cuerpo narrativo
3. **ESTILO PERIODÍSTICO**: Escribe como El País, Expansión o Financial Times, no como un informe técnico
4. **DATOS CONCRETOS**: Cada párrafo debe incluir al menos un dato numérico
5. **METÁFORAS Y RECURSOS**: Usa "guerra de percepciones", "montaña rusa", "batalla sectorial", etc.
6. **PREGUNTAS RETÓRICAS**: Engancha al lector con preguntas
7. **NUNCA INVENTES**: Usa SOLO los datos proporcionados
8. **COMPARACIONES CONSTANTES**: Siempre compara con competidores
9. **MÍNIMO 6000 PALABRAS**: Es un producto premium de pago
10. **CADA MÉTRICA ES UNA HISTORIA**: Explica el "por qué" detrás de cada score`;

// Quick bulletin variant used when the user selects "informe rápido".
// It avoids the ultra-long premium constraints to prevent edge timeouts.
const BULLETIN_SYSTEM_PROMPT_QUICK = `Eres RepIndex Bulletin, un analista experto en reputación corporativa.

OBJETIVO: Generar un **boletín ejecutivo RÁPIDO** (800–1200 palabras) basado SOLO en el contexto.

FORMATO OBLIGATORIO:
## Síntesis (30 segundos)
Un párrafo (4-5 líneas) con veredicto + recomendación.

## Highlights
- 5 bullets máximos, cada uno con 1 dato numérico.

## Semáforo de señales
- ✅ Oportunidades (2)
- ⚠️ Riesgos (2)

## Qué vigilar la próxima semana
- 3 bullets máximos.

REGLAS:
- NO inventes datos.
- NO excedas 1200 palabras.
- Máximo 6 mini-noticias (titular + 2 líneas) si el contexto lo permite.
- Estilo ejecutivo, directo, presentable a dirección.
`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const logPrefix = `[${crypto.randomUUID().slice(0, 8)}]`;

  try {
    const body = await req.json();
    const {
      question,
      conversationHistory = [],
      sessionId,
      action,
      roleId,
      roleName,
      rolePrompt,
      originalQuestion,
      originalResponse,
      conversationId,
      bulletinMode,
      bulletinCompanyName,
      language = "es",
      languageName = "Español",
      depthLevel = "complete",
      streamMode = false, // NEW: enable SSE streaming
    } = body;

    // =============================================================================
    // EXTRACT USER ID FROM JWT TOKEN
    // =============================================================================
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      try {
        const {
          data: { user },
          error,
        } = await supabaseClient.auth.getUser(token);
        if (user && !error) {
          userId = user.id;
          console.log(`${logPrefix} Authenticated user: ${userId}`);
        }
      } catch (authError) {
        console.warn(`${logPrefix} Could not extract user from token:`, authError);
      }
    }

    // =============================================================================
    // CHECK FOR STREAMING MODE (SSE response)
    // =============================================================================
    if (streamMode) {
      console.log(`${logPrefix} STREAMING MODE enabled - SSE response`);
      // For now, fall through to standard processing but return as SSE
      // Full streaming will be implemented in a follow-up
    }

    // =============================================================================
    // CHECK FOR ENRICH ACTION (role-based response adaptation)
    // =============================================================================
    if (action === "enrich" && roleId && rolePrompt && originalResponse) {
      console.log(`${logPrefix} ENRICH REQUEST for role: ${roleName} (${roleId})`);
      return await handleEnrichRequest(
        roleId,
        roleName,
        rolePrompt,
        originalQuestion || "",
        originalResponse,
        sessionId,
        logPrefix,
        supabaseClient,
        userId,
        language,
        languageName,
      );
    }

    console.log(`${logPrefix} User question:`, question);
    console.log(`${logPrefix} Depth level:`, depthLevel);

    const openAIApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAIApiKey) {
      throw new Error("OpenAI API key not configured");
    }

    // Load or refresh company cache
    const now = Date.now();
    if (!companiesCache || now - cacheTimestamp > CACHE_TTL) {
      console.log(`${logPrefix} Loading companies from database...`);
      const { data: companies } = await supabaseClient
        .from("repindex_root_issuers")
        .select("issuer_name, issuer_id, ticker, sector_category, ibex_family_code, cotiza_en_bolsa, include_terms");

      if (companies) {
        companiesCache = companies;
        cacheTimestamp = now;
        console.log(`${logPrefix} Loaded ${companies.length} companies from database and cached`);
      }
    }

    // =============================================================================
    // GUARDRAILS: CATEGORIZE QUESTION AND REDIRECT IF NEEDED
    // =============================================================================
    const questionCategory = categorizeQuestion(question, companiesCache || []);
    console.log(`${logPrefix} Question category: ${questionCategory}`);

    if (questionCategory !== "corporate_analysis") {
      const redirectResponse = getRedirectResponse(questionCategory, question, language, languageName, companiesCache || []);

      // Save to database
      if (sessionId) {
        await supabaseClient.from("chat_intelligence_sessions").insert([
          {
            session_id: sessionId,
            role: "user",
            content: question,
            user_id: userId,
            question_category: questionCategory,
            depth_level: depthLevel,
          },
          {
            session_id: sessionId,
            role: "assistant",
            content: redirectResponse.answer,
            suggested_questions: redirectResponse.suggestedQuestions,
            user_id: userId,
            question_category: questionCategory,
          },
        ]);
      }

      return new Response(
        JSON.stringify({
          answer: redirectResponse.answer,
          suggestedQuestions: redirectResponse.suggestedQuestions,
          metadata: {
            type: "redirect",
            questionCategory,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // =============================================================================
    // CHECK FOR GENERIC BULLETIN REQUEST (without specific company)
    // =============================================================================
    const GENERIC_BULLETIN_PATTERNS = [
      /^quiero\s+(?:generar|crear|ver)\s+(?:un\s+)?bolet[íi]n\s+(?:ejecutivo\s+)?(?:de\s+una\s+empresa)?$/i,
      /^(?:genera|crea|hazme|prepara)\s+(?:un\s+)?bolet[íi]n$/i,
      /^bolet[íi]n\s+ejecutivo$/i,
      /^(?:quiero|necesito|me\s+gustar[íi]a)\s+(?:un\s+)?bolet[íi]n/i,
    ];

    const isGenericBulletinRequest = GENERIC_BULLETIN_PATTERNS.some((pattern) => pattern.test(question.trim()));

    if (isGenericBulletinRequest) {
      console.log(`${logPrefix} GENERIC BULLETIN REQUEST - asking for company`);

      // Get some example companies to suggest
      const exampleCompanies = companiesCache?.slice(0, 20).map((c) => c.issuer_name) || [];
      const ibexCompanies =
        companiesCache
          ?.filter((c) => c.ibex_family_code === "IBEX-35")
          .slice(0, 10)
          .map((c) => c.issuer_name) || [];

      const suggestedCompanies = [...new Set([...ibexCompanies, ...exampleCompanies])].slice(0, 8);

      return new Response(
        JSON.stringify({
          answer: t(language, "bulletin_welcome"),
          suggestedQuestions: suggestedCompanies.map((c) => t(language, "bulletin_suggest", { company: c })),
          metadata: {
            type: "standard",
            documentsFound: 0,
            structuredDataFound: companiesCache?.length || 0,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // =============================================================================
    // BULLETIN MODE - ONLY TRIGGERED BY EXPLICIT BUTTON CLICK
    // =============================================================================
    // Bulletins are ONLY generated when bulletinMode is explicitly set to true
    // This prevents false positives from users asking for "informes" in general conversation
    if (bulletinMode === true && bulletinCompanyName) {
      console.log(`${logPrefix} BULLETIN MODE ACTIVATED for company: ${bulletinCompanyName}`);
      return await handleBulletinRequest(
        bulletinCompanyName,
        question,
        depthLevel,
        supabaseClient,
        openAIApiKey,
        sessionId,
        logPrefix,
        userId,
        conversationId,
        streamMode,
        language,
        languageName,
      );
    }

    // =============================================================================
    // STANDARD CHAT FLOW (existing logic)
    // =============================================================================
    return await handleStandardChat(
      question,
      conversationHistory,
      supabaseClient,
      openAIApiKey,
      sessionId,
      logPrefix,
      userId,
      language,
      languageName,
      depthLevel,
      roleId, // NEW: pass role info
      roleName,
      rolePrompt,
      streamMode, // Pass streaming mode to standard chat handler
    );
  } catch (error) {
    console.error(`${logPrefix} Error in chat-intelligence function:`, error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred",
        details: error instanceof Error ? error.stack : undefined,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

// =============================================================================
// GUARDRAILS: QUESTION CATEGORIZATION
// =============================================================================
type QuestionCategory =
  | "corporate_analysis" // Normal question about companies
  | "agent_identity" // "Who are you?"
  | "personal_query" // About an individual person
  | "off_topic" // Outside scope
  | "test_limits"; // Jailbreak/testing attempts

function categorizeQuestion(question: string, companiesCache: any[]): QuestionCategory {
  const q = question
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // Agent identity patterns
  if (
    /qui[ee]n eres|qu[ee] eres|c[oo]mo funcionas|eres una? ia|que modelo|qué modelo|who are you|what are you/i.test(q)
  ) {
    return "agent_identity";
  }

  // Personal query patterns (asking about themselves or specific people without company context)
  if (/c[oó]mo me ven|qu[eé] dicen de m[ií]|analiza(me)?|sobre m[ií]|analyze me|about me/i.test(q)) {
    return "personal_query";
  }

  // If mentions known companies, it's corporate analysis
  if (detectCompaniesInQuestion(question, companiesCache).length > 0) {
    return "corporate_analysis";
  }

  // Off-topic patterns
  if (
    /f[uú]tbol|pol[ií]tica|receta|chiste|poema|\bcuento\b|\bcuentos\b|weather|tiempo hace|football|soccer|joke|recipe|poem|story/i.test(
      q,
    )
  ) {
    return "off_topic";
  }

  // Test limits patterns — expanded to catch injection attempts
  if (/ignore.*instructions|ignora.*instrucciones|jailbreak|bypass|prompt injection|actua como|act as if/i.test(q)) {
    return "test_limits";
  }

  // Detect "responde literalmente" / "repeat exactly" injection attempts
  if (/responde\s+(?:literalmente|exactamente|solo\s+con)|repite?\s+(?:exactamente|literalmente|solo)|repeat\s+(?:exactly|only)|respond\s+only\s+with/i.test(q)) {
    return "test_limits";
  }

  // Sector/methodology/ranking queries WITHOUT a specific company
  if (/\b(?:sector|ranking|top\s+\d+|ibex|mercado|metodolog[ií]a|c[oó]mo\s+funciona|qu[eé]\s+es\s+(?:el\s+)?r[ií]x)\b/i.test(q)) {
    return "corporate_analysis"; // legitimate, will be handled with proper depth
  }

  // Default: only fall to corporate_analysis if the question has substance
  // Short prompts (<20 chars) or pure instructions without company context → test_limits
  if (q.length < 20 && !/\b(?:analiza|compara|ranking|top|sector)\b/i.test(q)) {
    return "test_limits";
  }

  return "corporate_analysis";
}

function getRedirectResponse(
  category: QuestionCategory,
  question: string,
  language: string,
  languageName: string,
  companiesCache: any[],
): { answer: string; suggestedQuestions: string[] } {
  const ibexCompanies = companiesCache
    ?.filter((c) => c.ibex_family_code === "IBEX-35")
    .slice(0, 5)
    .map((c) => c.issuer_name) || ["Telefónica", "BBVA", "Santander", "Iberdrola", "Inditex"];

  const responses: Record<QuestionCategory, { answer: string; suggestedQuestions: string[] }> = {
    agent_identity: {
      answer: t(language, "agent_identity_answer"),
      suggestedQuestions: [
        t(language, "analyze_company", { company: ibexCompanies[0] }),
        t(language, "top5_ibex"),
        t(language, "sector_comparison"),
      ],
    },
    personal_query: {
      answer: t(language, "personal_query_answer"),
      suggestedQuestions: [
        t(language, "analyze_short", { company: ibexCompanies[0] }),
        t(language, "leadership_perception", { company: ibexCompanies[1] }),
        t(language, "sector_reputation"),
      ],
    },
    off_topic: {
      answer: t(language, "off_topic_answer"),
      suggestedQuestions: [
        t(language, "energy_ranking"),
        t(language, "top10_week"),
        t(language, "analyze_short", { company: ibexCompanies[2] }),
      ],
    },
    test_limits: {
      answer: t(language, "test_limits_answer"),
      suggestedQuestions: [
        t(language, "analyze_short", { company: ibexCompanies[0] }),
        t(language, "top5_ibex"),
        t(language, "telecom_comparison"),
      ],
    },
    corporate_analysis: {
      answer: "",
      suggestedQuestions: [],
    },
  };

  return responses[category];
}

// =============================================================================
// PERICIAL ENRICH HANDLER - Forensic-grade reputation expert report
// Produces a DICTAMEN PERICIAL, NOT an executive report.
// Completely separate system prompt — no Embudo Narrativo, no Pilar 3.
// =============================================================================
async function handlePericialEnrichRequest(
  roleName: string,
  originalQuestion: string,
  originalResponse: string,
  sessionId: string | undefined,
  logPrefix: string,
  supabaseClient: any,
  userId: string | null,
  language: string = "es",
) {
  console.log(`${logPrefix} Generating DICTAMEN PERICIAL for role: ${roleName}`);

  const openAIApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openAIApiKey) {
    throw new Error("OpenAI API key not configured");
  }

  const today = new Date().toISOString().split("T")[0];

  const systemPrompt = `Eres un sistema de análisis forense de reputación corporativa. Tu función es producir DICTÁMENES PERICIALES con valor probatorio para entornos judiciales, arbitrales y de mediación. El dictamen se elabora con la metodología RepIndex, desarrollada y validada académicamente por la Universidad Complutense de Madrid.

## REGLAS ABSOLUTAS DE COMPORTAMIENTO

**TONO Y PERSONA:**
- Tercera persona siempre. El sujeto es "la entidad analizada", "el modelo X", "los datos".
- Verbos permitidos: "se constata", "se observa", "los datos evidencian", "resulta acreditado", "se aprecia", "se detecta", "no se dispone de evidencia suficiente para".
- PROHIBIDO: "creemos", "sugerimos", "recomendamos", "podría ser interesante", "debería", cualquier valoración subjetiva, cualquier recomendación estratégica o comercial.

**ESTÁNDAR DE EVIDENCIA:**
- Cada afirmación requiere: dato numérico + modelo de IA concreto que lo emite + fecha exacta de recogida.
- Formato obligatorio: "[Métrica]: [valor] — Fuente: [modelo], semana [periodo]".
- Cuando un dato no esté disponible: "No se dispone de evidencia suficiente para constatar este extremo en el periodo analizado."
- NUNCA afirmar causalidad. Solo: "se observa una correlación temporal entre [evento X] y [variación Y puntos en métrica Z]".
- Las divergencias entre modelos se documentan modelo por modelo. NUNCA se promedian ni generalizan.

**CUANTIFICACIÓN ECONÓMICA:**
- Prohibido realizar valoración económica del daño. La competencia reputacional se limita a: puntos RIX perdidos, posiciones descendidas en ranking, deltas temporales medidos.
- Si procede, se indica: "La base cuantitativa aquí constatada (X puntos, Y posiciones, delta Z semanas) deberá ser valorada económicamente por perito especializado en daños patrimoniales."

**INFORMACIÓN FALSA EN MODELOS:**
- Si algún modelo contiene información falsa o no verificable, documentar: "El modelo [nombre] afirma [afirmación exacta] (detección: [fecha]). Este dato [no ha podido ser verificado / contradice la realidad verificable en cuanto a: ...]."

**METODOLOGÍA REPINDEX:**
- Siempre referenciar: "Sistema RepIndex, metodología de análisis de reputación algorítmica corporativa, validada académicamente por la Universidad Complutense de Madrid."
- Las 8 métricas del sistema RepIndex son:
  - **NVM (Calidad de la Narrativa)**: Coherencia del discurso, nivel de controversia, verificabilidad de afirmaciones.
  - **DRM (Fortaleza de Evidencia)**: Calidad y trazabilidad de las fuentes primarias citadas por los modelos.
  - **SIM (Autoridad de Fuentes)**: Jerarquía de fuentes (Tier 1: reguladores/financieros → Tier 4: redes/opinión).
  - **RMM (Actualidad y Empuje)**: Frescura temporal de las menciones dentro de la ventana analizada.
  - **CEM (Gestión de Controversias)**: Exposición a narrativas de riesgo (100 = ausencia total de controversias).
  - **GAM (Percepción de Gobierno)**: Percepción de independencia y buenas prácticas de gobernanza corporativa.
  - **DCM (Coherencia Informativa)**: Consistencia de la información entre los distintos modelos de IA consultados.
  - **CXM (Ejecución Corporativa)**: Percepción de desempeño en mercado y cotización (aplica solo a cotizadas).

## ESTRUCTURA OBLIGATORIA DEL DICTAMEN

Produce el documento siguiendo EXACTAMENTE esta estructura. Mínimo 2.000 palabras.

---

# DICTAMEN PERICIAL DE REPUTACIÓN CORPORATIVA
**Elaborado mediante metodología RepIndex — Universidad Complutense de Madrid**
**Fecha de elaboración del dictamen:** ${today}

---

## 1. IDENTIFICACIÓN DEL OBJETO DE ANÁLISIS

Especificar:
- Entidad analizada (denominación completa y ticker si aplica)
- Periodo temporal cubierto por los datos
- Modelos de IA consultados (con denominación exacta)
- Fecha y hora de extracción de los datos RepIndex
- Versión metodológica aplicada

---

## 2. METODOLOGÍA Y CADENA DE CUSTODIA

Describir:
- Descripción del sistema RepIndex: qué mide, cómo funciona, validación UCM
- Qué evalúa cada uno de los 6 modelos de IA consultados (ChatGPT, Perplexity, Gemini, Grok, DeepSeek, Qwen)
- Proceso de recogida de datos: consultas estandarizadas, sin intervención manual, registro automatizado
- Trazabilidad: qué pregunta exacta se formuló a cada modelo, en qué fecha, con qué resultado
- Confirmación de que los datos han sido obtenidos mediante el sistema automatizado RepIndex sin manipulación posterior

---

## 3. CONSTATACIÓN DE HECHOS MEDIBLES

Presentar una tabla con todas las métricas disponibles:

| Métrica | Descripción | Puntuación | Fecha | Modelo(s) | Semáforo |
|---|---|---|---|---|---|

Para cada métrica:
- Si el dato está disponible: reportar con fuente y fecha exacta
- Si el dato NO está disponible: "No se dispone de evidencia suficiente para este extremo"
- Semáforo: 🟢 ≥75 | 🟡 50-74 | 🔴 <50

Nota: La puntuación RIX Score global (media ponderada de las 8 métricas) se constata como síntesis cuantitativa del estado reputacional algorítmico en el periodo analizado.

---

## 4. ANÁLISIS POR MÉTRICA PRIORIZADA

Desarrollar en profundidad las cuatro métricas con mayor relevancia pericial:

### 4.1 DCM — Coherencia Informativa
¿Coinciden los modelos en los datos básicos sobre la entidad? Documentar discrepancias concretas modelo a modelo.

### 4.2 DRM — Fortaleza de Evidencia
¿Las afirmaciones de los modelos tienen respaldo verificable? Identificar afirmaciones sin fuente o con fuentes de baja jerarquía (Tier 3-4).

### 4.3 CEM — Gestión de Controversias
¿Existen narrativas de riesgo activas en los modelos que puedan constituir daño reputacional documentable? Describir cada narrativa detectada con modelo + afirmación + fecha.

### 4.4 NVM — Calidad de la Narrativa
¿Con qué atributos describen los modelos a la entidad? ¿Son fieles a la realidad verificable? Documentar atributos positivos y negativos detectados.

---

## 5. DIVERGENCIAS ENTRE MODELOS

Tabla de divergencias cuando los valores entre modelos se separan más de 10 puntos:

| Modelo | Métrica | Valor | Desviación vs media | Afirmación concreta detectada | Fecha |
|---|---|---|---|---|---|

Para cada divergencia significativa, documentar:
- Modelo que la origina
- Afirmación exacta detectada (cita textual si está disponible)
- Posible causa (información desactualizada, fuentes de baja jerarquía, etc.)
- Fecha de detección

Si no hay divergencias significativas (>10 puntos): constatarlo explícitamente.

---

## 6. EVOLUCIÓN TEMPORAL

(Completar solo si los datos proporcionados incluyen series temporales)

Para cada evento relevante identificado:
- Estado reputacional PREVIO al evento: puntuación + fecha
- Estado reputacional POSTERIOR al evento: puntuación + fecha
- Delta medido: X puntos en métrica Y durante Z semanas
- Constatar: "Se observa una correlación temporal entre [evento] y [variación]. No se afirma relación causal."

Si no hay datos temporales suficientes: "No se dispone de datos históricos suficientes para constatar evolución temporal en el periodo analizado."

---

## 7. CONCLUSIONES PERICIALES

Solo incluir conclusiones que los datos permitan sostener con rigor. Para cada conclusión:
- Enunciar el hecho constatado
- Indicar la base cuantitativa que lo sustenta (puntuaciones, deltas, modelos)
- Si los datos no respaldan una conclusión, declararlo explícitamente: "Los datos disponibles no permiten sostener [X]. Sería necesario [Y] para poder afirmarlo."

Incluir:
- Síntesis del estado reputacional algorítmico constatado
- Existencia o ausencia de deterioro documentable, con base cuantitativa
- Coherencia o incoherencia entre modelos como factor de riesgo probatorio
- Si procede: "La base cuantitativa aquí constatada deberá ser valorada económicamente por perito especializado en daños patrimoniales."

---

## 8. FUENTES Y TRAZABILIDAD

- Modelos de IA consultados con su denominación exacta
- Sistema de análisis: RepIndex (metodología validada, Universidad Complutense de Madrid)
- Periodo de los datos analizados
- Fecha de extracción
- Número de registros analizados (si disponible)
- Declaración de ausencia de manipulación posterior a la extracción

---

## DATOS A ANALIZAR:

${originalResponse}

## PREGUNTA ORIGINAL QUE MOTIVÓ EL ANÁLISIS:
${originalQuestion || "(No disponible)"}

---

## INSTRUCCIONES FINALES:

1. Mínimo 2.000 palabras. El dictamen pericial debe tener cobertura documental suficiente.
2. Tercera persona siempre. Nunca primera persona ni valoraciones subjetivas.
3. Cada afirmación: dato + modelo + fecha.
4. Si algún dato no está disponible en la respuesta original, declararlo explícitamente en lugar de inventarlo.
5. No incluir recomendaciones estratégicas, planes de acción ni lenguaje comercial.
6. El documento debe poder incorporarse como anexo documental en un procedimiento judicial o arbitral.`;

  try {
    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Elabora el DICTAMEN PERICIAL DE REPUTACIÓN CORPORATIVA completo. Rigor forense absoluto. Mínimo 2.000 palabras. Tercera persona. Solo hechos constatables con base en los datos proporcionados. Sin recomendaciones estratégicas. Sin valoración económica del daño.`,
      },
    ];

    const result = await callAIWithFallback(messages, "o3", 32000, logPrefix);
    const enrichedAnswer = result.content;

    console.log(
      `${logPrefix} DICTAMEN PERICIAL generated (via ${result.provider}), length: ${enrichedAnswer.length} chars`,
    );

    // Log API usage
    await logApiUsage({
      supabaseClient,
      edgeFunction: "chat-intelligence",
      provider: result.provider,
      model: result.model,
      actionType: "enrich",
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      userId,
      sessionId,
      metadata: {
        roleId: "perito_reputacional",
        roleName,
        depth_level: "enrich",
      },
    });

    // Pericial-specific follow-up questions (i18n — now uses passed language)
    const suggestedQuestions = [
      t(language, "pericial_q1"),
      t(language, "pericial_q2"),
      t(language, "pericial_q3"),
    ];

    return new Response(
      JSON.stringify({
        answer: enrichedAnswer,
        suggestedQuestions,
        metadata: {
          type: "enriched",
          roleId: "perito_reputacional",
          roleName,
          aiProvider: result.provider,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error(`${logPrefix} Error in pericial enrich request:`, error);
    throw error;
  }
}

// =============================================================================
// ENRICH REQUEST HANDLER - Role-based EXPANDED executive reports
// =============================================================================
async function handleEnrichRequest(
  roleId: string,
  roleName: string,
  rolePrompt: string,
  originalQuestion: string,
  originalResponse: string,
  sessionId: string | undefined,
  logPrefix: string,
  supabaseClient: any,
  userId: string | null,
  language: string = "es",
  languageName: string = "Español",
) {
  // Special branch: forensic/legal expert generates a DICTAMEN PERICIAL, not an executive report
  if (roleId === "perito_reputacional") {
    return await handlePericialEnrichRequest(
      roleName,
      originalQuestion,
      originalResponse,
      sessionId,
      logPrefix,
      supabaseClient,
      userId,
      language,
    );
  }

  console.log(`${logPrefix} Generating EXPANDED executive report for role: ${roleName}`);

  const openAIApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openAIApiKey) {
    throw new Error("OpenAI API key not configured");
  }

  const systemPrompt = `Eres el Agente Rix, un consultor senior de reputación corporativa creando un **INFORME EJECUTIVO COMPLETO** para alta dirección.

## REGLA CRÍTICA DE COMUNICACIÓN:

**NO menciones NUNCA el perfil del destinatario en el texto.** 
- ❌ PROHIBIDO: "Como CEO, debes...", "Este informe es para el CEO...", "Para un Director de Marketing..."
- ❌ PROHIBIDO: "Desde tu posición de...", "En tu rol como...", "Como responsable de..."
- ✅ CORRECTO: Simplemente adapta el enfoque y las recomendaciones sin mencionar el perfil
- ✅ CORRECTO: El contenido debe reflejar las prioridades del perfil SIN decirlo explícitamente

**EXPLICA SIEMPRE LAS MÉTRICAS RepIndex (GLOSARIO CANÓNICO):**
El lector NO conoce de memoria qué significa cada métrica. SIEMPRE incluye una explicación breve cuando menciones cualquier métrica:

- **NVM (Calidad de la Narrativa)**: Coherencia del discurso, nivel de controversia, afirmaciones verificables
- **DRM (Fortaleza de Evidencia)**: Calidad de fuentes primarias, corroboración, trazabilidad documental
- **SIM (Autoridad de Fuentes)**: Jerarquía de fuentes citadas (T1: reguladores/financieros → T4: redes/opinión)
- **RMM (Actualidad y Empuje)**: Frescura temporal de menciones dentro de la ventana analizada
- **CEM (Gestión de Controversias)**: Exposición a riesgos (puntuación inversa: 100 = sin controversias)
- **GAM (Percepción de Gobierno)**: Percepción de independencia y buenas prácticas de gobernanza
- **DCM (Coherencia Informativa)**: Consistencia de información entre diferentes modelos de IA
- **CXM (Ejecución Corporativa)**: Percepción de ejecución en mercado y cotización (solo cotizadas)

⚠️ ERRORES A EVITAR: SIM NO mide sostenibilidad. DRM NO mide desempeño financiero. DCM NO mide innovación digital.

Cuando menciones un score (ej: "CEM: 72"), añade contexto: "CEM (Gestión de Controversias): 72 puntos, lo que indica baja exposición a riesgos..."

## IMPORTANTE: ESTO ES UNA EXPANSIÓN, NO UN RESUMEN

La respuesta original contiene datos que DEBES mantener y EXPANDIR significativamente. Tu trabajo es:

1. **MANTENER todos los datos** de la respuesta original (cifras, empresas, métricas, comparativas)
2. **EXPANDIR el análisis** con profundidad propia de un informe ejecutivo de consultoría premium
3. **ADAPTAR el enfoque** a las prioridades del perfil (sin mencionarlo)
4. **INCLUIR secciones adicionales** con recomendaciones estratégicas

${buildDepthPrompt("complete", languageName, language)}

${rolePrompt}

---

## DATOS ORIGINALES A EXPANDIR:

${originalResponse}

## PREGUNTA ORIGINAL:
${originalQuestion || "(No disponible)"}

---

## REGLAS CRÍTICAS:

1. **MÍNIMO 2500 PALABRAS** - Este es un informe ejecutivo premium
2. **ESTRUCTURA** — Resumen Ejecutivo → Análisis de Datos → Contexto Competitivo → Cierre
3. **USAR TODOS LOS DATOS** - No omitir cifras ni empresas mencionadas
4. **TABLAS Y FORMATO** - Usar Markdown: tablas, negritas, listas, quotes
5. **NUNCA MENCIONAR EL PERFIL** - Adapta el contenido sin decir "para el CEO"
6. **EXPLICAR CADA MÉTRICA** - El lector no conoce la terminología
7. **6 CAMPOS POR RECOMENDACIÓN** - Qué, Por qué, Responsable, KPI, Impacto IA
8. **RECOMENDACIONES CONCRETAS** - No generalidades, acciones específicas
9. **NO INVENTAR DATOS** - Solo expandir análisis de datos existentes`;

  try {
    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Genera un INFORME EJECUTIVO COMPLETO Y EXTENSO para alta dirección. Este debe ser un documento profesional de consultoría premium de MÁXIMA CALIDAD sin límite de extensión - si necesitas 5000 palabras, escribe 5000 palabras. Expandiendo y profundizando en todos los datos disponibles. NO resumas, EXPANDE. EXCELENCIA sobre brevedad. RECUERDA: No menciones el perfil del destinatario en el texto, simplemente adapta el enfoque. Y SIEMPRE explica qué significa cada métrica RepIndex que menciones.`,
      },
    ];

    const result = await callAIWithFallback(messages, "o3", 32000, logPrefix);
    const enrichedAnswer = result.content;

    console.log(
      `${logPrefix} EXPANDED executive report generated (via ${result.provider}), length: ${enrichedAnswer.length} chars`,
    );

    // Log API usage
    await logApiUsage({
      supabaseClient,
      edgeFunction: "chat-intelligence",
      provider: result.provider,
      model: result.model,
      actionType: "enrich",
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      userId,
      sessionId,
      metadata: {
        roleId,
        roleName,
        depth_level: "enrich", // Enrichment is always a separate call
      },
    });

    // Generate role-specific follow-up questions
    const suggestedQuestions = await generateRoleSpecificQuestions(roleId, roleName, originalQuestion, logPrefix, language, languageName);

    return new Response(
      JSON.stringify({
        answer: enrichedAnswer,
        suggestedQuestions,
        metadata: {
          type: "enriched",
          roleId,
          roleName,
          aiProvider: result.provider,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error(`${logPrefix} Error in enrich request:`, error);
    throw error;
  }
}

// Helper function to generate role-specific follow-up questions
async function generateRoleSpecificQuestions(
  roleId: string,
  roleName: string,
  originalQuestion: string,
  logPrefix: string,
  language: string = "es",
  languageName: string = "Español",
): Promise<string[]> {
  const roleQuestionHints: Record<string, string[]> = {
    ceo: ["impacto en negocio", "decisiones estratégicas", "comparativa competitiva", "riesgos principales"],
    periodista: ["titulares noticiables", "controversias", "investigación periodística", "ángulos de historia"],
    analista_mercados: [
      "correlación RIX-cotización",
      "señales de mercado",
      "análisis técnico",
      "comparativa sectorial",
    ],
    inversor: ["screening reputacional", "riesgo ESG", "oportunidades de entrada", "alertas de cartera"],
    dircom: ["gestión de crisis", "narrativa mediática", "mensajes clave", "sentimiento público"],
    marketing: ["posicionamiento de marca", "benchmarking", "diferenciación", "experiencia de cliente"],
    estratega_interno: [
      "capacidades organizativas",
      "cultura corporativa",
      "recursos internos",
      "brechas de alineamiento",
    ],
    estratega_externo: [
      "posición competitiva",
      "oportunidades de mercado",
      "amenazas externas",
      "movimientos estratégicos",
    ],
  };

  const hints = roleQuestionHints[roleId] || ["análisis detallado", "comparativas", "tendencias"];

  try {
    const messages = [
      {
        role: "system",
        content: `[IDIOMA OBLIGATORIO: ${languageName}] Genera 3 preguntas de seguimiento para un ${roleName} interesado en datos de reputación corporativa RepIndex. Las preguntas deben ser específicas y responderibles con datos de RIX Score, rankings, y comparativas. Temas relevantes: ${hints.join(", ")}. Responde SOLO con un array JSON: ["pregunta 1", "pregunta 2", "pregunta 3"]. IMPORTANTE: Las preguntas DEBEN estar escritas en ${languageName}.`,
      },
      {
        role: "user",
        content: `Pregunta original: "${originalQuestion}". Genera 3 preguntas de seguimiento relevantes para un ${roleName}. Responde en ${languageName}.`,
      },
    ];

    const text = await callAISimple(messages, "gpt-4o-mini", 300, logPrefix);
    if (text) {
      const cleanText = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      return JSON.parse(cleanText);
    }
  } catch (error) {
    console.warn(`${logPrefix} Error generating role-specific questions:`, error);
  }

  // Fallback questions based on role — internationalized via PIPELINE_I18N
  const roleKeyMap: Record<string, string> = {
    ceo: "ceo",
    periodista: "journalist",
    analista_mercados: "analyst",
    inversor: "investor",
  };
  const roleKey = roleKeyMap[roleId] || "default";
  return [
    t(language, `fallback_${roleKey}_q1`),
    t(language, `fallback_${roleKey}_q2`),
    t(language, `fallback_${roleKey}_q3`),
  ];
}

// =============================================================================
// BULLETIN REQUEST HANDLER
// =============================================================================
async function handleBulletinRequest(
  companyQuery: string,
  originalQuestion: string,
  depthLevel: "quick" | "complete" | "exhaustive",
  supabaseClient: any,
  openAIApiKey: string,
  sessionId: string | undefined,
  logPrefix: string,
  userId: string | null,
  conversationId: string | undefined,
  streamMode: boolean = false,
  language: string = "es",
  languageName: string = "Español",
) {
  console.log(`${logPrefix} Processing bulletin request for: ${companyQuery}`);

  // 1. Find the company in our database
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  const normalizedQuery = normalize(companyQuery);
  const matchedCompany = companiesCache?.find((c) => {
    const name = normalize(c.issuer_name);
    const ticker = c.ticker?.toLowerCase() || "";
    if (name.includes(normalizedQuery) || normalizedQuery.includes(name)) return true;
    if (ticker === normalizedQuery) return true;
    // Check include_terms (aliases without accents)
    if (c.include_terms) {
      try {
        const terms = Array.isArray(c.include_terms) ? c.include_terms : JSON.parse(c.include_terms);
        if (
          terms.some((t: string) => {
            const nt = normalize(t);
            return (
              nt.length > 3 && (nt === normalizedQuery || normalizedQuery.includes(nt) || nt.includes(normalizedQuery))
            );
          })
        )
          return true;
      } catch (_) {
        /* ignore */
      }
    }
    return false;
  });

  if (!matchedCompany) {
    console.log(`${logPrefix} Company not found: ${companyQuery}`);
    const examplesList = companiesCache
      ?.slice(0, 10)
      .map((c) => `${c.issuer_name} (${c.ticker})`)
      .join(", ") || "";
    return new Response(
      JSON.stringify({
        answer: `❌ ${t(language, "company_not_found", { query: companyQuery, examples: examplesList })}`,
        suggestedQuestions: [
          t(language, "top5_ibex"),
          t(language, "bulletin_suggest", { company: "Telefónica" }),
          t(language, "energy_ranking"),
        ],
        metadata: { type: "error", bulletinRequested: true },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  console.log(`${logPrefix} Matched company: ${matchedCompany.issuer_name} (${matchedCompany.ticker})`);

  // 2. Get competitors using intelligent prioritization system (GUARDRAIL)
  const competitorLimit = 8; // Always exhaustive
  const competitorResult = await getRelevantCompetitors(
    matchedCompany,
    companiesCache || [],
    supabaseClient,
    competitorLimit,
    logPrefix,
  );
  const competitors = competitorResult.competitors;

  console.log(`${logPrefix} Smart competitor selection: ${competitors.map((c) => c.ticker).join(", ")}`);
  console.log(
    `${logPrefix} Competitor methodology: ${competitorResult.tierUsed} (verified: ${competitorResult.verifiedCount}, subsector: ${competitorResult.subsectorCount})`,
  );

  // 3. Get all tickers to fetch (company + competitors)
  const allTickers = [matchedCompany.ticker, ...competitors.map((c) => c.ticker)];

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. VECTOR STORE SEARCH - Qualitative context from AI explanations
  // ═══════════════════════════════════════════════════════════════════════════
  let vectorStoreContext = "";
  const vectorMatchCount = 30; // Always exhaustive

  try {
    // Generate embedding for the company name
    const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAIApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: `${matchedCompany.issuer_name} ${matchedCompany.ticker} reputación corporativa análisis`,
      }),
    });

    if (embeddingResponse.ok) {
      const embeddingData = await embeddingResponse.json();
      const queryEmbedding = embeddingData.data?.[0]?.embedding;

      if (queryEmbedding) {
        // Search Vector Store for relevant documents
        const { data: vectorDocs, error: vectorError } = await supabaseClient.rpc("match_documents", {
          query_embedding: queryEmbedding,
          match_count: vectorMatchCount,
          filter: {}, // Could filter by metadata->ticker if indexed
        });

        if (!vectorError && vectorDocs?.length > 0) {
          // Filter results to only include documents about this company
          const relevantDocs = vectorDocs.filter((doc: any) => {
            const content = doc.content?.toLowerCase() || "";
            const metadata = doc.metadata || {};
            return (
              content.includes(matchedCompany.ticker.toLowerCase()) ||
              content.includes(matchedCompany.issuer_name.toLowerCase()) ||
              metadata.ticker === matchedCompany.ticker
            );
          });

          if (relevantDocs.length > 0) {
            console.log(
              `${logPrefix} Vector Store: Found ${relevantDocs.length} relevant documents (from ${vectorDocs.length} total)`,
            );

            vectorStoreContext = `\n📚 ANÁLISIS CUALITATIVOS DE IAs (Vector Store - ${relevantDocs.length} documentos):\n`;
            relevantDocs.slice(0, 10).forEach((doc: any, i: number) => {
              const content = doc.content?.substring(0, 600) || "";
              const similarity = doc.similarity ? ` [Similaridad: ${(doc.similarity * 100).toFixed(1)}%]` : "";
              vectorStoreContext += `\n[Fuente ${i + 1}]${similarity}:\n${content}...\n`;
            });
          }
        }
      }
    }
  } catch (e) {
    console.warn(`${logPrefix} Vector Store search failed:`, e);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. CORPORATE NEWS - Recent news about the company
  // ═══════════════════════════════════════════════════════════════════════════
  let corporateNewsContext = "";

  try {
    const { data: corporateNews, error: newsError } = await supabaseClient
      .from("corporate_news")
      .select("headline, lead_paragraph, published_date, category")
      .eq("ticker", matchedCompany.ticker)
      .order("published_date", { ascending: false })
      .limit(5); // Always exhaustive

    if (!newsError && corporateNews?.length > 0) {
      console.log(`${logPrefix} Corporate News: Found ${corporateNews.length} recent articles`);

      corporateNewsContext = `\n📰 NOTICIAS CORPORATIVAS RECIENTES (${corporateNews.length}):\n`;
      corporateNews.forEach((news: any, i: number) => {
        corporateNewsContext += `${i + 1}. [${news.published_date || "Sin fecha"}] ${news.headline}\n`;
        if (news.lead_paragraph) {
          corporateNewsContext += `   ${news.lead_paragraph.substring(0, 200)}...\n`;
        }
      });
    }
  } catch (e) {
    console.warn(`${logPrefix} Corporate news fetch failed:`, e);
  }

  // 6. Fetch 4 weeks of data for company and competitors with ALL 6 AI models
  // Uses unified helper to combine rix_runs (legacy) + rix_runs_v2 (Grok, Qwen)
  const rixData = await fetchUnifiedRixData({
    supabaseClient,
    columns: `
      "02_model_name",
      "03_target_name",
      "05_ticker",
      "06_period_from",
      "07_period_to",
      "09_rix_score",
      "51_rix_score_adjusted",
      "10_resumen",
      "11_puntos_clave",
      "20_res_gpt_bruto",
      "21_res_perplex_bruto",
      "22_explicacion",
      "23_nvm_score",
      "25_nvm_categoria",
      "26_drm_score",
      "28_drm_categoria",
      "29_sim_score",
      "31_sim_categoria",
      "32_rmm_score",
      "34_rmm_categoria",
      "35_cem_score",
      "37_cem_categoria",
      "38_gam_score",
      "40_gam_categoria",
      "41_dcm_score",
      "43_dcm_categoria",
      "44_cxm_score",
      "46_cxm_categoria",
      "25_explicaciones_detalladas",
      batch_execution_date
    `,
    tickerFilter: allTickers,
    limit: 800,
    logPrefix,
  });

  console.log(`${logPrefix} Fetched ${rixData?.length || 0} RIX records for bulletin`);

  // 7. Organize data by week and company
  const getPeriodKey = (run: any) => `${run["06_period_from"]}|${run["07_period_to"]}`;
  const uniquePeriods = [...new Set(rixData?.map(getPeriodKey) || [])]
    .sort((a, b) => b.split("|")[1].localeCompare(a.split("|")[1]))
    .slice(0, 4); // Always exhaustive: 4 periods

  console.log(`${logPrefix} Unique periods found: ${uniquePeriods.length}`);

  // 8. Build bulletin context
  let bulletinContext = "";

  // Company info
  bulletinContext += `📌 EMPRESA PRINCIPAL:\n`;
  bulletinContext += `- Nombre: ${matchedCompany.issuer_name}\n`;
  bulletinContext += `- Ticker: ${matchedCompany.ticker}\n`;
  bulletinContext += `- Sector: ${matchedCompany.sector_category || "No especificado"}\n`;
  bulletinContext += `- Subsector: ${matchedCompany.subsector || "No definido"}\n`;
  bulletinContext += `- Categoría IBEX: ${matchedCompany.ibex_family_code || "No IBEX"}\n`;
  bulletinContext += `- Cotiza en bolsa: ${matchedCompany.cotiza_en_bolsa ? "Sí" : "No"}\n\n`;

  // Competitors info WITH METHODOLOGY JUSTIFICATION
  bulletinContext += `🏢 COMPETIDORES (${competitors.length}) - METODOLOGÍA DE SELECCIÓN:\n`;
  bulletinContext += `${competitorResult.justification}\n\n`;
  competitors.forEach((c, idx) => {
    bulletinContext += `${idx + 1}. ${c.issuer_name} (${c.ticker})\n`;
    bulletinContext += `   - Sector: ${c.sector_category || "Sin sector"} | Subsector: ${c.subsector || "N/D"}\n`;
  });
  bulletinContext += "\n";

  // Add Vector Store context if available
  if (vectorStoreContext) {
    bulletinContext += vectorStoreContext;
    bulletinContext += "\n";
  }

  // Add Corporate News context if available
  if (corporateNewsContext) {
    bulletinContext += corporateNewsContext;
    bulletinContext += "\n";
  }

  // Data by week with DETAILED metrics
  uniquePeriods.forEach((period, weekIdx) => {
    const [periodFrom, periodTo] = period.split("|");
    const weekData = rixData?.filter((r) => getPeriodKey(r) === period) || [];

    const weekLabel = weekIdx === 0 ? "SEMANA ACTUAL" : `SEMANA -${weekIdx}`;
    bulletinContext += `\n📅 ${weekLabel} (${periodFrom} a ${periodTo}):\n\n`;

    // DETAILED Data for main company
    const mainCompanyData = weekData.filter((r) => r["05_ticker"] === matchedCompany.ticker);
    bulletinContext += `**${matchedCompany.issuer_name} - DATOS DETALLADOS**:\n\n`;

    if (mainCompanyData.length > 0) {
      mainCompanyData.forEach((r) => {
        const score = r["51_rix_score_adjusted"] ?? r["09_rix_score"];
        bulletinContext += `### ${r["02_model_name"]} - RIX: ${score}\n`;

        // Include all RIX metrics
        bulletinContext += `**Métricas del RIX:**\n`;
        bulletinContext += `- NVM (Visibility): ${r["23_nvm_score"] ?? "N/A"} - ${r["25_nvm_categoria"] || "Sin categoría"}\n`;
        bulletinContext += `- DRM (Digital Resonance): ${r["26_drm_score"] ?? "N/A"} - ${r["28_drm_categoria"] || "Sin categoría"}\n`;
        bulletinContext += `- SIM (Sentiment): ${r["29_sim_score"] ?? "N/A"} - ${r["31_sim_categoria"] || "Sin categoría"}\n`;
        bulletinContext += `- RMM (Momentum): ${r["32_rmm_score"] ?? "N/A"} - ${r["34_rmm_categoria"] || "Sin categoría"}\n`;
        bulletinContext += `- CEM (Crisis Exposure): ${r["35_cem_score"] ?? "N/A"} - ${r["37_cem_categoria"] || "Sin categoría"}\n`;
        bulletinContext += `- GAM (Growth Association): ${r["38_gam_score"] ?? "N/A"} - ${r["40_gam_categoria"] || "Sin categoría"}\n`;
        bulletinContext += `- DCM (Data Consistency): ${r["41_dcm_score"] ?? "N/A"} - ${r["43_dcm_categoria"] || "Sin categoría"}\n`;
        bulletinContext += `- CXM (Customer Experience): ${r["44_cxm_score"] ?? "N/A"} - ${r["46_cxm_categoria"] || "Sin categoría"}\n`;

        // Include summary and key points
        if (r["10_resumen"]) {
          bulletinContext += `\n**Resumen de la IA:**\n${r["10_resumen"]}\n`;
        }
        if (r["11_puntos_clave"] && Array.isArray(r["11_puntos_clave"])) {
          bulletinContext += `\n**Puntos Clave:**\n`;
          r["11_puntos_clave"].forEach((punto: string, i: number) => {
            bulletinContext += `${i + 1}. ${punto}\n`;
          });
        }
        if (r["22_explicacion"]) {
          bulletinContext += `\n**Explicación del Score:**\n${r["22_explicacion"]}\n`;
        }
        if (r["25_explicaciones_detalladas"]) {
          bulletinContext += `\n**Explicaciones Detalladas por Métrica:**\n${JSON.stringify(r["25_explicaciones_detalladas"], null, 2)}\n`;
        }
        bulletinContext += "\n---\n";
      });

      const avgScore =
        mainCompanyData.reduce((sum, r) => sum + (r["51_rix_score_adjusted"] ?? r["09_rix_score"]), 0) /
        mainCompanyData.length;
      bulletinContext += `\n**PROMEDIO RIX ${matchedCompany.issuer_name}**: ${avgScore.toFixed(1)}\n`;
    } else {
      bulletinContext += `- Sin datos esta semana\n`;
    }
    bulletinContext += "\n";

    // Data for competitors with metrics
    bulletinContext += `**COMPETIDORES - RESUMEN ESTA SEMANA**:\n`;
    bulletinContext += `| Empresa | Ticker | RIX Prom | NVM | DRM | SIM | RMM | CEM | GAM | DCM | CXM |\n`;
    bulletinContext += `|---------|--------|----------|-----|-----|-----|-----|-----|-----|-----|-----|\n`;

    competitors.forEach((comp) => {
      const compData = weekData.filter((r) => r["05_ticker"] === comp.ticker);
      if (compData.length > 0) {
        const avgScore =
          compData.reduce((sum, r) => sum + (r["51_rix_score_adjusted"] ?? r["09_rix_score"]), 0) / compData.length;
        const avgNVM = compData.reduce((sum, r) => sum + (r["23_nvm_score"] || 0), 0) / compData.length;
        const avgDRM = compData.reduce((sum, r) => sum + (r["26_drm_score"] || 0), 0) / compData.length;
        const avgSIM = compData.reduce((sum, r) => sum + (r["29_sim_score"] || 0), 0) / compData.length;
        const avgRMM = compData.reduce((sum, r) => sum + (r["32_rmm_score"] || 0), 0) / compData.length;
        const avgCEM = compData.reduce((sum, r) => sum + (r["35_cem_score"] || 0), 0) / compData.length;
        const avgGAM = compData.reduce((sum, r) => sum + (r["38_gam_score"] || 0), 0) / compData.length;
        const avgDCM = compData.reduce((sum, r) => sum + (r["41_dcm_score"] || 0), 0) / compData.length;
        const avgCXM = compData.reduce((sum, r) => sum + (r["44_cxm_score"] || 0), 0) / compData.length;
        bulletinContext += `| ${comp.issuer_name} | ${comp.ticker} | ${avgScore.toFixed(1)} | ${avgNVM.toFixed(0)} | ${avgDRM.toFixed(0)} | ${avgSIM.toFixed(0)} | ${avgRMM.toFixed(0)} | ${avgCEM.toFixed(0)} | ${avgGAM.toFixed(0)} | ${avgDCM.toFixed(0)} | ${avgCXM.toFixed(0)} |\n`;
      }
    });
    bulletinContext += "\n";

    // Individual competitor details for current week only
    if (weekIdx === 0) {
      bulletinContext += `\n**DETALLES DE COMPETIDORES - SEMANA ACTUAL:**\n`;
      competitors.forEach((comp) => {
        const compData = weekData.filter((r) => r["05_ticker"] === comp.ticker);
        if (compData.length > 0) {
          bulletinContext += `\n### ${comp.issuer_name} (${comp.ticker}):\n`;
          compData.forEach((r) => {
            const score = r["51_rix_score_adjusted"] ?? r["09_rix_score"];
            bulletinContext += `- ${r["02_model_name"]}: RIX ${score}`;
            if (r["10_resumen"]) {
              bulletinContext += ` | Resumen: ${r["10_resumen"].substring(0, 200)}...`;
            }
            bulletinContext += "\n";
          });
        }
      });
    }
  });

  // Sector average calculation
  if (matchedCompany.sector_category) {
    const sectorCompanies = companiesCache?.filter((c) => c.sector_category === matchedCompany.sector_category) || [];
    const currentWeekData = rixData?.filter((r) => getPeriodKey(r) === uniquePeriods[0]) || [];

    let sectorTotal = 0;
    let sectorCount = 0;

    sectorCompanies.forEach((comp) => {
      const compData = currentWeekData.filter((r) => r["05_ticker"] === comp.ticker);
      if (compData.length > 0) {
        const avg =
          compData.reduce((sum, r) => sum + (r["51_rix_score_adjusted"] ?? r["09_rix_score"]), 0) / compData.length;
        sectorTotal += avg;
        sectorCount++;
      }
    });

    if (sectorCount > 0) {
      bulletinContext += `\n📊 CONTEXTO SECTORIAL:\n`;
      bulletinContext += `- Sector: ${matchedCompany.sector_category}\n`;
      bulletinContext += `- Total empresas en sector: ${sectorCompanies.length}\n`;
      bulletinContext += `- Empresas con datos esta semana: ${sectorCount}\n`;
      bulletinContext += `- RIX promedio del sector: ${(sectorTotal / sectorCount).toFixed(1)}\n\n`;
    }
  }

  // 7. Call AI with bulletin prompt
  console.log(`${logPrefix} Calling AI for bulletin generation (depth: ${depthLevel}, streaming: ${streamMode})...`);

  const bulletinUserPrompt = `Genera un BOLETÍN EJECUTIVO completo para la empresa ${matchedCompany.issuer_name} (${matchedCompany.ticker}).

CONTEXTO CON TODOS LOS DATOS:
${bulletinContext}

Usa SOLO estos datos para generar el boletín. Sigue el formato exacto especificado en tus instrucciones.`;

  const bulletinSystemPrompt = BULLETIN_SYSTEM_PROMPT; // Always full bulletin
  const bulletinMessages = [
    { role: "system", content: bulletinSystemPrompt },
    { role: "user", content: bulletinUserPrompt },
  ];

  // Always exhaustive configuration
  const bulletinMaxTokens = 40000;
  const bulletinTimeoutMs = 120000;
  const geminiModel = "gemini-2.5-flash";

  // =========================================================================
  // STREAMING MODE: Return SSE stream for real-time text generation
  // =========================================================================
  if (streamMode) {
    console.log(`${logPrefix} Starting STREAMING bulletin generation...`);

    const sseEncoder = createSSEEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial metadata
          controller.enqueue(
            sseEncoder({
              type: "start",
              metadata: {
                companyName: matchedCompany.issuer_name,
                ticker: matchedCompany.ticker,
                sector: matchedCompany.sector_category,
                subsector: matchedCompany.subsector,
                competitorsCount: competitors.length,
                competitorMethodology: competitorResult.tierUsed,
                competitorJustification: competitorResult.justification,
                verifiedCompetitors: competitorResult.verifiedCount,
                vectorStoreDocsUsed: vectorStoreContext ? true : false,
                corporateNewsUsed: corporateNewsContext ? true : false,
                weeksAnalyzed: uniquePeriods.length,
                dataPointsUsed: rixData?.length || 0,
              },
            }),
          );

          let accumulatedContent = "";
          let provider: "openai" | "gemini" = "openai";
          let inputTokens = 0;
          let outputTokens = 0;
          let streamError = false;

          // Try OpenAI first (unless quick mode prefers Gemini)
          if (!isQuickBulletin) {
            console.log(`${logPrefix} Trying OpenAI stream first...`);
            for await (const chunk of streamOpenAIResponse(
              bulletinMessages,
              "o3",
              bulletinMaxTokens,
              logPrefix,
              bulletinTimeoutMs,
            )) {
              if (chunk.type === "chunk" && chunk.text) {
                accumulatedContent += chunk.text;
                controller.enqueue(sseEncoder({ type: "chunk", text: chunk.text }));
              } else if (chunk.type === "done") {
                inputTokens = chunk.inputTokens || 0;
                outputTokens = chunk.outputTokens || 0;
                break;
              } else if (chunk.type === "error") {
                console.warn(`${logPrefix} OpenAI stream error: ${chunk.error}, falling back to Gemini...`);
                streamError = true;
                controller.enqueue(sseEncoder({ type: "fallback", metadata: { provider: "gemini" } }));
                break;
              }
            }
          } else {
            streamError = true; // Skip to Gemini for quick mode
          }

          // Fallback to Gemini if OpenAI failed
          if (streamError || accumulatedContent.length === 0) {
            provider = "gemini";
            accumulatedContent = ""; // Reset for Gemini response

            console.log(`${logPrefix} Using Gemini stream (${geminiModel})...`);
            for await (const chunk of streamGeminiResponse(
              bulletinMessages,
              geminiModel,
              bulletinMaxTokens,
              logPrefix,
              bulletinTimeoutMs,
            )) {
              if (chunk.type === "chunk" && chunk.text) {
                accumulatedContent += chunk.text;
                controller.enqueue(sseEncoder({ type: "chunk", text: chunk.text }));
              } else if (chunk.type === "done") {
                inputTokens = chunk.inputTokens || 0;
                outputTokens = chunk.outputTokens || 0;
                break;
              } else if (chunk.type === "error") {
                console.error(`${logPrefix} Gemini stream also failed: ${chunk.error}`);
                controller.enqueue(
                  sseEncoder({
                    type: "error",
                    error: `Error generando boletín: ${chunk.error}`,
                  }),
                );
                controller.close();
                return;
              }
            }
          }

          console.log(`${logPrefix} Bulletin stream completed (via ${provider}), length: ${accumulatedContent.length}`);

          // Log API usage in background
          logApiUsage({
            supabaseClient,
            edgeFunction: "chat-intelligence",
            provider,
            model: provider === "openai" ? "o3" : geminiModel,
            actionType: "bulletin_stream",
            inputTokens,
            outputTokens,
            userId,
            sessionId,
            metadata: {
              companyName: matchedCompany.issuer_name,
              ticker: matchedCompany.ticker,
              depth_level: depthLevel,
              streaming: true,
            },
          }).catch((e) => console.warn("Failed to log usage:", e));

          // Save to database in background
          if (sessionId) {
            supabaseClient
              .from("chat_intelligence_sessions")
              .insert([
                {
                  session_id: sessionId,
                  role: "user",
                  content: originalQuestion,
                  company: matchedCompany.ticker,
                  analysis_type: "bulletin",
                  user_id: userId,
                },
                {
                  session_id: sessionId,
                  role: "assistant",
                  content: accumulatedContent,
                  company: matchedCompany.ticker,
                  analysis_type: "bulletin",
                  structured_data_found: rixData?.length || 0,
                  user_id: userId,
                },
              ])
              .then(() => console.log(`${logPrefix} Session saved`))
              .catch((e: Error) => console.warn("Failed to save session:", e));
          }

          // Save to user_documents in background
          if (userId) {
            const documentTitle = `Boletín Ejecutivo: ${matchedCompany.issuer_name}`;
            supabaseClient
              .from("user_documents")
              .insert({
                user_id: userId,
                document_type: "bulletin",
                title: documentTitle,
                company_name: matchedCompany.issuer_name,
                ticker: matchedCompany.ticker,
                content_markdown: accumulatedContent,
                conversation_id: conversationId || null,
                metadata: {
                  sector: matchedCompany.sector_category,
                  competitorsCount: competitors.length,
                  weeksAnalyzed: uniquePeriods.length,
                  dataPointsUsed: rixData?.length || 0,
                  aiProvider: provider,
                  generatedAt: new Date().toISOString(),
                },
              })
              .then(() => console.log(`${logPrefix} Document saved`))
              .catch((e: Error) => console.warn("Failed to save document:", e));
          }

          // Generate suggested questions
          const suggestedQuestions = [
            `Genera un boletín de ${competitors[0]?.issuer_name || "otra empresa"}`,
            `¿Cómo se compara ${matchedCompany.issuer_name} con el sector ${matchedCompany.sector_category}?`,
            `Top 5 empresas del sector ${matchedCompany.sector_category}`,
          ];

          // Calculate divergence for methodology metadata
          const modelScores =
            rixData?.filter((r) => r["09_rix_score"] != null && r["09_rix_score"] > 0)?.map((r) => r["09_rix_score"]) ||
            [];
          const maxScore = modelScores.length > 0 ? Math.max(...modelScores) : 0;
          const minScore = modelScores.length > 0 ? Math.min(...modelScores) : 0;
          const divergencePoints = maxScore - minScore;
          const divergenceLevel = divergencePoints <= 8 ? "low" : divergencePoints <= 15 ? "medium" : "high";

          // Extract unique models used
          const modelsUsed = [...new Set(rixData?.map((r) => r["02_model_name"]).filter(Boolean) || [])];

          // Extract period info
          const periodFrom = rixData
            ?.map((r) => r["06_period_from"])
            .filter(Boolean)
            .sort()[0];
          const periodTo = rixData
            ?.map((r) => r["07_period_to"])
            .filter(Boolean)
            .sort()
            .reverse()[0];

          // Extract verified sources from raw AI responses (only ChatGPT + Perplexity)
          const verifiedSources = extractSourcesFromRixData(rixData || []);
          console.log(`${logPrefix} Extracted ${verifiedSources.length} verified sources from RIX data`);

          // Send final done event with enriched methodology metadata
          controller.enqueue(
            sseEncoder({
              type: "done",
              suggestedQuestions,
              metadata: {
                type: "bulletin",
                companyName: matchedCompany.issuer_name,
                ticker: matchedCompany.ticker,
                sector: matchedCompany.sector_category,
                competitorsCount: competitors.length,
                weeksAnalyzed: uniquePeriods.length,
                dataPointsUsed: rixData?.length || 0,
                aiProvider: provider,
                // Verified sources from ChatGPT and Perplexity for bibliography
                verifiedSources: verifiedSources.length > 0 ? verifiedSources : undefined,
                // Methodology metadata for "Radar Reputacional" validation sheet
                methodology: {
                  hasRixData: (rixData?.length || 0) > 0,
                  modelsUsed,
                  periodFrom,
                  periodTo,
                  observationsCount: rixData?.length || 0,
                  divergenceLevel,
                  divergencePoints,
                  uniqueCompanies: 1,
                  uniqueWeeks: uniquePeriods.length,
                },
              },
            }),
          );

          controller.close();
        } catch (error) {
          console.error(`${logPrefix} Streaming error:`, error);
          controller.enqueue(
            sseEncoder({
              type: "error",
              error: error instanceof Error ? error.message : "Error de streaming desconocido",
            }),
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // =========================================================================
  // NON-STREAMING MODE: Original behavior (for backwards compatibility)
  // =========================================================================
  const bulletinModel = isQuickBulletin ? "gpt-4o-mini" : "o3";

  const result = await callAIWithFallback(
    bulletinMessages,
    bulletinModel,
    bulletinMaxTokens,
    logPrefix,
    bulletinTimeoutMs,
    isQuickBulletin ? { preferGemini: true, geminiTimeout: bulletinTimeoutMs } : { geminiTimeout: bulletinTimeoutMs },
  );
  const bulletinContent = result.content;

  console.log(`${logPrefix} Bulletin generated (via ${result.provider}), length: ${bulletinContent.length}`);

  // Log API usage
  await logApiUsage({
    supabaseClient,
    edgeFunction: "chat-intelligence",
    provider: result.provider,
    model: result.model,
    actionType: "bulletin",
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    userId,
    sessionId,
    metadata: {
      companyName: matchedCompany.issuer_name,
      ticker: matchedCompany.ticker,
      depth_level: "bulletin",
    },
  });

  // 8. Save to database (chat_intelligence_sessions)
  if (sessionId) {
    await supabaseClient.from("chat_intelligence_sessions").insert([
      {
        session_id: sessionId,
        role: "user",
        content: originalQuestion,
        company: matchedCompany.ticker,
        analysis_type: "bulletin",
        user_id: userId,
      },
      {
        session_id: sessionId,
        role: "assistant",
        content: bulletinContent,
        company: matchedCompany.ticker,
        analysis_type: "bulletin",
        structured_data_found: rixData?.length || 0,
        user_id: userId,
      },
    ]);
  }

  // 8b. Save bulletin to user_documents for authenticated users
  if (userId) {
    const documentTitle = `Boletín Ejecutivo: ${matchedCompany.issuer_name}`;
    console.log(`${logPrefix} Saving bulletin to user_documents for user: ${userId}`);

    const { error: docError } = await supabaseClient.from("user_documents").insert({
      user_id: userId,
      document_type: "bulletin",
      title: documentTitle,
      company_name: matchedCompany.issuer_name,
      ticker: matchedCompany.ticker,
      content_markdown: bulletinContent,
      conversation_id: conversationId || null,
      metadata: {
        sector: matchedCompany.sector_category,
        competitorsCount: competitors.length,
        weeksAnalyzed: uniquePeriods.length,
        dataPointsUsed: rixData?.length || 0,
        aiProvider: result.provider,
        generatedAt: new Date().toISOString(),
      },
    });

    if (docError) {
      console.error(`${logPrefix} Error saving bulletin to user_documents:`, docError);
    } else {
      console.log(`${logPrefix} Bulletin saved to user_documents successfully`);
    }
  }

  // 9. Return bulletin response (i18n — now uses passed language)
  const suggestedQuestions = [
    t(language, "bulletin_post_suggest", { company: competitors[0]?.issuer_name || "otra empresa" }),
    t(language, "bulletin_post_compare", { company: matchedCompany.issuer_name, sector: matchedCompany.sector_category || "" }),
    t(language, "bulletin_post_top5", { sector: matchedCompany.sector_category || "" }),
  ];

  return new Response(
    JSON.stringify({
      answer: bulletinContent,
      suggestedQuestions,
      metadata: {
        type: "bulletin",
        companyName: matchedCompany.issuer_name,
        ticker: matchedCompany.ticker,
        sector: matchedCompany.sector_category,
        subsector: matchedCompany.subsector,
        competitorsCount: competitors.length,
        competitorMethodology: competitorResult.tierUsed,
        competitorJustification: competitorResult.justification,
        verifiedCompetitors: competitorResult.verifiedCount,
        vectorStoreDocsUsed: vectorStoreContext ? true : false,
        corporateNewsUsed: corporateNewsContext ? true : false,
        weeksAnalyzed: uniquePeriods.length,
        dataPointsUsed: rixData?.length || 0,
        aiProvider: result.provider,
      },
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

// =============================================================================
// STANDARD CHAT HANDLER (existing logic refactored)
// =============================================================================
// =============================================================================
// FUNCIÓN: Detectar empresas mencionadas en la pregunta
// =============================================================================
function detectCompaniesInQuestion(question: string, companiesCache: any[]): any[] {
  if (!companiesCache || companiesCache.length === 0) return [];

  const normalizedQuestion = question
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // Remove accents

  // Confidence-scored detection to avoid false positives
  const scored: { company: any; score: number }[] = [];

  // Expanded blacklist of generic words that appear in company names but are not distinctive
  const commonWords = new Set([
    "banco", "grupo", "empresa", "compania", "sociedad", "holding",
    "spain", "espana", "corp", "corporation", "energia", "capital",
    "inmobiliaria", "servicios", "internacional", "industria", "global",
    "digital", "comunicacion", "financiera", "renovable", "logistica",
    "gestion", "tecnologia", "infraestructuras", "soluciones", "sistemas",
    "desarrollo", "construccion", "ingenieria", "medios", "seguros",
    "inversiones", "recursos", "natural", "properties", "solutions",
  ]);

  // Helper to escape regex special characters
  const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  for (const company of companiesCache) {
    const companyName =
      company.issuer_name
        ?.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") || "";
    const ticker = company.ticker?.toLowerCase() || "";
    let bestScore = 0;

    // Full name match → score 1.0
    if (companyName && companyName.length > 3 && normalizedQuestion.includes(companyName)) {
      bestScore = 1.0;
    }

    // Ticker match (word boundary) → score 0.9
    if (bestScore < 0.9 && ticker && ticker.length >= 2) {
      const tickerRegex = new RegExp(`\\b${escapeRegex(ticker)}\\b`, "i");
      if (tickerRegex.test(normalizedQuestion)) {
        bestScore = Math.max(bestScore, 0.9);
      }
    }

    // include_terms match → score 0.8
    if (bestScore < 0.8 && company.include_terms) {
      try {
        const terms = Array.isArray(company.include_terms) ? company.include_terms : JSON.parse(company.include_terms);
        for (const term of terms) {
          const normalizedTerm = (term as string)
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
          if (normalizedTerm.length > 3 && normalizedQuestion.includes(normalizedTerm)) {
            bestScore = Math.max(bestScore, 0.8);
            break;
          }
        }
      } catch (_) {
        /* ignore parse errors */
      }
    }

    // Partial name word match → score 0.5 (only words >= 6 chars, not in blacklist)
    if (bestScore < 0.5) {
      const nameWords = companyName.split(/\s+/).filter(
        (word) => word.length >= 6 && !commonWords.has(word)
      );
      for (const word of nameWords) {
        // Require word boundary match to avoid substring false positives
        const wordRegex = new RegExp(`\\b${escapeRegex(word)}\\b`);
        if (wordRegex.test(normalizedQuestion)) {
          bestScore = Math.max(bestScore, 0.5);
          break;
        }
      }
    }

    if (bestScore >= 0.7) {
      scored.push({ company, score: bestScore });
    }
  }

  // Sort by confidence descending, deduplicate
  scored.sort((a, b) => b.score - a.score);
  const result = [...new Map(scored.map((s) => [s.company.ticker, s.company])).values()];
  
  if (result.length > 0) {
    console.log(`[CompanyDetect] Detected with scores: ${scored.map(s => `${s.company.issuer_name}(${s.score})`).join(", ")}`);
  }
  
  return result;
}

async function handleStandardChat(
  question: string,
  conversationHistory: any[],
  supabaseClient: any,
  openAIApiKey: string,
  sessionId: string | undefined,
  logPrefix: string,
  userId: string | null,
  language: string = "es",
  languageName: string = "Español",
  depthLevel: "quick" | "complete" | "exhaustive" = "complete",
  roleId?: string,
  roleName?: string,
  rolePrompt?: string,
  streamMode: boolean = false,
) {
  console.log(`${logPrefix} Depth level: ${depthLevel}, Role: ${roleName || "General"}`);

  // =============================================================================
  // PIPELINE MULTI-EXPERTO E1-E6
  // =============================================================================

  // --- E1: CLASIFICADOR DE INTENCIÓN ---
  console.log(`${logPrefix} [PIPELINE] Starting E1-E6 multi-expert pipeline...`);
  const classifier = await runClassifier(question, companiesCache || [], conversationHistory, language, logPrefix);
  // Attach original question for downstream use in buildDataPack (IBEX detection)
  (classifier as any)._originalQuestion = question;

  // Legacy fallback reference for downstream compatibility (suggestions, drumroll, session save)
  const detectedCompanies = classifier.empresas_detectadas.map(e => {
    const found = (companiesCache || []).find(c => c.ticker === e.ticker);
    return found || { ticker: e.ticker, issuer_name: e.nombre, sector_category: null, subsector: null, ibex_family_code: null, cotiza_en_bolsa: true };
  });
  console.log(`${logPrefix} [E1] Detected companies: ${detectedCompanies.map(c => c.issuer_name).join(", ") || "none"}`);

  // --- E2: DATAPACK SQL DETERMINISTA ---
  const dataPack = await buildDataPack(classifier, supabaseClient, companiesCache, logPrefix);

  // --- CONTEXTO COMPLEMENTARIO: Graph Expansion ---
  let graphContextString = "";
  if (detectedCompanies.length > 0) {
    try {
      const graphPromises = detectedCompanies.slice(0, 3).map(async (company) => {
        const { data, error } = await supabaseClient.rpc("expand_entity_graph_with_scores", {
          p_ticker: company.ticker,
          p_depth: 2,
          p_weeks: 4,
        });
        if (error) {
          console.warn(`${logPrefix} Graph expansion error for ${company.ticker}:`, error.message);
          return null;
        }
        return data;
      });
      const graphResults = (await Promise.all(graphPromises)).filter(Boolean);
      if (graphResults.length > 0) {
        // Build compact graph context
        const graphSections: string[] = [];
        for (const graph of graphResults) {
          if (!graph.primary_entity || !graph.graph) continue;
          const primary = graph.primary_entity;
          const primaryScore = graph.entity_scores?.[primary.ticker];
          graphSections.push(`## ${primary.name} (${primary.ticker})`);
          if (primaryScore) graphSections.push(`RIX Promedio: ${primaryScore.avg_rix} (${primaryScore.min_rix}-${primaryScore.max_rix})`);
          
          const competitors = graph.graph.filter((e: any) => e.relation === "COMPITE_CON");
          if (competitors.length > 0) {
            graphSections.push(`Competidores verificados:`);
            for (const comp of competitors) {
              const compScore = graph.entity_scores?.[comp.ticker];
              graphSections.push(`- ${comp.name} (${comp.ticker}): RIX ${compScore?.avg_rix || "N/A"}`);
            }
          }
          
          const allScores = Object.entries(graph.entity_scores || {})
            .filter(([t]) => t !== primary.ticker)
            .map(([t, s]: [string, any]) => ({ ticker: t, avg_rix: s.avg_rix }))
            .filter(e => e.avg_rix);
          if (allScores.length > 0) {
            const avgSector = Math.round(allScores.reduce((sum, e) => sum + e.avg_rix, 0) / allScores.length * 10) / 10;
            graphSections.push(`Promedio sectorial: ${avgSector}`);
            if (primaryScore) {
              const diff = (primaryScore.avg_rix - avgSector).toFixed(1);
              graphSections.push(`${primary.name}: ${parseFloat(diff) >= 0 ? "+" : ""}${diff} vs sector`);
            }
          }
        }
        graphContextString = graphSections.join("\n");
      }
      console.log(`${logPrefix} [GRAPH] Expansion complete: ${graphResults.length} graphs`);
    } catch (graphError) {
      console.warn(`${logPrefix} [GRAPH] Failed:`, graphError);
    }
  }

  // --- CONTEXTO COMPLEMENTARIO: Vector Search ---
  let vectorDocs: any[] = [];
  let vectorContextString = "";
  try {
    const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAIApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input: question }),
    });
    if (embeddingResponse.ok) {
      const embeddingData = await embeddingResponse.json();
      const embedding = embeddingData.data[0].embedding;
      const { data: docs } = await supabaseClient.rpc("match_documents", {
        query_embedding: embedding,
        match_count: 50,
        filter: {},
      });
      vectorDocs = docs || [];
      if (vectorDocs.length > 0) {
        vectorContextString = vectorDocs.slice(0, 10).map((doc: any, i: number) => {
          const meta = doc.metadata || {};
          return `[${i+1}] ${meta.company_name || "?"} - ${meta.week || "?"}: ${doc.content?.substring(0, 300) || ""}`;
        }).join("\n");
      }
      console.log(`${logPrefix} [VECTOR] Found ${vectorDocs.length} documents`);
    }
  } catch (vecError) {
    console.warn(`${logPrefix} [VECTOR] Failed:`, vecError);
  }

  // --- CONTEXTO COMPLEMENTARIO: Regression Analysis ---
  let regressionContextString = "";
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const regResponse = await fetch(`${supabaseUrl}/functions/v1/rix-regression-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseAnonKey}` },
      body: JSON.stringify({ minWeeks: 6 }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (regResponse.ok) {
      const regData = await regResponse.json();
      if (regData?.success && regData.topPredictors?.length > 0) {
        regressionContextString = `Correlaciones métricas RIX ↔ precio (${regData.dataProfile?.totalRecords || 0} registros, ${regData.dataProfile?.companiesWithPrices || 0} empresas):\n`;
        regressionContextString += regData.topPredictors.map((p: any) => 
          `${p.displayName}: r=${p.correlation > 0 ? "+" : ""}${p.correlation.toFixed(3)}`
        ).join(", ");
        regressionContextString += `\nR²: ${((regData.rSquared || 0) * 100).toFixed(1)}%`;
      }
      console.log(`${logPrefix} [REGRESSION] Loaded: ${regData?.dataProfile?.totalRecords || 0} records`);
    }
  } catch (regError) {
    console.warn(`${logPrefix} [REGRESSION] Failed:`, regError);
  }

  // --- E3: LECTOR CUALITATIVO ---
  const facts = await extractQualitativeFacts(dataPack.raw_texts, dataPack, logPrefix);

  // --- E4: COMPARADOR ANALÍTICO ---
  const analysis = await runComparator(dataPack, facts, classifier, logPrefix);

  // --- E5: ORQUESTADOR MAESTRO (construir prompt) ---
  const { systemPrompt, userPrompt } = buildOrchestratorPrompt(
    classifier, dataPack, facts, analysis, question, languageName, language, roleName, rolePrompt
  );

  // Inject supplementary context into userPrompt
  let enrichedUserPrompt = userPrompt;
  if (graphContextString) {
    enrichedUserPrompt += `\n\n═══ GRAFO DE CONOCIMIENTO (complementario) ═══\n${graphContextString}`;
  }
  if (vectorContextString) {
    enrichedUserPrompt += `\n\n═══ CONTEXTO VECTORIAL (complementario) ═══\n${vectorContextString}`;
  }
  if (regressionContextString) {
    enrichedUserPrompt += `\n\n═══ ANÁLISIS ESTADÍSTICO (complementario) ═══\n${regressionContextString}`;
  }

  console.log(`${logPrefix} [E5] Prompt built. System: ${systemPrompt.length} chars, User: ${enrichedUserPrompt.length} chars`);

  // --- Assemble messages for LLM ---
  console.log(`${logPrefix} Calling AI model (streaming: ${streamMode})...`);
  const messages = [
    { role: "system", content: systemPrompt },
    ...conversationHistory,
    { role: "user", content: enrichedUserPrompt },
  ];

  // Compatibility references for downstream code (suggestions, drumroll, session save)
  // Populate allRixData from dataPack.snapshot mapped to legacy format
  const allRixData: any[] = (dataPack?.snapshot || []).map((s: any) => ({
    "02_model_name": s.modelo,
    "03_target_name": dataPack.empresa_primaria?.nombre || "",
    "05_ticker": dataPack.empresa_primaria?.ticker || "",
    "06_period_from": s.period_from,
    "07_period_to": s.period_to,
    "09_rix_score": s.rix,
    "51_rix_score_adjusted": s.rix_adj,
    "23_nvm_score": s.nvm,
    "26_drm_score": s.drm,
    "29_sim_score": s.sim,
    "32_rmm_score": s.rmm,
    "35_cem_score": s.cem,
    "38_gam_score": s.gam,
    "41_dcm_score": s.dcm,
    "44_cxm_score": s.cxm,
    batch_execution_date: s.period_to,
  }));
  const detectedCompanyFullData: any[] = allRixData;

  // =========================================================================
  // STREAMING MODE: Return SSE stream for real-time text generation
  // =========================================================================
  if (streamMode) {
    console.log(`${logPrefix} Starting STREAMING standard chat...`);

    const sseEncoder = createSSEEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial metadata
          controller.enqueue(
            sseEncoder({
              type: "start",
              metadata: {
                language,
                languageName,
                depthLevel,
                detectedCompanies: detectedCompanies.map((c) => c.issuer_name),
              },
            }),
          );

          let accumulatedContent = "";
          let provider: "openai" | "gemini" = "openai";
          let inputTokens = 0;
          let outputTokens = 0;
          let streamError = false;
          let streamFinishReason = "";

          // Compliance buffer state for anti-hallucination gate
          const HOLDBACK_SIZE = 1200;
          const COMPLIANCE_SCAN_OVERLAP = 800;
          let emittedLength = 0;
          let forbiddenDetected = false;
          let segmentsGenerated = 1;
          let hadTruncation = false;
          let hadForbiddenPattern = false;

          // Helper: emit safe content from holdback buffer
          const flushSafeContent = (isFinal: boolean) => {
            if (forbiddenDetected) return;
            const checkEnd = isFinal ? accumulatedContent.length : Math.max(emittedLength, accumulatedContent.length - HOLDBACK_SIZE);
            if (checkEnd <= emittedLength) return;

            const pendingText = accumulatedContent.substring(emittedLength, checkEnd);
            const scanStart = Math.max(0, emittedLength - COMPLIANCE_SCAN_OVERLAP);
            const scanText = accumulatedContent.substring(scanStart, checkEnd);
            const forbiddenRelativeIndex = findForbiddenMatchIndex(scanText);

            if (forbiddenRelativeIndex !== -1) {
              hadForbiddenPattern = true;
              forbiddenDetected = true;
              const forbiddenAbsoluteIndex = scanStart + forbiddenRelativeIndex;

              const cleanedFull = stripForbiddenContent(
                accumulatedContent.substring(0, Math.max(emittedLength, forbiddenAbsoluteIndex)),
              );
              if (cleanedFull.length > emittedLength) {
                controller.enqueue(sseEncoder({ type: "chunk", text: cleanedFull.substring(emittedLength) }));
              }
              accumulatedContent = cleanedFull;
              emittedLength = cleanedFull.length;
              console.warn(`${logPrefix} Forbidden pattern detected and stripped at char ${forbiddenAbsoluteIndex}`);
              return;
            }

            controller.enqueue(sseEncoder({ type: "chunk", text: pendingText }));
            emittedLength = checkEnd;
          };

          // Helper: consume a stream generator with compliance buffer
          const consumeStream = async (
            generator: AsyncGenerator<any>,
            providerName: "openai" | "gemini"
          ): Promise<{ error: boolean; errorMsg?: string }> => {
            for await (const chunk of generator) {
              if (forbiddenDetected) break;

              if (chunk.type === "chunk" && chunk.text) {
                accumulatedContent += chunk.text;
                flushSafeContent(false);
              } else if (chunk.type === "done") {
                streamFinishReason = chunk.finishReason || "stop";
                inputTokens += (chunk.inputTokens || 0);
                outputTokens += (chunk.outputTokens || 0);
                flushSafeContent(true);
                return { error: false };
              } else if (chunk.type === "error") {
                console.warn(`${logPrefix} ${providerName} stream error: ${chunk.error}`);
                return { error: true, errorMsg: chunk.error };
              }
            }
            // Broke out due to forbidden detection
            if (forbiddenDetected) {
              streamFinishReason = "length";
              return { error: false };
            }
            flushSafeContent(true);
            return { error: false };
          };

          // Try OpenAI first (with compliance buffer)
          console.log(`${logPrefix} Trying OpenAI stream first (with compliance gate)...`);
          const openaiResult = await consumeStream(
            streamOpenAIResponse(messages, "o3", 40000, logPrefix, 120000),
            "openai"
          );

          if (openaiResult.error || accumulatedContent.length === 0) {
            streamError = true;
            controller.enqueue(sseEncoder({ type: "fallback", metadata: { provider: "gemini" } }));
          }

          // Fallback to Gemini if OpenAI failed
          if (streamError) {
            provider = "gemini";
            accumulatedContent = "";
            emittedLength = 0;
            forbiddenDetected = false;

            console.log(`${logPrefix} Using Gemini stream (gemini-2.5-flash) with compliance gate...`);
            const geminiResult = await consumeStream(
              streamGeminiResponse(messages, "gemini-2.5-flash", 40000, logPrefix, 120000),
              "gemini"
            );

            if (geminiResult.error && accumulatedContent.length === 0) {
              console.error(`${logPrefix} Gemini stream also failed: ${geminiResult.errorMsg}`);
              controller.enqueue(
                sseEncoder({
                  type: "error",
                  error: `Error generando respuesta: ${geminiResult.errorMsg}`,
                }),
              );
              controller.close();
              return;
            }
          }

          // =================================================================
          // AUTO-CONTINUATION: ONLY for real technical truncation or
          // forbidden pattern detected. NO more "too_short" forcing.
          // =================================================================
          const MAX_CONTINUATIONS = 4;

          while (
            (streamFinishReason === "length" || forbiddenDetected) &&
            segmentsGenerated <= MAX_CONTINUATIONS
          ) {
            hadTruncation = true;
            segmentsGenerated++;
            const reason = hadForbiddenPattern ? "forbidden_pattern" : "truncation";
            forbiddenDetected = false;
            streamFinishReason = "";

            console.log(`${logPrefix} Auto-continuation #${segmentsGenerated - 1} (reason: ${reason}, accumulated: ${accumulatedContent.length} chars)...`);

            // Re-inject question + data summary for context continuity
            const lastChunk = accumulatedContent.slice(-500);

            const continuationSystemPrompt = `Eres el Agente Rix continuando un informe de reputación corporativa. Continúa EXACTAMENTE desde el punto donde se interrumpió. REGLAS ESTRICTAS: 1) No repitas contenido ya escrito. 2) NUNCA menciones límites, truncaciones, longitud máxima, carpetas, archivos ni plataformas. 3) No añadas prólogos ni transiciones. 4) Mantén formato, tono y estructura. 5) Si el informe está completo, escribe solo una frase de cierre. Responde en ${languageName}.`;

            const continuationUserPrompt = `Pregunta original del usuario: "${question}"\n\nEl informe se interrumpió por truncación técnica. Último fragmento escrito:\n\n"""${lastChunk}"""\n\nContinúa escribiendo desde ahí. No repitas nada. Si el análisis ya está completo, cierra brevemente.`;

            const continuationMessages = [
              { role: "system", content: continuationSystemPrompt },
              { role: "user", content: continuationUserPrompt },
            ];

            const contGen = provider === "gemini"
              ? streamGeminiResponse(continuationMessages, "gemini-2.5-flash", 40000, logPrefix, 120000)
              : streamOpenAIResponse(continuationMessages, "o3", 40000, logPrefix, 120000);

            await consumeStream(contGen, provider);
          }

          console.log(
            `${logPrefix} Stream completed (via ${provider}), length: ${accumulatedContent.length}, segments: ${segmentsGenerated}, hadTruncation: ${hadTruncation}, hadForbiddenPattern: ${hadForbiddenPattern}`,
          );
          const answer = accumulatedContent;

          // Log API usage in background
          logApiUsage({
            supabaseClient,
            edgeFunction: "chat-intelligence",
            provider,
            model: provider === "openai" ? "o3" : "gemini-2.5-flash",
            actionType: "chat_stream",
            inputTokens,
            outputTokens,
            userId,
            sessionId,
            metadata: {
              depth_level: depthLevel,
              role: roleId || null,
              role_name: roleName || null,
              streaming: true,
            },
          }).catch((e) => console.warn("Failed to log usage:", e));

          // =============================================================================
          // Generate suggested questions and drumroll (same logic as non-streaming)
          // =============================================================================
          console.log(`${logPrefix} Generating follow-up questions for streaming response...`);

          // Simplified question generation for streaming (avoid long delay)
          let suggestedQuestions: string[] = [];
          let drumrollQuestion: DrumrollQuestion | null = null;

          try {
            // Quick question generation
            const questionPrompt = `Based on this analysis about ${detectedCompanies.map((c) => c.issuer_name).join(", ") || "corporate reputation"}, generate 3 follow-up questions in ${languageName}. Respond ONLY with a JSON array of 3 strings.`;
            const questionResult = await callAISimple(
              [
                {
                  role: "system",
                  content: `Generate follow-up questions in ${languageName}. Respond ONLY with JSON array.`,
                },
                { role: "user", content: questionPrompt },
              ],
              "gpt-4o-mini",
              300,
              logPrefix,
            );

            if (questionResult) {
              const cleanText = questionResult
                .replace(/```json\n?/g, "")
                .replace(/```\n?/g, "")
                .trim();
              suggestedQuestions = JSON.parse(cleanText);
            }
          } catch (qError) {
            console.warn(`${logPrefix} Error generating questions:`, qError);
          }

          // Generate drumroll question (always active in exhaustive mode)
          if (detectedCompanies.length > 0 && allRixData && allRixData.length > 0) {
            try {
              const insights = extractAnalysisInsights(allRixData, detectedCompanies[0], answer);
              if (insights) {
                drumrollQuestion = await generateDrumrollQuestion(
                  question,
                  insights,
                  detectedCompanies,
                  companiesCache,
                  language,
                  languageName,
                  logPrefix,
                );
              }
            } catch (dError) {
              console.warn(`${logPrefix} Error generating drumroll:`, dError);
            }
          }

          // Calculate methodology metadata
          const modelScores =
            allRixData
              ?.filter((r) => r["09_rix_score"] != null && r["09_rix_score"] > 0)
              ?.map((r) => r["09_rix_score"]) || [];
          const maxScoreMethod = modelScores.length > 0 ? Math.max(...modelScores) : 0;
          const minScoreMethod = modelScores.length > 0 ? Math.min(...modelScores) : 0;
          const divergencePointsMethod = maxScoreMethod - minScoreMethod;
          const divergenceLevelMethod =
            divergencePointsMethod <= 8 ? "low" : divergencePointsMethod <= 15 ? "medium" : "high";
          const modelsUsedMethod = [...new Set(allRixData?.map((r) => r["02_model_name"]).filter(Boolean) || [])];
          const periodFromMethod = allRixData
            ?.map((r) => r["06_period_from"])
            .filter(Boolean)
            .sort()[0];
          const periodToMethod = allRixData
            ?.map((r) => r["07_period_to"])
            .filter(Boolean)
            .sort()
            .reverse()[0];
          const uniqueCompaniesCount = new Set(allRixData?.map((r) => r["05_ticker"]).filter(Boolean) || []).size;
          const uniqueWeeksCount = allRixData ? [...new Set(allRixData.map((r) => r.batch_execution_date))].length : 0;

          // Save to database
          if (sessionId) {
            supabaseClient
              .from("chat_intelligence_sessions")
              .insert([
                {
                  session_id: sessionId,
                  role: "user",
                  content: question,
                  user_id: userId,
                  depth_level: depthLevel,
                },
                {
                  session_id: sessionId,
                  role: "assistant",
                  content: answer,
                  documents_found: vectorDocs?.length || 0,
                  structured_data_found: allRixData?.length || 0,
                  suggested_questions: suggestedQuestions,
                  drumroll_question: drumrollQuestion,
                  depth_level: depthLevel,
                  question_category: detectedCompanies.length > 0 ? "corporate_analysis" : "general_query",
                  user_id: userId,
                },
              ])
              .then(() => console.log(`${logPrefix} Session saved`))
              .catch((e: Error) => console.warn("Failed to save session:", e));
          }

          // Extract verified sources from full RIX data (includes raw AI responses)
          const verifiedSourcesStandard = extractSourcesFromRixData(detectedCompanyFullData || []);
          console.log(`${logPrefix} Extracted ${verifiedSourcesStandard.length} verified sources from RIX data`);

          // Send final done event with all metadata
          controller.enqueue(
            sseEncoder({
              type: "done",
              suggestedQuestions,
              drumrollQuestion,
              metadata: {
                type: "standard",
                documentsFound: vectorDocs?.length || 0,
                structuredDataFound: allRixData?.length || 0,
                dataWeeks: uniqueWeeksCount,
                aiProvider: provider,
                depthLevel,
                questionCategory: detectedCompanies.length > 0 ? "corporate_analysis" : "general_query",
                modelsUsed: modelsUsedMethod,
                periodFrom: periodFromMethod,
                periodTo: periodToMethod,
                divergenceLevel: divergenceLevelMethod,
                divergencePoints: divergencePointsMethod,
                uniqueCompanies: uniqueCompaniesCount,
                uniqueWeeks: uniqueWeeksCount,
                // Verified sources from ChatGPT and Perplexity for bibliography
                verifiedSources: verifiedSourcesStandard.length > 0 ? verifiedSourcesStandard : undefined,
                // Observability: anti-truncation metrics
                segmentsGenerated,
                hadTruncation,
                hadForbiddenPattern,
                finalOutputLength: answer.length,
                methodology: {
                  hasRixData: (allRixData?.length || 0) > 0,
                  modelsUsed: modelsUsedMethod,
                  periodFrom: periodFromMethod,
                  periodTo: periodToMethod,
                  observationsCount: allRixData?.length || 0,
                  divergenceLevel: divergenceLevelMethod,
                  divergencePoints: divergencePointsMethod,
                  uniqueCompanies: uniqueCompaniesCount,
                  uniqueWeeks: uniqueWeeksCount,
                },
              },
            }),
          );

          controller.close();
        } catch (error) {
          console.error(`${logPrefix} Streaming error:`, error);
          controller.enqueue(
            sseEncoder({
              type: "error",
              error: error instanceof Error ? error.message : "Error de streaming desconocido",
            }),
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // =========================================================================
  // NON-STREAMING MODE: Original behavior (for backwards compatibility)
  // =========================================================================
  let chatResult = await callAIWithFallback(messages, "o3", 40000, logPrefix);
  let answer = chatResult.content;

  // Non-streaming compliance gate: ONLY forbidden pattern continuation (no more too_short)
  let nonStreamSegments = 1;
  let nonStreamHadForbidden = false;
  const MAX_NS_CONTINUATIONS = 4;
  
  while (containsForbiddenPattern(answer) && nonStreamSegments <= MAX_NS_CONTINUATIONS) {
    nonStreamHadForbidden = true;
    answer = stripForbiddenContent(answer);
    nonStreamSegments++;
    
    console.warn(`${logPrefix} Non-streaming: forbidden_pattern detected (attempt ${nonStreamSegments}, chars: ${answer.length}), continuing...`);
    
    try {
      const lastChunk = answer.slice(-500);

      const sysPrompt = `Eres el Agente Rix continuando un informe. NUNCA menciones límites, truncaciones, longitud máxima, carpetas ni archivos. Responde en ${languageName}.`;

      const userPromptCont = `Pregunta original: "${question}"\n\nEl informe se interrumpió. Último fragmento:\n\n"""${lastChunk}"""\n\nContinúa desde ahí. No repitas.`;

      const contMessages = [
        { role: "system", content: sysPrompt },
        { role: "user", content: userPromptCont },
      ];
      const contResult = await callAIWithFallback(contMessages, "o3", 40000, logPrefix);
      answer += "\n\n" + (containsForbiddenPattern(contResult.content) ? stripForbiddenContent(contResult.content) : contResult.content);
      chatResult = { ...chatResult, outputTokens: chatResult.outputTokens + contResult.outputTokens };
      
      if (!containsForbiddenPattern(answer)) break;
    } catch (contError) {
      console.warn(`${logPrefix} Non-streaming continuation failed:`, contError);
      break;
    }
  }
  
  if (nonStreamHadForbidden || nonStreamSegments > 1) {
    console.log(`${logPrefix} Non-streaming compliance: ${nonStreamSegments} segments, final length: ${answer.length}, clean: ${!containsForbiddenPattern(answer)}`);
  }

  console.log(`${logPrefix} AI response received (via ${chatResult.provider}), length: ${answer.length}`);

  // Log API usage with depth_level tracking
  console.log(`${logPrefix} Logging API usage with depth_level: ${depthLevel}, role: ${roleId || "none"}`);
  await logApiUsage({
    supabaseClient,
    edgeFunction: "chat-intelligence",
    provider: chatResult.provider,
    model: chatResult.model,
    actionType: "chat",
    inputTokens: chatResult.inputTokens,
    outputTokens: chatResult.outputTokens,
    userId,
    sessionId,
    metadata: {
      depth_level: depthLevel,
      role: roleId || null,
      role_name: roleName || null,
    },
  });

  // =============================================================================
  // PASO 6: GENERAR PREGUNTAS SUGERIDAS BASADAS EN ANÁLISIS DE DATOS
  // =============================================================================
  console.log(`${logPrefix} Analyzing data for hidden patterns and generating smart questions...`);

  // =============================================================================
  // ANÁLISIS DE DATOS CON VALIDACIÓN DE CALIDAD
  // Solo genera insights basados en datos SÓLIDOS (cobertura completa de 4 modelos)
  // =============================================================================
  const analyzeDataForInsights = () => {
    if (!allRixData || allRixData.length === 0) {
      return { patterns: [], anomalies: [], surprises: [], modelDivergences: [], dataQuality: "insufficient" };
    }

    const patterns: string[] = [];
    const anomalies: string[] = [];
    const surprises: string[] = [];

    // Group data by company
    const byCompany: Record<string, any[]> = {};
    allRixData.forEach((r) => {
      const company = r["03_target_name"];
      if (!byCompany[company]) byCompany[company] = [];
      byCompany[company].push(r);
    });

    // =============================================================================
    // VALIDACIÓN DE CALIDAD: Solo considerar empresas con datos de los 4 modelos
    // =============================================================================
    const REQUIRED_MODELS = ["chatgpt", "perplexity", "gemini", "deepseek"];
    const MIN_MODELS_FOR_INSIGHT = 4; // Exigimos cobertura completa

    const companiesWithFullCoverage: Record<string, any[]> = {};
    Object.entries(byCompany).forEach(([company, records]) => {
      const modelsPresent = new Set(records.map((r) => r["02_model_name"]?.toLowerCase()).filter(Boolean));

      // Verificar que tenga datos de los 4 modelos con scores válidos
      const hasAllModels = REQUIRED_MODELS.every((model) =>
        records.some(
          (r) =>
            r["02_model_name"]?.toLowerCase().includes(model) && r["09_rix_score"] != null && r["09_rix_score"] > 0,
        ),
      );

      if (hasAllModels) {
        companiesWithFullCoverage[company] = records;
      }
    });

    const fullCoverageCount = Object.keys(companiesWithFullCoverage).length;
    console.log(
      `${logPrefix} Companies with full 4-model coverage: ${fullCoverageCount}/${Object.keys(byCompany).length}`,
    );

    // Si no hay suficientes empresas con cobertura completa, no generar insights
    if (fullCoverageCount < 10) {
      console.log(
        `${logPrefix} Insufficient data quality for insights (need at least 10 companies with full coverage)`,
      );
      return {
        patterns: [],
        anomalies: [],
        surprises: [],
        modelDivergences: [],
        dataQuality: "insufficient",
        coverageStats: { full: fullCoverageCount, total: Object.keys(byCompany).length },
      };
    }

    // =============================================================================
    // 1. DIVERGENCIAS ENTRE MODELOS (solo empresas con cobertura completa)
    // =============================================================================
    const modelDivergences: {
      company: string;
      ticker: string;
      chatgpt: number;
      deepseek: number;
      perplexity: number;
      gemini: number;
      maxDiff: number;
      models: string;
    }[] = [];

    Object.entries(companiesWithFullCoverage).forEach(([company, records]) => {
      const chatgpt = records.find((r) => r["02_model_name"]?.toLowerCase().includes("chatgpt"));
      const deepseek = records.find((r) => r["02_model_name"]?.toLowerCase().includes("deepseek"));
      const perplexity = records.find((r) => r["02_model_name"]?.toLowerCase().includes("perplexity"));
      const gemini = records.find((r) => r["02_model_name"]?.toLowerCase().includes("gemini"));

      if (chatgpt && deepseek && perplexity && gemini) {
        const scores = [
          { model: "ChatGPT", score: chatgpt["09_rix_score"] },
          { model: "DeepSeek", score: deepseek["09_rix_score"] },
          { model: "Perplexity", score: perplexity["09_rix_score"] },
          { model: "Gemini", score: gemini["09_rix_score"] },
        ];

        const maxScore = Math.max(...scores.map((s) => s.score));
        const minScore = Math.min(...scores.map((s) => s.score));
        const maxDiff = maxScore - minScore;

        // Solo reportar divergencias significativas (>=12 puntos) con datos sólidos
        if (maxDiff >= 12) {
          const highest = scores.find((s) => s.score === maxScore)!;
          const lowest = scores.find((s) => s.score === minScore)!;

          modelDivergences.push({
            company,
            ticker: chatgpt["05_ticker"] || "",
            chatgpt: chatgpt["09_rix_score"],
            deepseek: deepseek["09_rix_score"],
            perplexity: perplexity["09_rix_score"],
            gemini: gemini["09_rix_score"],
            maxDiff,
            models: `${highest.model} (${highest.score}) vs ${lowest.model} (${lowest.score})`,
          });
        }
      }
    });

    modelDivergences.sort((a, b) => b.maxDiff - a.maxDiff);
    if (modelDivergences.length > 0) {
      const top = modelDivergences[0];
      anomalies.push(`${top.company} tiene ${top.maxDiff} puntos de divergencia: ${top.models}`);
    }

    // =============================================================================
    // 2. ANÁLISIS SECTORIAL (solo con sectores que tengan ≥3 empresas con cobertura completa)
    // =============================================================================
    if (companiesCache) {
      const bySector: Record<string, { company: string; avgRix: number; ticker: string }[]> = {};

      Object.entries(companiesWithFullCoverage).forEach(([company, records]) => {
        const companyInfo = companiesCache?.find((c) => c.ticker === records[0]?.["05_ticker"]);
        const sector = companyInfo?.sector_category;
        if (!sector) return;

        // Calcular promedio de los 4 modelos para esta empresa
        const validScores = records.map((r) => r["09_rix_score"]).filter((s) => s != null && s > 0);
        if (validScores.length < 4) return; // Necesitamos los 4 scores

        const avgRix = validScores.reduce((a, b) => a + b, 0) / validScores.length;

        if (!bySector[sector]) bySector[sector] = [];
        bySector[sector].push({ company, avgRix, ticker: records[0]?.["05_ticker"] });
      });

      Object.entries(bySector).forEach(([sector, companies]) => {
        // Solo analizar sectores con al menos 3 empresas con cobertura completa
        if (companies.length < 3) return;

        const sectorAvg = companies.reduce((sum, c) => sum + c.avgRix, 0) / companies.length;
        const sortedByRix = [...companies].sort((a, b) => b.avgRix - a.avgRix);

        // Detectar outliers: empresas que difieren >12 puntos de la media sectorial
        companies.forEach((c) => {
          const diff = c.avgRix - sectorAvg;
          if (Math.abs(diff) >= 12) {
            const direction = diff > 0 ? "supera" : "está por debajo de";
            surprises.push(
              `${c.company} ${direction} la media del sector ${sector} (${sectorAvg.toFixed(0)}) en ${Math.abs(diff).toFixed(0)} puntos (promedio 4 modelos: ${c.avgRix.toFixed(0)})`,
            );
          }
        });
      });
    }

    // =============================================================================
    // 3. IBEX35 vs NO COTIZADAS (solo con cobertura completa)
    // =============================================================================
    if (companiesCache) {
      const ibex35Companies: { company: string; avgRix: number }[] = [];
      const nonTradedCompanies: { company: string; avgRix: number }[] = [];

      Object.entries(companiesWithFullCoverage).forEach(([company, records]) => {
        const companyInfo = companiesCache?.find((c) => c.ticker === records[0]?.["05_ticker"]);
        if (!companyInfo) return;

        const validScores = records.map((r) => r["09_rix_score"]).filter((s) => s != null && s > 0);
        if (validScores.length < 4) return;

        const avgRix = validScores.reduce((a, b) => a + b, 0) / validScores.length;

        if (companyInfo.ibex_family_code === "IBEX-35") {
          ibex35Companies.push({ company, avgRix });
        } else if (!companyInfo.cotiza_en_bolsa) {
          nonTradedCompanies.push({ company, avgRix });
        }
      });

      // Solo generar insight si hay suficientes datos en ambos grupos
      if (ibex35Companies.length >= 10 && nonTradedCompanies.length >= 5) {
        const avgIbex = ibex35Companies.reduce((sum, c) => sum + c.avgRix, 0) / ibex35Companies.length;

        const outperformers = nonTradedCompanies
          .filter((c) => c.avgRix > avgIbex + 5)
          .sort((a, b) => b.avgRix - a.avgRix);

        if (outperformers.length > 0) {
          const best = outperformers[0];
          patterns.push(
            `${best.company} (no cotizada, promedio ${best.avgRix.toFixed(0)}) supera la media del IBEX35 (${avgIbex.toFixed(0)}) basado en consenso de 4 modelos`,
          );
        }
      }
    }

    // =============================================================================
    // 4. DESEQUILIBRIOS DE MÉTRICAS (solo con todas las métricas presentes)
    // =============================================================================
    Object.entries(companiesWithFullCoverage).forEach(([company, records]) => {
      // Usar el registro con más métricas completas
      records.forEach((r) => {
        const metrics = [
          { name: "NVM", score: r["23_nvm_score"] },
          { name: "DRM", score: r["26_drm_score"] },
          { name: "SIM", score: r["29_sim_score"] },
          { name: "RMM", score: r["32_rmm_score"] },
          { name: "CEM", score: r["35_cem_score"] },
          { name: "GAM", score: r["38_gam_score"] },
          { name: "DCM", score: r["41_dcm_score"] },
          { name: "CXM", score: r["44_cxm_score"] },
        ].filter((m) => m.score != null && m.score > 0);

        // Solo considerar si tiene al menos 7 de 8 métricas (datos sólidos)
        if (metrics.length >= 7) {
          const max = metrics.reduce((a, b) => (a.score > b.score ? a : b));
          const min = metrics.reduce((a, b) => (a.score < b.score ? a : b));

          // Desequilibrio significativo: ≥30 puntos
          if (max.score - min.score >= 30) {
            const model = r["02_model_name"];
            patterns.push(
              `${company} (según ${model}): desequilibrio de ${max.score - min.score} pts entre ${max.name} (${max.score}) y ${min.name} (${min.score})`,
            );
          }
        }
      });
    });

    // =============================================================================
    // 5. CONSENSO vs DISCORDIA (solo empresas con 4 modelos)
    // =============================================================================
    Object.entries(companiesWithFullCoverage).forEach(([company, records]) => {
      const scores = records.map((r) => r["09_rix_score"]).filter((s) => s != null && s > 0);

      // Requiere exactamente 4 scores válidos
      if (scores.length !== 4) return;

      const min = Math.min(...scores);
      const max = Math.max(...scores);
      const range = max - min;
      const avg = scores.reduce((a, b) => a + b, 0) / 4;

      if (range <= 4) {
        patterns.push(
          `${company} tiene consenso perfecto entre los 4 modelos: RIX entre ${min} y ${max} (promedio: ${avg.toFixed(0)})`,
        );
      } else if (range >= 20) {
        anomalies.push(
          `${company} genera discordia total: ${range} puntos entre modelos (${min}-${max}), requiere análisis`,
        );
      }
    });

    // =============================================================================
    // 6. TENDENCIA DE MODELOS (solo con volumen suficiente)
    // =============================================================================
    const modelStats: Record<string, { scores: number[]; count: number }> = {};
    Object.values(companiesWithFullCoverage)
      .flat()
      .forEach((r) => {
        const model = r["02_model_name"];
        const score = r["09_rix_score"];
        if (!model || score == null || score <= 0) return;

        if (!modelStats[model]) modelStats[model] = { scores: [], count: 0 };
        modelStats[model].scores.push(score);
        modelStats[model].count++;
      });

    const modelRankings = Object.entries(modelStats)
      .filter(([_, data]) => data.count >= 50) // Mínimo 50 empresas para estadística robusta
      .map(([model, data]) => ({
        model,
        avg: data.scores.reduce((a, b) => a + b, 0) / data.count,
        count: data.count,
      }))
      .sort((a, b) => b.avg - a.avg);

    if (modelRankings.length >= 4) {
      const mostGenerous = modelRankings[0];
      const mostCritical = modelRankings[modelRankings.length - 1];
      const diff = mostGenerous.avg - mostCritical.avg;

      if (diff >= 4) {
        patterns.push(
          `${mostGenerous.model} es sistemáticamente ${diff.toFixed(1)} pts más generoso que ${mostCritical.model} (basado en ${mostGenerous.count} empresas con cobertura completa)`,
        );
      }
    }

    return {
      patterns: patterns.slice(0, 4),
      anomalies: anomalies.slice(0, 4),
      surprises: surprises.slice(0, 4),
      modelDivergences: modelDivergences.slice(0, 3),
      dataQuality: "solid",
      coverageStats: { full: fullCoverageCount, total: Object.keys(byCompany).length },
    };
  };

  const dataInsights = analyzeDataForInsights();
  console.log(
    `${logPrefix} Data insights found: ${dataInsights.patterns.length} patterns, ${dataInsights.anomalies.length} anomalies, ${dataInsights.surprises.length} surprises`,
  );

  // Extract topics already discussed to avoid repetition
  const discussedTopics = new Set<string>();
  const allConversationText = [...conversationHistory.map((m: any) => m.content || ""), question, answer]
    .join(" ")
    .toLowerCase();

  // Mark mentioned companies as discussed
  if (allRixData) {
    allRixData.forEach((r) => {
      const companyName = r["03_target_name"]?.toLowerCase();
      if (companyName && allConversationText.includes(companyName)) {
        discussedTopics.add(companyName);
      }
    });
  }

  const availableSectors = companiesCache
    ? [...new Set(companiesCache.map((c) => c.sector_category).filter(Boolean))].join(", ")
    : "Energía, Banca, Telecomunicaciones, Construcción, Tecnología, Consumo";

  // Build prompt with REAL DATA DISCOVERIES (solo si hay calidad suficiente)
  const hasQualityData =
    dataInsights.dataQuality === "solid" &&
    (dataInsights.patterns.length > 0 || dataInsights.anomalies.length > 0 || dataInsights.surprises.length > 0);

  const dataDiscoveriesPrompt = hasQualityData
    ? `You are an EXPERT DATA ANALYST who has discovered hidden patterns analyzing ${dataInsights.coverageStats?.full || "multiple"} companies with COMPLETE COVERAGE from all 4 AI models. Generate 3 questions that SURPRISE the user by revealing non-obvious insights.

🔬 VERIFIED DISCOVERIES (based ONLY on companies with data from ChatGPT + Perplexity + Gemini + DeepSeek):

📊 DETECTED PATTERNS:
${dataInsights.patterns.map((p, i) => `${i + 1}. ${p}`).join("\n")}

⚠️ ANOMALIES FOUND:
${dataInsights.anomalies.length > 0 ? dataInsights.anomalies.map((a, i) => `${i + 1}. ${a}`).join("\n") : "- No significant anomalies with solid data"}

💡 DATA SURPRISES:
${dataInsights.surprises.length > 0 ? dataInsights.surprises.map((s, i) => `${i + 1}. ${s}`).join("\n") : "- No notable surprises with complete data"}

🎯 MAXIMUM DIVERGENCES BETWEEN MODELS (4 models analyzed):
${
  dataInsights.modelDivergences?.length > 0
    ? dataInsights.modelDivergences
        .map((d, i) => `${i + 1}. ${d.company}: ${d.models} = ${d.maxDiff} pts difference`)
        .join("\n")
    : "- High consensus between models"
}

📈 DATA QUALITY: ${dataInsights.coverageStats?.full}/${dataInsights.coverageStats?.total} companies with complete 4-model coverage

TOPICS ALREADY DISCUSSED (AVOID REPEATING):
${[...discussedTopics].slice(0, 10).join(", ") || "None specific yet"}

CURRENT USER QUESTION: "${question}"

🧠 YOUR MISSION: Generate 3 questions that:

1. **REVEAL HIDDEN DATA**: Use ONLY the verified discoveries above (never invent)
2. **SURPRISE WITH CONCRETE FACTS**: Each question must mention specific data
3. **BE IMPOSSIBLE TO IGNORE**: Questions that generate immediate curiosity

❌ FORBIDDEN:
- Generic questions the user could guess
- Inventing data or companies not listed above
- Repeating companies or topics already discussed
- Questions based on incomplete or partial data

🌐 CRITICAL - LANGUAGE: Generate ALL questions in ${languageName} (${language}). Every single question MUST be written in ${languageName}.

Respond ONLY with a JSON array of 3 questions in ${languageName}:
["question 1", "question 2", "question 3"]`
    : `Generate 3 generic but useful questions about corporate reputation analysis for IBEX35 and Spanish companies.

CURRENT USER QUESTION: "${question}"

Avoid: obvious questions like "What's the top 5?". 
Suggest: sector comparisons, AI model divergences, non-listed vs IBEX35 companies.

🌐 CRITICAL - LANGUAGE: Generate ALL questions in ${languageName} (${language}). Every single question MUST be written in ${languageName}.

Respond ONLY with a JSON array of 3 strings in ${languageName}:
["question 1", "question 2", "question 3"]`;

  try {
    const questionsMessages = [
      {
        role: "system",
        content: `You are a data analyst who generates questions based on REAL discoveries. Each question must reveal a hidden insight in the data. IMPORTANT: Generate all questions in ${languageName}. Respond ONLY with the JSON array.`,
      },
      { role: "user", content: dataDiscoveriesPrompt },
    ];

    let suggestedQuestions: string[] = [];

    const questionsText = await callAISimple(questionsMessages, "gpt-4o-mini", 600, logPrefix);
    if (questionsText) {
      try {
        const cleanText = questionsText
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .trim();
        suggestedQuestions = JSON.parse(cleanText);
        console.log(`${logPrefix} Generated ${suggestedQuestions.length} data-driven questions`);
      } catch (parseError) {
        console.warn(`${logPrefix} Error parsing follow-up questions:`, parseError);
        suggestedQuestions = [];
      }
    }

    // =============================================================================
    // GENERATE DRUMROLL QUESTION (Complementary Report Suggestion)
    // Always active in exhaustive mode
    // =============================================================================
    // Extract structured insights from the rix data for drumroll generation
    let drumrollQuestion: DrumrollQuestion | null = null;
    if (detectedCompanies.length > 0 && allRixData && allRixData.length > 0) {
      console.log(`${logPrefix} Extracting analysis insights for ${detectedCompanies[0]?.issuer_name}...`);

      const insights = extractAnalysisInsights(allRixData, detectedCompanies[0], answer);

      if (insights) {
        console.log(
          `${logPrefix} Insights extracted: RIX=${insights.overallScore}, weakest=${insights.weakestMetrics[0]?.name}, trend=${insights.trend}(${insights.trendDelta}pts), divergence=${insights.divergenceLevel}`,
        );

        drumrollQuestion = await generateDrumrollQuestion(
          question,
          insights,
          detectedCompanies,
          companiesCache,
          language,
          languageName,
          logPrefix,
        );
      } else {
        console.log(`${logPrefix} No insights extracted - skipping drumroll`);
      }
    }

    // Determine question category (simplified classification)
    const questionCategory = detectedCompanies.length > 0 ? "corporate_analysis" : "general_query";

    // Save to database with new fields
    if (sessionId) {
      await supabaseClient.from("chat_intelligence_sessions").insert([
        {
          session_id: sessionId,
          role: "user",
          content: question,
          user_id: userId,
          depth_level: depthLevel,
        },
        {
          session_id: sessionId,
          role: "assistant",
          content: answer,
          documents_found: vectorDocs?.length || 0,
          structured_data_found: allRixData?.length || 0,
          suggested_questions: suggestedQuestions,
          drumroll_question: drumrollQuestion,
          depth_level: depthLevel,
          question_category: questionCategory,
          user_id: userId,
        },
      ]);
    }

    // Calculate divergence for methodology metadata
    const modelScores =
      allRixData?.filter((r) => r["09_rix_score"] != null && r["09_rix_score"] > 0)?.map((r) => r["09_rix_score"]) ||
      [];
    const maxScoreMethod = modelScores.length > 0 ? Math.max(...modelScores) : 0;
    const minScoreMethod = modelScores.length > 0 ? Math.min(...modelScores) : 0;
    const divergencePointsMethod = maxScoreMethod - minScoreMethod;
    const divergenceLevelMethod =
      divergencePointsMethod <= 8 ? "low" : divergencePointsMethod <= 15 ? "medium" : "high";

    // Extract unique models used
    const modelsUsedMethod = [...new Set(allRixData?.map((r) => r["02_model_name"]).filter(Boolean) || [])];

    // Extract period info
    const periodFromMethod = allRixData
      ?.map((r) => r["06_period_from"])
      .filter(Boolean)
      .sort()[0];
    const periodToMethod = allRixData
      ?.map((r) => r["07_period_to"])
      .filter(Boolean)
      .sort()
      .reverse()[0];

    // Extract unique companies and weeks
    const uniqueCompaniesCount = new Set(allRixData?.map((r) => r["05_ticker"]).filter(Boolean) || []).size;
    const uniqueWeeksCount = allRixData ? [...new Set(allRixData.map((r) => r.batch_execution_date))].length : 0;

    return new Response(
      JSON.stringify({
        answer,
        suggestedQuestions,
        drumrollQuestion,
        metadata: {
          documentsFound: vectorDocs?.length || 0,
          structuredDataFound: allRixData?.length || 0,
          dataWeeks: uniqueWeeksCount,
          aiProvider: chatResult.provider,
          depthLevel,
          questionCategory,
          // Methodology metadata for "Radar Reputacional" validation sheet
          modelsUsed: modelsUsedMethod,
          periodFrom: periodFromMethod,
          periodTo: periodToMethod,
          divergenceLevel: divergenceLevelMethod,
          divergencePoints: divergencePointsMethod,
          uniqueCompanies: uniqueCompaniesCount,
          uniqueWeeks: uniqueWeeksCount,
          methodology: {
            hasRixData: (allRixData?.length || 0) > 0,
            modelsUsed: modelsUsedMethod,
            periodFrom: periodFromMethod,
            periodTo: periodToMethod,
            observationsCount: allRixData?.length || 0,
            divergenceLevel: divergenceLevelMethod,
            divergencePoints: divergencePointsMethod,
            uniqueCompanies: uniqueCompaniesCount,
            uniqueWeeks: uniqueWeeksCount,
          },
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (questionsError) {
    console.error(`${logPrefix} Error generating follow-up questions:`, questionsError);
    return new Response(
      JSON.stringify({
        answer,
        suggestedQuestions: [],
        drumrollQuestion: null,
        metadata: {
          documentsFound: vectorDocs?.length || 0,
          structuredDataFound: allRixData?.length || 0,
          dataWeeks: allRixData ? [...new Set(allRixData.map((r) => r.batch_execution_date))].length : 0,
          aiProvider: chatResult.provider,
          depthLevel,
          questionCategory: "error",
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
}
