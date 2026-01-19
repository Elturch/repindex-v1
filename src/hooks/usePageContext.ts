import { useLocation } from "react-router-dom";
import { useMemo } from "react";
import { ChatLanguage, DEFAULT_LANGUAGE } from "@/lib/chatLanguages";

interface PageContextSuggestions {
  name: string;
  description: string;
  suggestions: string[];
}

// Multilingual page contexts
const getPageContexts = (lang: string): Record<string, PageContextSuggestions> => {
  const translations: Record<string, Record<string, PageContextSuggestions>> = {
    es: {
      '/': {
        name: 'Inicio',
        description: 'Página de bienvenida de RepIndex',
        suggestions: [
          '¿Qué es el RIX Score y cómo se calcula?',
          '¿Cuáles son las empresas mejor valoradas esta semana?',
          '¿Cómo funciona RepIndex?',
          'Compara empresas cotizadas vs no cotizadas',
        ]
      },
      '/dashboard': {
        name: 'Dashboard',
        description: 'Tabla de resultados RIX semanal',
        suggestions: [
          '¿Qué empresas han mejorado más esta semana?',
          '¿Qué empresas del IBEX35 lideran el ranking?',
          'Compara empresas cotizadas vs no cotizadas',
          '¿Qué sectores tienen mejor reputación?',
        ]
      },
      '/market-evolution': {
        name: 'Evolución del Mercado',
        description: 'Gráficos de tendencias temporales',
        suggestions: [
          '¿Qué sectores muestran tendencia alcista?',
          '¿Qué empresas han sido más volátiles?',
          'Analiza la evolución del sector bancario',
          '¿Cuáles son las tendencias de esta semana?',
        ]
      },
      '/noticias': {
        name: 'Boletín Semanal',
        description: 'Noticias y análisis de reputación',
        suggestions: [
          '¿Cuáles son las principales noticias de esta semana?',
          '¿Cuál es la calidad de los datos recogidos?',
          'Resume las tendencias más importantes',
          '¿Qué empresas destacan en el boletín?',
        ]
      },
      '/chat': {
        name: 'Agente Rix',
        description: 'Análisis conversacional de datos',
        suggestions: [
          '¿Cuáles son las 5 empresas con mejor RIX Score?',
          'Compara la evolución de Telefónica e Iberdrola',
          '¿Cómo evalúan las IAs a BBVA?',
          'Análisis cruzado de empresas del sector energético',
        ]
      },
    },
    en: {
      '/': {
        name: 'Home',
        description: 'RepIndex welcome page',
        suggestions: [
          'What is the RIX Score and how is it calculated?',
          'Which companies are best rated this week?',
          'How does RepIndex work?',
          'Compare listed vs non-listed companies',
        ]
      },
      '/dashboard': {
        name: 'Dashboard',
        description: 'Weekly RIX results table',
        suggestions: [
          'Which companies improved the most this week?',
          'Which IBEX35 companies lead the ranking?',
          'Compare listed vs non-listed companies',
          'Which sectors have the best reputation?',
        ]
      },
      '/market-evolution': {
        name: 'Market Evolution',
        description: 'Temporal trend charts',
        suggestions: [
          'Which sectors show an upward trend?',
          'Which companies have been most volatile?',
          'Analyze the banking sector evolution',
          'What are the trends this week?',
        ]
      },
      '/noticias': {
        name: 'Weekly Bulletin',
        description: 'News and reputation analysis',
        suggestions: [
          'What are the main news this week?',
          'What is the quality of the collected data?',
          'Summarize the most important trends',
          'Which companies stand out in the bulletin?',
        ]
      },
      '/chat': {
        name: 'Rix Agent',
        description: 'Conversational data analysis',
        suggestions: [
          'What are the top 5 companies by RIX Score?',
          'Compare the evolution of Telefónica and Iberdrola',
          'How do AIs evaluate BBVA?',
          'Cross-analysis of energy sector companies',
        ]
      },
    },
    fr: {
      '/': {
        name: 'Accueil',
        description: 'Page d\'accueil RepIndex',
        suggestions: [
          'Qu\'est-ce que le RIX Score et comment est-il calculé?',
          'Quelles sont les entreprises les mieux notées cette semaine?',
          'Comment fonctionne RepIndex?',
          'Comparer les entreprises cotées vs non cotées',
        ]
      },
      '/dashboard': {
        name: 'Tableau de bord',
        description: 'Tableau des résultats RIX hebdomadaires',
        suggestions: [
          'Quelles entreprises se sont le plus améliorées cette semaine?',
          'Quelles entreprises de l\'IBEX35 mènent le classement?',
          'Comparer les entreprises cotées vs non cotées',
          'Quels secteurs ont la meilleure réputation?',
        ]
      },
      '/market-evolution': {
        name: 'Évolution du Marché',
        description: 'Graphiques de tendances temporelles',
        suggestions: [
          'Quels secteurs montrent une tendance haussière?',
          'Quelles entreprises ont été les plus volatiles?',
          'Analyser l\'évolution du secteur bancaire',
          'Quelles sont les tendances de cette semaine?',
        ]
      },
      '/noticias': {
        name: 'Bulletin Hebdomadaire',
        description: 'Actualités et analyse de réputation',
        suggestions: [
          'Quelles sont les principales actualités de cette semaine?',
          'Quelle est la qualité des données collectées?',
          'Résumer les tendances les plus importantes',
          'Quelles entreprises se démarquent dans le bulletin?',
        ]
      },
      '/chat': {
        name: 'Agent Rix',
        description: 'Analyse conversationnelle des données',
        suggestions: [
          'Quelles sont les 5 meilleures entreprises par RIX Score?',
          'Comparer l\'évolution de Telefónica et Iberdrola',
          'Comment les IAs évaluent-elles BBVA?',
          'Analyse croisée des entreprises du secteur énergétique',
        ]
      },
    },
    de: {
      '/': {
        name: 'Startseite',
        description: 'RepIndex Willkommensseite',
        suggestions: [
          'Was ist der RIX Score und wie wird er berechnet?',
          'Welche Unternehmen sind diese Woche am besten bewertet?',
          'Wie funktioniert RepIndex?',
          'Vergleiche börsennotierte vs. nicht börsennotierte Unternehmen',
        ]
      },
      '/dashboard': {
        name: 'Dashboard',
        description: 'Wöchentliche RIX-Ergebnistabelle',
        suggestions: [
          'Welche Unternehmen haben sich diese Woche am meisten verbessert?',
          'Welche IBEX35-Unternehmen führen das Ranking an?',
          'Vergleiche börsennotierte vs. nicht börsennotierte Unternehmen',
          'Welche Branchen haben den besten Ruf?',
        ]
      },
      '/market-evolution': {
        name: 'Marktentwicklung',
        description: 'Zeitliche Trenddiagramme',
        suggestions: [
          'Welche Sektoren zeigen einen Aufwärtstrend?',
          'Welche Unternehmen waren am volatilsten?',
          'Analysiere die Entwicklung des Bankensektors',
          'Was sind die Trends dieser Woche?',
        ]
      },
      '/noticias': {
        name: 'Wochenbulletin',
        description: 'Nachrichten und Reputationsanalyse',
        suggestions: [
          'Was sind die wichtigsten Nachrichten dieser Woche?',
          'Wie ist die Qualität der gesammelten Daten?',
          'Fasse die wichtigsten Trends zusammen',
          'Welche Unternehmen stechen im Bulletin hervor?',
        ]
      },
      '/chat': {
        name: 'Rix Agent',
        description: 'Konversationelle Datenanalyse',
        suggestions: [
          'Was sind die Top 5 Unternehmen nach RIX Score?',
          'Vergleiche die Entwicklung von Telefónica und Iberdrola',
          'Wie bewerten die KIs BBVA?',
          'Kreuzanalyse der Energiesektor-Unternehmen',
        ]
      },
    },
    pt: {
      '/': {
        name: 'Início',
        description: 'Página de boas-vindas do RepIndex',
        suggestions: [
          'O que é o RIX Score e como é calculado?',
          'Quais são as empresas melhor avaliadas esta semana?',
          'Como funciona o RepIndex?',
          'Compare empresas cotadas vs não cotadas',
        ]
      },
      '/dashboard': {
        name: 'Painel',
        description: 'Tabela de resultados RIX semanal',
        suggestions: [
          'Quais empresas mais melhoraram esta semana?',
          'Quais empresas do IBEX35 lideram o ranking?',
          'Compare empresas cotadas vs não cotadas',
          'Quais setores têm melhor reputação?',
        ]
      },
      '/market-evolution': {
        name: 'Evolução do Mercado',
        description: 'Gráficos de tendências temporais',
        suggestions: [
          'Quais setores mostram tendência de alta?',
          'Quais empresas foram mais voláteis?',
          'Analise a evolução do setor bancário',
          'Quais são as tendências desta semana?',
        ]
      },
      '/noticias': {
        name: 'Boletim Semanal',
        description: 'Notícias e análise de reputação',
        suggestions: [
          'Quais são as principais notícias desta semana?',
          'Qual é a qualidade dos dados coletados?',
          'Resuma as tendências mais importantes',
          'Quais empresas se destacam no boletim?',
        ]
      },
      '/chat': {
        name: 'Agente Rix',
        description: 'Análise conversacional de dados',
        suggestions: [
          'Quais são as 5 melhores empresas por RIX Score?',
          'Compare a evolução de Telefónica e Iberdrola',
          'Como as IAs avaliam o BBVA?',
          'Análise cruzada de empresas do setor energético',
        ]
      },
    },
    it: {
      '/': {
        name: 'Home',
        description: 'Pagina di benvenuto RepIndex',
        suggestions: [
          'Cos\'è il RIX Score e come viene calcolato?',
          'Quali sono le aziende meglio valutate questa settimana?',
          'Come funziona RepIndex?',
          'Confronta aziende quotate vs non quotate',
        ]
      },
      '/dashboard': {
        name: 'Dashboard',
        description: 'Tabella risultati RIX settimanale',
        suggestions: [
          'Quali aziende sono migliorate di più questa settimana?',
          'Quali aziende IBEX35 guidano la classifica?',
          'Confronta aziende quotate vs non quotate',
          'Quali settori hanno la migliore reputazione?',
        ]
      },
      '/market-evolution': {
        name: 'Evoluzione del Mercato',
        description: 'Grafici delle tendenze temporali',
        suggestions: [
          'Quali settori mostrano una tendenza al rialzo?',
          'Quali aziende sono state più volatili?',
          'Analizza l\'evoluzione del settore bancario',
          'Quali sono le tendenze di questa settimana?',
        ]
      },
      '/noticias': {
        name: 'Bollettino Settimanale',
        description: 'Notizie e analisi della reputazione',
        suggestions: [
          'Quali sono le principali notizie di questa settimana?',
          'Qual è la qualità dei dati raccolti?',
          'Riassumi le tendenze più importanti',
          'Quali aziende si distinguono nel bollettino?',
        ]
      },
      '/chat': {
        name: 'Agente Rix',
        description: 'Analisi conversazionale dei dati',
        suggestions: [
          'Quali sono le 5 migliori aziende per RIX Score?',
          'Confronta l\'evoluzione di Telefónica e Iberdrola',
          'Come valutano le IA BBVA?',
          'Analisi incrociata delle aziende del settore energetico',
        ]
      },
    },
    ar: {
      '/': {
        name: 'الرئيسية',
        description: 'صفحة ترحيب RepIndex',
        suggestions: [
          'ما هو مؤشر RIX وكيف يتم حسابه؟',
          'ما هي الشركات الأفضل تقييماً هذا الأسبوع؟',
          'كيف يعمل RepIndex؟',
          'قارن الشركات المدرجة مقابل غير المدرجة',
        ]
      },
      '/dashboard': {
        name: 'لوحة التحكم',
        description: 'جدول نتائج RIX الأسبوعية',
        suggestions: [
          'ما هي الشركات التي تحسنت أكثر هذا الأسبوع؟',
          'ما هي شركات IBEX35 التي تتصدر التصنيف؟',
          'قارن الشركات المدرجة مقابل غير المدرجة',
          'ما هي القطاعات ذات السمعة الأفضل؟',
        ]
      },
      '/market-evolution': {
        name: 'تطور السوق',
        description: 'مخططات الاتجاهات الزمنية',
        suggestions: [
          'ما هي القطاعات التي تُظهر اتجاهاً صعودياً؟',
          'ما هي الشركات الأكثر تقلباً؟',
          'حلل تطور القطاع المصرفي',
          'ما هي اتجاهات هذا الأسبوع؟',
        ]
      },
      '/noticias': {
        name: 'النشرة الأسبوعية',
        description: 'الأخبار وتحليل السمعة',
        suggestions: [
          'ما هي أهم أخبار هذا الأسبوع؟',
          'ما هي جودة البيانات المجمعة؟',
          'لخص أهم الاتجاهات',
          'ما هي الشركات البارزة في النشرة؟',
        ]
      },
      '/chat': {
        name: 'وكيل ريكس',
        description: 'تحليل البيانات التحادثي',
        suggestions: [
          'ما هي أفضل 5 شركات حسب مؤشر RIX؟',
          'قارن تطور تليفونيكا وإيبردرولا',
          'كيف تقيم الذكاء الاصطناعي BBVA؟',
          'تحليل متقاطع لشركات قطاع الطاقة',
        ]
      },
    },
    zh: {
      '/': {
        name: '首页',
        description: 'RepIndex欢迎页面',
        suggestions: [
          'RIX分数是什么，如何计算？',
          '本周哪些公司评分最高？',
          'RepIndex是如何运作的？',
          '比较上市公司与非上市公司',
        ]
      },
      '/dashboard': {
        name: '仪表板',
        description: '每周RIX结果表',
        suggestions: [
          '本周哪些公司进步最大？',
          '哪些IBEX35公司领跑排名？',
          '比较上市公司与非上市公司',
          '哪些行业声誉最好？',
        ]
      },
      '/market-evolution': {
        name: '市场演变',
        description: '时间趋势图',
        suggestions: [
          '哪些行业呈上升趋势？',
          '哪些公司波动最大？',
          '分析银行业的演变',
          '本周的趋势是什么？',
        ]
      },
      '/noticias': {
        name: '周报',
        description: '新闻和声誉分析',
        suggestions: [
          '本周主要新闻是什么？',
          '收集的数据质量如何？',
          '总结最重要的趋势',
          '哪些公司在周报中脱颖而出？',
        ]
      },
      '/chat': {
        name: 'Rix代理',
        description: '对话式数据分析',
        suggestions: [
          'RIX分数前5名的公司是哪些？',
          '比较Telefónica和Iberdrola的演变',
          'AI如何评估BBVA？',
          '能源行业公司交叉分析',
        ]
      },
    },
    ja: {
      '/': {
        name: 'ホーム',
        description: 'RepIndexウェルカムページ',
        suggestions: [
          'RIXスコアとは何で、どのように計算されますか？',
          '今週最も評価の高い企業はどれですか？',
          'RepIndexはどのように機能しますか？',
          '上場企業と非上場企業を比較',
        ]
      },
      '/dashboard': {
        name: 'ダッシュボード',
        description: '週間RIX結果テーブル',
        suggestions: [
          '今週最も改善した企業はどれですか？',
          'どのIBEX35企業がランキングをリードしていますか？',
          '上場企業と非上場企業を比較',
          'どのセクターが最も評判が良いですか？',
        ]
      },
      '/market-evolution': {
        name: '市場の進化',
        description: '時間的傾向チャート',
        suggestions: [
          'どのセクターが上昇傾向を示していますか？',
          'どの企業が最も変動しましたか？',
          '銀行セクターの進化を分析',
          '今週のトレンドは何ですか？',
        ]
      },
      '/noticias': {
        name: '週刊速報',
        description: 'ニュースと評判分析',
        suggestions: [
          '今週の主なニュースは何ですか？',
          '収集されたデータの品質はどうですか？',
          '最も重要なトレンドをまとめる',
          '速報で目立つ企業はどれですか？',
        ]
      },
      '/chat': {
        name: 'Rixエージェント',
        description: '会話型データ分析',
        suggestions: [
          'RIXスコアトップ5の企業は？',
          'TelefónicaとIberdrolaの進化を比較',
          'AIはBBVAをどう評価していますか？',
          'エネルギーセクター企業のクロス分析',
        ]
      },
    },
    ko: {
      '/': {
        name: '홈',
        description: 'RepIndex 환영 페이지',
        suggestions: [
          'RIX 점수란 무엇이며 어떻게 계산되나요?',
          '이번 주 가장 높은 평가를 받은 기업은?',
          'RepIndex는 어떻게 작동하나요?',
          '상장 기업 vs 비상장 기업 비교',
        ]
      },
      '/dashboard': {
        name: '대시보드',
        description: '주간 RIX 결과 테이블',
        suggestions: [
          '이번 주 가장 많이 개선된 기업은?',
          '어떤 IBEX35 기업이 순위를 이끌고 있나요?',
          '상장 기업 vs 비상장 기업 비교',
          '어떤 부문이 가장 좋은 평판을 가지고 있나요?',
        ]
      },
      '/market-evolution': {
        name: '시장 진화',
        description: '시간적 추세 차트',
        suggestions: [
          '어떤 부문이 상승 추세를 보이나요?',
          '어떤 기업이 가장 변동성이 컸나요?',
          '은행 부문의 진화를 분석',
          '이번 주 트렌드는 무엇인가요?',
        ]
      },
      '/noticias': {
        name: '주간 게시판',
        description: '뉴스 및 평판 분석',
        suggestions: [
          '이번 주 주요 뉴스는 무엇인가요?',
          '수집된 데이터의 품질은 어떤가요?',
          '가장 중요한 트렌드 요약',
          '게시판에서 돋보이는 기업은?',
        ]
      },
      '/chat': {
        name: 'Rix 에이전트',
        description: '대화형 데이터 분석',
        suggestions: [
          'RIX 점수 상위 5개 기업은?',
          'Telefónica와 Iberdrola의 진화 비교',
          'AI는 BBVA를 어떻게 평가하나요?',
          '에너지 부문 기업 교차 분석',
        ]
      },
    },
  };

  return translations[lang] || translations['es'];
};

// Dynamic suggestion templates by language
const getDynamicTemplates = (lang: string) => {
  const templates: Record<string, Record<string, string>> = {
    es: {
      whyScore: '¿Por qué {company} tiene este RIX Score?',
      howEvaluate: '¿Cómo evalúan las IAs a {company}?',
      sectorAnalysis: 'Análisis del sector {sector}',
      sectorLeaders: '¿Qué empresas lideran en {sector}?',
      whyScores: '¿Por qué {model} da estas puntuaciones?',
      ibexAnalysis: 'Análisis de empresas {ibexFamily}',
      compareEvolution: 'Compara la evolución de {companies}',
      mostOptimistic: '¿Qué modelo de IA es más optimista con {company}?',
      analyzeTrend: 'Analiza la tendencia de {company}',
      rixVariation: '¿Cómo ha variado el RIX de {company} este mes?',
      sectorTrend: '¿Qué empresas de {sector} tienen mejor tendencia?',
      weekSummary: 'Resumen de la semana {week}',
      historicalTrend: '¿Cuál es la tendencia histórica de {company}?',
      mostCritical: '¿Qué modelo de IA es más crítico con {company}?',
      compareCompetitors: 'Compara {company} con sus competidores',
      compareSector: 'Compara {company} con otras empresas de {sector}',
      factorsInfluence: '¿Qué factores influyen en el RIX de {company}?',
      whyPoints: '¿Por qué {model} le da {score} puntos?',
    },
    en: {
      whyScore: 'Why does {company} have this RIX Score?',
      howEvaluate: 'How do AIs evaluate {company}?',
      sectorAnalysis: 'Analysis of the {sector} sector',
      sectorLeaders: 'Which companies lead in {sector}?',
      whyScores: 'Why does {model} give these scores?',
      ibexAnalysis: 'Analysis of {ibexFamily} companies',
      compareEvolution: 'Compare the evolution of {companies}',
      mostOptimistic: 'Which AI model is most optimistic about {company}?',
      analyzeTrend: 'Analyze the trend of {company}',
      rixVariation: 'How has the RIX of {company} varied this month?',
      sectorTrend: 'Which companies in {sector} have the best trend?',
      weekSummary: 'Summary of week {week}',
      historicalTrend: 'What is the historical trend of {company}?',
      mostCritical: 'Which AI model is most critical of {company}?',
      compareCompetitors: 'Compare {company} with its competitors',
      compareSector: 'Compare {company} with other companies in {sector}',
      factorsInfluence: 'What factors influence the RIX of {company}?',
      whyPoints: 'Why does {model} give it {score} points?',
    },
    fr: {
      whyScore: 'Pourquoi {company} a-t-elle ce RIX Score?',
      howEvaluate: 'Comment les IAs évaluent-elles {company}?',
      sectorAnalysis: 'Analyse du secteur {sector}',
      sectorLeaders: 'Quelles entreprises mènent dans {sector}?',
      whyScores: 'Pourquoi {model} donne-t-il ces scores?',
      ibexAnalysis: 'Analyse des entreprises {ibexFamily}',
      compareEvolution: 'Comparer l\'évolution de {companies}',
      mostOptimistic: 'Quel modèle d\'IA est le plus optimiste sur {company}?',
      analyzeTrend: 'Analyser la tendance de {company}',
      rixVariation: 'Comment le RIX de {company} a-t-il varié ce mois-ci?',
      sectorTrend: 'Quelles entreprises de {sector} ont la meilleure tendance?',
      weekSummary: 'Résumé de la semaine {week}',
      historicalTrend: 'Quelle est la tendance historique de {company}?',
      mostCritical: 'Quel modèle d\'IA est le plus critique envers {company}?',
      compareCompetitors: 'Comparer {company} avec ses concurrents',
      compareSector: 'Comparer {company} avec d\'autres entreprises de {sector}',
      factorsInfluence: 'Quels facteurs influencent le RIX de {company}?',
      whyPoints: 'Pourquoi {model} lui donne-t-il {score} points?',
    },
    de: {
      whyScore: 'Warum hat {company} diesen RIX Score?',
      howEvaluate: 'Wie bewerten die KIs {company}?',
      sectorAnalysis: 'Analyse des {sector}-Sektors',
      sectorLeaders: 'Welche Unternehmen führen in {sector}?',
      whyScores: 'Warum gibt {model} diese Bewertungen?',
      ibexAnalysis: 'Analyse der {ibexFamily}-Unternehmen',
      compareEvolution: 'Vergleiche die Entwicklung von {companies}',
      mostOptimistic: 'Welches KI-Modell ist am optimistischsten bei {company}?',
      analyzeTrend: 'Analysiere den Trend von {company}',
      rixVariation: 'Wie hat sich der RIX von {company} diesen Monat verändert?',
      sectorTrend: 'Welche Unternehmen in {sector} haben den besten Trend?',
      weekSummary: 'Zusammenfassung der Woche {week}',
      historicalTrend: 'Was ist der historische Trend von {company}?',
      mostCritical: 'Welches KI-Modell ist am kritischsten gegenüber {company}?',
      compareCompetitors: 'Vergleiche {company} mit seinen Wettbewerbern',
      compareSector: 'Vergleiche {company} mit anderen Unternehmen in {sector}',
      factorsInfluence: 'Welche Faktoren beeinflussen den RIX von {company}?',
      whyPoints: 'Warum gibt {model} {score} Punkte?',
    },
    pt: {
      whyScore: 'Por que {company} tem este RIX Score?',
      howEvaluate: 'Como as IAs avaliam {company}?',
      sectorAnalysis: 'Análise do setor {sector}',
      sectorLeaders: 'Quais empresas lideram em {sector}?',
      whyScores: 'Por que {model} dá essas pontuações?',
      ibexAnalysis: 'Análise de empresas {ibexFamily}',
      compareEvolution: 'Compare a evolução de {companies}',
      mostOptimistic: 'Qual modelo de IA é mais otimista com {company}?',
      analyzeTrend: 'Analise a tendência de {company}',
      rixVariation: 'Como variou o RIX de {company} este mês?',
      sectorTrend: 'Quais empresas de {sector} têm melhor tendência?',
      weekSummary: 'Resumo da semana {week}',
      historicalTrend: 'Qual é a tendência histórica de {company}?',
      mostCritical: 'Qual modelo de IA é mais crítico com {company}?',
      compareCompetitors: 'Compare {company} com seus concorrentes',
      compareSector: 'Compare {company} com outras empresas de {sector}',
      factorsInfluence: 'Quais fatores influenciam o RIX de {company}?',
      whyPoints: 'Por que {model} dá {score} pontos?',
    },
    it: {
      whyScore: 'Perché {company} ha questo RIX Score?',
      howEvaluate: 'Come valutano le IA {company}?',
      sectorAnalysis: 'Analisi del settore {sector}',
      sectorLeaders: 'Quali aziende guidano in {sector}?',
      whyScores: 'Perché {model} dà questi punteggi?',
      ibexAnalysis: 'Analisi delle aziende {ibexFamily}',
      compareEvolution: 'Confronta l\'evoluzione di {companies}',
      mostOptimistic: 'Quale modello di IA è più ottimista su {company}?',
      analyzeTrend: 'Analizza la tendenza di {company}',
      rixVariation: 'Come è variato il RIX di {company} questo mese?',
      sectorTrend: 'Quali aziende di {sector} hanno la migliore tendenza?',
      weekSummary: 'Riepilogo della settimana {week}',
      historicalTrend: 'Qual è la tendenza storica di {company}?',
      mostCritical: 'Quale modello di IA è più critico con {company}?',
      compareCompetitors: 'Confronta {company} con i suoi concorrenti',
      compareSector: 'Confronta {company} con altre aziende di {sector}',
      factorsInfluence: 'Quali fattori influenzano il RIX di {company}?',
      whyPoints: 'Perché {model} dà {score} punti?',
    },
    ar: {
      whyScore: 'لماذا لدى {company} هذه النتيجة RIX؟',
      howEvaluate: 'كيف تقيم الذكاء الاصطناعي {company}؟',
      sectorAnalysis: 'تحليل قطاع {sector}',
      sectorLeaders: 'ما هي الشركات الرائدة في {sector}؟',
      whyScores: 'لماذا يعطي {model} هذه الدرجات؟',
      ibexAnalysis: 'تحليل شركات {ibexFamily}',
      compareEvolution: 'قارن تطور {companies}',
      mostOptimistic: 'أي نموذج ذكاء اصطناعي هو الأكثر تفاؤلاً بشأن {company}؟',
      analyzeTrend: 'حلل اتجاه {company}',
      rixVariation: 'كيف تغير RIX لـ {company} هذا الشهر؟',
      sectorTrend: 'ما هي شركات {sector} ذات الاتجاه الأفضل؟',
      weekSummary: 'ملخص الأسبوع {week}',
      historicalTrend: 'ما هو الاتجاه التاريخي لـ {company}؟',
      mostCritical: 'أي نموذج ذكاء اصطناعي هو الأكثر انتقاداً لـ {company}؟',
      compareCompetitors: 'قارن {company} مع منافسيها',
      compareSector: 'قارن {company} مع شركات أخرى في {sector}',
      factorsInfluence: 'ما هي العوامل التي تؤثر على RIX لـ {company}؟',
      whyPoints: 'لماذا يعطي {model} {score} نقطة؟',
    },
    zh: {
      whyScore: '为什么{company}有这个RIX分数？',
      howEvaluate: 'AI如何评估{company}？',
      sectorAnalysis: '{sector}行业分析',
      sectorLeaders: '哪些公司在{sector}领先？',
      whyScores: '为什么{model}给出这些分数？',
      ibexAnalysis: '{ibexFamily}公司分析',
      compareEvolution: '比较{companies}的演变',
      mostOptimistic: '哪个AI模型对{company}最乐观？',
      analyzeTrend: '分析{company}的趋势',
      rixVariation: '{company}的RIX本月如何变化？',
      sectorTrend: '{sector}中哪些公司趋势最好？',
      weekSummary: '第{week}周总结',
      historicalTrend: '{company}的历史趋势是什么？',
      mostCritical: '哪个AI模型对{company}最挑剔？',
      compareCompetitors: '将{company}与其竞争对手比较',
      compareSector: '将{company}与{sector}的其他公司比较',
      factorsInfluence: '哪些因素影响{company}的RIX？',
      whyPoints: '为什么{model}给它{score}分？',
    },
    ja: {
      whyScore: 'なぜ{company}はこのRIXスコアなのですか？',
      howEvaluate: 'AIは{company}をどう評価していますか？',
      sectorAnalysis: '{sector}セクター分析',
      sectorLeaders: '{sector}でどの企業がリードしていますか？',
      whyScores: 'なぜ{model}はこれらのスコアを与えるのですか？',
      ibexAnalysis: '{ibexFamily}企業の分析',
      compareEvolution: '{companies}の進化を比較',
      mostOptimistic: 'どのAIモデルが{company}に最も楽観的ですか？',
      analyzeTrend: '{company}のトレンドを分析',
      rixVariation: '{company}のRIXは今月どう変化しましたか？',
      sectorTrend: '{sector}のどの企業が最も良いトレンドですか？',
      weekSummary: '第{week}週の要約',
      historicalTrend: '{company}の歴史的傾向は？',
      mostCritical: 'どのAIモデルが{company}に最も批判的ですか？',
      compareCompetitors: '{company}を競合他社と比較',
      compareSector: '{company}を{sector}の他の企業と比較',
      factorsInfluence: '{company}のRIXに影響する要因は？',
      whyPoints: 'なぜ{model}は{score}ポイントを与えるのですか？',
    },
    ko: {
      whyScore: '{company}가 이 RIX 점수를 받은 이유는?',
      howEvaluate: 'AI는 {company}를 어떻게 평가하나요?',
      sectorAnalysis: '{sector} 부문 분석',
      sectorLeaders: '{sector}에서 어떤 기업이 선두인가요?',
      whyScores: '{model}이 이런 점수를 주는 이유는?',
      ibexAnalysis: '{ibexFamily} 기업 분석',
      compareEvolution: '{companies}의 진화 비교',
      mostOptimistic: '어떤 AI 모델이 {company}에 가장 낙관적인가요?',
      analyzeTrend: '{company}의 추세 분석',
      rixVariation: '{company}의 RIX가 이번 달 어떻게 변했나요?',
      sectorTrend: '{sector}에서 어떤 기업이 가장 좋은 추세인가요?',
      weekSummary: '{week}주차 요약',
      historicalTrend: '{company}의 역사적 추세는?',
      mostCritical: '어떤 AI 모델이 {company}에 가장 비판적인가요?',
      compareCompetitors: '{company}를 경쟁사와 비교',
      compareSector: '{company}를 {sector}의 다른 기업과 비교',
      factorsInfluence: '{company}의 RIX에 영향을 미치는 요인은?',
      whyPoints: '{model}이 {score}점을 주는 이유는?',
    },
  };

  return templates[lang] || templates['es'];
};

// Helper to replace template variables
const fillTemplate = (template: string, vars: Record<string, string | number | undefined>) => {
  let result = template;
  Object.entries(vars).forEach(([key, value]) => {
    if (value !== undefined) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
    }
  });
  return result;
};

export interface DynamicPageContext {
  name: string;
  description: string;
  suggestions: string[];
  path: string;
}

export function usePageContext(dynamicData?: Record<string, any>, language?: ChatLanguage): DynamicPageContext {
  const location = useLocation();
  const lang = language?.code || DEFAULT_LANGUAGE.code;
  
  return useMemo(() => {
    const path = location.pathname;
    const pageContexts = getPageContexts(lang);
    const templates = getDynamicTemplates(lang);
    const baseContext = pageContexts[path] || pageContexts['/'];
    
    let suggestions = [...baseContext.suggestions];
    
    // Add dynamic suggestions based on page and data
    if (path === '/dashboard' && dynamicData) {
      if (dynamicData.selectedCompany) {
        suggestions.unshift(fillTemplate(templates.whyScore, { company: dynamicData.selectedCompany }));
        suggestions.unshift(fillTemplate(templates.howEvaluate, { company: dynamicData.selectedCompany }));
      }
      if (dynamicData.selectedSector) {
        suggestions.unshift(fillTemplate(templates.sectorAnalysis, { sector: dynamicData.selectedSector }));
        suggestions.unshift(fillTemplate(templates.sectorLeaders, { sector: dynamicData.selectedSector }));
      }
      if (dynamicData.selectedAIModel && dynamicData.selectedAIModel !== 'comparison') {
        suggestions.unshift(fillTemplate(templates.whyScores, { model: dynamicData.selectedAIModel }));
      }
      if (dynamicData.selectedIbexFamily) {
        suggestions.unshift(fillTemplate(templates.ibexAnalysis, { ibexFamily: dynamicData.selectedIbexFamily }));
      }
    }
    
    if (path === '/market-evolution' && dynamicData?.selectedCompanies?.length > 1) {
      const companyList = dynamicData.selectedCompanies.slice(0, 3).join(' vs ');
      suggestions.unshift(fillTemplate(templates.compareEvolution, { companies: companyList }));
      suggestions.unshift(fillTemplate(templates.mostOptimistic, { company: dynamicData.selectedCompanies[0] }));
    }
    
    if (path === '/market-evolution' && dynamicData?.selectedCompanies?.length === 1) {
      suggestions.unshift(fillTemplate(templates.analyzeTrend, { company: dynamicData.selectedCompanies[0] }));
      suggestions.unshift(fillTemplate(templates.rixVariation, { company: dynamicData.selectedCompanies[0] }));
    }
    
    if (path === '/market-evolution' && dynamicData?.selectedSector) {
      suggestions.unshift(fillTemplate(templates.sectorTrend, { sector: dynamicData.selectedSector }));
    }
    
    if (path === '/noticias' && dynamicData?.weekLabel) {
      suggestions.unshift(fillTemplate(templates.weekSummary, { week: dynamicData.weekLabel }));
    }
    
    // Handle RIX run detail pages
    if (path.startsWith('/rix-run/') && dynamicData?.companyName) {
      return {
        name: `${baseContext.name}: ${dynamicData.companyName}`,
        description: `${baseContext.description} ${dynamicData.companyName}`,
        path,
        suggestions: [
          fillTemplate(templates.historicalTrend, { company: dynamicData.companyName }),
          fillTemplate(templates.mostCritical, { company: dynamicData.companyName }),
          dynamicData.sector 
            ? fillTemplate(templates.compareSector, { company: dynamicData.companyName, sector: dynamicData.sector })
            : fillTemplate(templates.compareCompetitors, { company: dynamicData.companyName }),
          fillTemplate(templates.factorsInfluence, { company: dynamicData.companyName }),
          dynamicData.modelName && dynamicData.rixScore
            ? fillTemplate(templates.whyPoints, { model: dynamicData.modelName, score: dynamicData.rixScore })
            : null,
        ].filter(Boolean) as string[],
      };
    }
    
    return {
      ...baseContext,
      suggestions: suggestions.slice(0, 5), // Max 5 suggestions
      path,
    };
  }, [location.pathname, dynamicData, lang]);
}
