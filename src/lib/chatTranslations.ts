// UI translations for the Agente Rix chat interface

export interface ChatUITranslations {
  // Page header
  pageTitle: string;
  pageSubtitle: string;
  
  // Chat card
  newConversation: string;
  conversation: string;
  assistantDescription: string;
  export: string;
  downloadTxt: string;
  downloadJson: string;
  downloadHtml: string;
  downloadReport: string;
  exportTooltip: string;
  
  // Empty state
  startConversation: string;
  askAboutCompanies: string;
  suggestions: string;
  
  // Input
  inputPlaceholder: string;
  inputListening: string;
  
  // Buttons & actions
  dictateMessage: string;
  stopDictation: string;
  
  // Messages
  responseReceived: string;
  documentsAnalyzed: string;
  responseAdapted: string;
  perspectiveOf: string;
  
  // Errors
  emptyQuestion: string;
  pleaseWriteQuestion: string;
  error: string;
  analysisError: string;
  couldNotAdapt: string;
  
  // Status
  updatingKnowledgeBase: string;
  responsesLessPrecise: string;
  languageChanged: string;
  willRespondIn: string;
  analyzingData: string;
  consultingDatabase: string;
  
  
  // Feedback
  rateResponse: string;
  
  // Bulletin
  viewFullScreen: string;
  print: string;
  
  // PDF/HTML Export headers
  pdfTitle: string;
  pdfTagline: string;
  pdfConfidential: string;
  pdfReportTitle: string;
  pdfReportSubtitle: string;
  pdfPreparedFor: string;
  pdfQuery: string;
  pdfAnalysis: string;
  pdfInternalUse: string;
  pdfSuggestedAnalysis: string;
  pdfFooterTagline: string;
  pdfDisclaimer: string;
  pdfExported: string;
  pdfExportedDesc: string;
  
  // Depth selector
  depthLabel: string;
  depthQuick: string;
  depthComplete: string;
  depthExhaustive: string;
  depthQuickTooltip: string;
  depthCompleteTooltip: string;
  depthExhaustiveTooltip: string;
  
  // Role selector
  roleLabel: string;
  roleGeneral: string;
  selectRole: string;
  configureAnalysis: string;
  selectConfigBeforeSending: string;
  
  // Drumroll question
  drumrollTitle: string;
  drumrollAction: string;
  
  // Clarification
  clarificationNeeded: string;
  
  // Smart suggestions
  personalizedLabel: string;
  discoveryLabel: string;
  historyLabel: string;
  refreshSuggestions: string;
  
  // Streaming
  generatingReport: string;
  
  // Suggested questions
  suggestedQuestionsLabel: string;
}

const translations: Record<string, ChatUITranslations> = {
  es: {
    pageTitle: 'Agente Rix',
    pageSubtitle: 'Tu consultor de relaciones públicas y reputacionales',
    newConversation: 'Nueva Conversación',
    conversation: 'Conversación',
    assistantDescription: 'Con tu consultor de relaciones públicas y reputacionales',
    export: 'Exportar',
    downloadTxt: 'Descargar como TXT',
    downloadJson: 'Descargar como JSON',
    downloadHtml: 'Descargar como HTML',
    downloadReport: 'Descargar como informe',
    exportTooltip: 'Guardar conversación para imprimir o compartir',
    startConversation: 'Comienza una conversación sobre reputación y percepción pública',
    askAboutCompanies: 'Analiza cómo las IAs perciben a las empresas del IBEX y su imagen corporativa',
    suggestions: 'Consultas frecuentes:',
    inputPlaceholder: 'Pregunta al Agente Rix sobre empresas, rankings o tendencias...',
    inputListening: 'Escuchando...',
    dictateMessage: 'Dictar mensaje',
    stopDictation: 'Detener dictado',
    responseReceived: 'Respuesta recibida',
    documentsAnalyzed: 'documentos, {count} registros analizados',
    responseAdapted: 'Respuesta adaptada',
    perspectiveOf: 'Perspectiva de {role}',
    emptyQuestion: 'Pregunta vacía',
    pleaseWriteQuestion: 'Por favor escribe una pregunta',
    error: 'Error',
    analysisError: 'Error en el análisis',
    couldNotAdapt: 'No se pudo adaptar la respuesta',
    updatingKnowledgeBase: 'Actualizando base de conocimiento',
    responsesLessPrecise: 'Las respuestas pueden ser menos precisas temporalmente',
    languageChanged: 'Idioma cambiado',
    willRespondIn: 'Agente Rix responderá en: {language}',
    analyzingData: 'Analizando datos...',
    consultingDatabase: 'Consultando base de datos',
    rateResponse: 'Valorar respuesta',
    viewFullScreen: 'Ver pantalla completa',
    print: 'Imprimir',
    pdfTitle: 'Informe RepIndex',
    pdfTagline: 'Inteligencia Reputacional Corporativa',
    pdfConfidential: 'Documento Confidencial',
    pdfReportTitle: 'Informe de Análisis Reputacional',
    pdfReportSubtitle: 'Generado por Agente Rix — Asistente de Inteligencia Artificial',
    pdfPreparedFor: 'Preparado para {role}',
    pdfQuery: 'Consulta',
    pdfAnalysis: 'Análisis RepIndex',
    pdfInternalUse: 'Uso interno',
    pdfSuggestedAnalysis: 'Análisis adicionales sugeridos',
    pdfFooterTagline: 'Inteligencia Artificial para Análisis de Reputación Corporativa',
    pdfDisclaimer: 'Este documento es confidencial y ha sido generado automáticamente por Agente Rix. Los datos y análisis se basan en información disponible en la base de datos de RepIndex. Queda prohibida su reproducción o distribución sin autorización expresa.',
    pdfExported: 'Respuesta exportada',
    pdfExportedDesc: 'Archivo HTML descargado exitosamente',
    // Depth selector
    depthLabel: 'Profundidad',
    depthQuick: 'Rápido',
    depthComplete: 'Completo',
    depthExhaustive: 'Exhaustivo',
    depthQuickTooltip: 'Síntesis ejecutiva en 30 segundos',
    depthCompleteTooltip: 'Informe completo con análisis detallado',
    depthExhaustiveTooltip: 'Análisis exhaustivo con todas las métricas',
    // Role selector
    roleLabel: 'Perspectiva',
    roleGeneral: 'General',
    selectRole: 'Selecciona perspectiva',
    configureAnalysis: 'Configura tu análisis',
    selectConfigBeforeSending: 'Selecciona tu perspectiva profesional',
    // Drumroll question
    drumrollTitle: 'Informe Complementario Sugerido',
    drumrollAction: 'Generar este informe',
    // Clarification
    clarificationNeeded: 'Para ofrecerte un análisis preciso, necesito más información',
    // Smart suggestions
    personalizedLabel: 'Personalizado',
    discoveryLabel: 'Descubrimiento',
    historyLabel: 'De tu historial',
    refreshSuggestions: 'Ver otras sugerencias',
    generatingReport: 'Generando informe...',
    suggestedQuestionsLabel: 'Preguntas sugeridas:',
  },
  en: {
    pageTitle: 'Rix Agent',
    pageSubtitle: 'Your public relations and reputation consultant',
    newConversation: 'New Conversation',
    conversation: 'Conversation',
    assistantDescription: 'With your public relations and reputation consultant',
    export: 'Export',
    downloadTxt: 'Download as TXT',
    downloadJson: 'Download as JSON',
    downloadHtml: 'Download as HTML',
    downloadReport: 'Download as report',
    exportTooltip: 'Save conversation to print or share',
    startConversation: 'Start a conversation about reputation and public perception',
    askAboutCompanies: 'Analyze how AIs perceive IBEX companies and their corporate image',
    suggestions: 'Common queries:',
    inputPlaceholder: 'Ask Rix Agent about companies, rankings or trends...',
    inputListening: 'Listening...',
    dictateMessage: 'Dictate message',
    stopDictation: 'Stop dictation',
    responseReceived: 'Response received',
    documentsAnalyzed: 'documents, {count} records analyzed',
    responseAdapted: 'Response adapted',
    perspectiveOf: 'Perspective of {role}',
    emptyQuestion: 'Empty question',
    pleaseWriteQuestion: 'Please write a question',
    error: 'Error',
    analysisError: 'Analysis error',
    couldNotAdapt: 'Could not adapt response',
    updatingKnowledgeBase: 'Updating knowledge base',
    responsesLessPrecise: 'Responses may be less precise temporarily',
    languageChanged: 'Language changed',
    willRespondIn: 'Rix Agent will respond in: {language}',
    analyzingData: 'Analyzing data...',
    consultingDatabase: 'Querying database',
    rateResponse: 'Rate response',
    viewFullScreen: 'View full screen',
    print: 'Print',
    pdfTitle: 'RepIndex Report',
    pdfTagline: 'Corporate Reputation Intelligence',
    pdfConfidential: 'Confidential Document',
    pdfReportTitle: 'Reputation Analysis Report',
    pdfReportSubtitle: 'Generated by Rix Agent — Artificial Intelligence Assistant',
    pdfPreparedFor: 'Prepared for {role}',
    pdfQuery: 'Query',
    pdfAnalysis: 'RepIndex Analysis',
    pdfInternalUse: 'Internal use',
    pdfSuggestedAnalysis: 'Suggested additional analyses',
    pdfFooterTagline: 'Artificial Intelligence for Corporate Reputation Analysis',
    pdfDisclaimer: 'This document is confidential and was automatically generated by Rix Agent. The data and analysis are based on information available in the RepIndex database. Reproduction or distribution without express authorization is prohibited.',
    pdfExported: 'Response exported',
    pdfExportedDesc: 'HTML file downloaded successfully',
    // Depth selector
    depthLabel: 'Depth',
    depthQuick: 'Quick',
    depthComplete: 'Complete',
    depthExhaustive: 'Exhaustive',
    depthQuickTooltip: 'Executive synthesis in 30 seconds',
    depthCompleteTooltip: 'Complete report with detailed analysis',
    depthExhaustiveTooltip: 'Exhaustive analysis with all metrics',
    // Role selector
    roleLabel: 'Perspective',
    roleGeneral: 'General',
    selectRole: 'Select perspective',
    configureAnalysis: 'Configure your analysis',
    selectConfigBeforeSending: 'Select your professional perspective',
    // Drumroll question
    drumrollTitle: 'Suggested Complementary Report',
    drumrollAction: 'Generate this report',
    // Clarification
    clarificationNeeded: 'To provide you with an accurate analysis, I need more information',
    // Smart suggestions
    personalizedLabel: 'Personalized',
    discoveryLabel: 'Discovery',
    historyLabel: 'From your history',
    refreshSuggestions: 'See other suggestions',
    generatingReport: 'Generating report...',
    suggestedQuestionsLabel: 'Suggested questions:',
  },
  fr: {
    pageTitle: 'Agent Rix',
    pageSubtitle: 'Votre consultant en relations publiques et réputation',
    newConversation: 'Nouvelle Conversation',
    conversation: 'Conversation',
    assistantDescription: 'Avec votre consultant en relations publiques et réputation',
    export: 'Exporter',
    downloadTxt: 'Télécharger en TXT',
    downloadJson: 'Télécharger en JSON',
    downloadHtml: 'Télécharger en HTML',
    downloadReport: 'Télécharger comme rapport',
    exportTooltip: 'Sauvegarder la conversation pour imprimer ou partager',
    startConversation: 'Commencez une conversation sur la réputation et la perception publique',
    askAboutCompanies: 'Analysez comment les IAs perçoivent les entreprises IBEX et leur image',
    suggestions: 'Requêtes fréquentes:',
    inputPlaceholder: 'Demandez à Agent Rix des informations sur les entreprises, classements ou tendances...',
    inputListening: 'Écoute...',
    dictateMessage: 'Dicter un message',
    stopDictation: 'Arrêter la dictée',
    responseReceived: 'Réponse reçue',
    documentsAnalyzed: 'documents, {count} enregistrements analysés',
    responseAdapted: 'Réponse adaptée',
    perspectiveOf: 'Perspective de {role}',
    emptyQuestion: 'Question vide',
    pleaseWriteQuestion: 'Veuillez écrire une question',
    error: 'Erreur',
    analysisError: 'Erreur d\'analyse',
    couldNotAdapt: 'Impossible d\'adapter la réponse',
    updatingKnowledgeBase: 'Mise à jour de la base de connaissances',
    responsesLessPrecise: 'Les réponses peuvent être moins précises temporairement',
    languageChanged: 'Langue changée',
    willRespondIn: 'Agent Rix répondra en: {language}',
    analyzingData: 'Analyse des données...',
    consultingDatabase: 'Consultation de la base de données',
    rateResponse: 'Évaluer la réponse',
    viewFullScreen: 'Voir en plein écran',
    print: 'Imprimer',
    pdfTitle: 'Rapport RepIndex',
    pdfTagline: 'Intelligence de Réputation d\'Entreprise',
    pdfConfidential: 'Document Confidentiel',
    pdfReportTitle: 'Rapport d\'Analyse de Réputation',
    pdfReportSubtitle: 'Généré par Agent Rix — Assistant d\'Intelligence Artificielle',
    pdfPreparedFor: 'Préparé pour {role}',
    pdfQuery: 'Requête',
    pdfAnalysis: 'Analyse RepIndex',
    pdfInternalUse: 'Usage interne',
    pdfSuggestedAnalysis: 'Analyses supplémentaires suggérées',
    pdfFooterTagline: 'Intelligence Artificielle pour l\'Analyse de Réputation d\'Entreprise',
    pdfDisclaimer: 'Ce document est confidentiel et a été généré automatiquement par Agent Rix. Les données et analyses sont basées sur les informations disponibles dans la base de données RepIndex. Toute reproduction ou distribution sans autorisation expresse est interdite.',
    pdfExported: 'Réponse exportée',
    pdfExportedDesc: 'Fichier HTML téléchargé avec succès',
    // Depth selector
    depthLabel: 'Profondeur',
    depthQuick: 'Rapide',
    depthComplete: 'Complet',
    depthExhaustive: 'Exhaustif',
    depthQuickTooltip: 'Synthèse exécutive en 30 secondes',
    depthCompleteTooltip: 'Rapport complet avec analyse détaillée',
    depthExhaustiveTooltip: 'Analyse exhaustive avec toutes les métriques',
    // Role selector
    roleLabel: 'Perspective',
    roleGeneral: 'Général',
    selectRole: 'Sélectionner perspective',
    configureAnalysis: 'Configurez votre analyse',
    selectConfigBeforeSending: 'Sélectionnez votre perspective professionnelle',
    // Drumroll question
    drumrollTitle: 'Rapport Complémentaire Suggéré',
    drumrollAction: 'Générer ce rapport',
    // Clarification
    clarificationNeeded: 'Pour vous fournir une analyse précise, j\'ai besoin de plus d\'informations',
    // Smart suggestions
    personalizedLabel: 'Personnalisé',
    discoveryLabel: 'Découverte',
    historyLabel: 'De votre historique',
    refreshSuggestions: 'Voir d\'autres suggestions',
    generatingReport: 'Génération du rapport...',
    suggestedQuestionsLabel: 'Questions suggérées :',
  },
  de: {
    pageTitle: 'Rix Agent',
    pageSubtitle: 'Ihr PR- und Reputationsberater',
    newConversation: 'Neue Konversation',
    conversation: 'Konversation',
    assistantDescription: 'Mit Ihrem PR- und Reputationsberater',
    export: 'Exportieren',
    downloadTxt: 'Als TXT herunterladen',
    downloadJson: 'Als JSON herunterladen',
    downloadHtml: 'Als HTML herunterladen',
    downloadReport: 'Als Bericht herunterladen',
    exportTooltip: 'Konversation zum Drucken oder Teilen speichern',
    startConversation: 'Konversation beginnen',
    askAboutCompanies: 'Fragen Sie nach IBEX-Unternehmen und ihrer KI-wahrgenommenen Reputation',
    suggestions: 'Vorschläge:',
    inputPlaceholder: 'Fragen Sie Rix Agent nach Unternehmen, Rankings oder Trends...',
    inputListening: 'Zuhören...',
    dictateMessage: 'Nachricht diktieren',
    stopDictation: 'Diktat stoppen',
    responseReceived: 'Antwort erhalten',
    documentsAnalyzed: 'Dokumente, {count} Datensätze analysiert',
    responseAdapted: 'Antwort angepasst',
    perspectiveOf: 'Perspektive von {role}',
    emptyQuestion: 'Leere Frage',
    pleaseWriteQuestion: 'Bitte schreiben Sie eine Frage',
    error: 'Fehler',
    analysisError: 'Analysefehler',
    couldNotAdapt: 'Antwort konnte nicht angepasst werden',
    updatingKnowledgeBase: 'Wissensbasis wird aktualisiert',
    responsesLessPrecise: 'Antworten können vorübergehend weniger präzise sein',
    languageChanged: 'Sprache geändert',
    willRespondIn: 'Rix Agent wird antworten in: {language}',
    analyzingData: 'Daten werden analysiert...',
    consultingDatabase: 'Datenbank wird abgefragt',
    rateResponse: 'Antwort bewerten',
    viewFullScreen: 'Vollbildmodus',
    print: 'Drucken',
    pdfTitle: 'RepIndex Bericht',
    pdfTagline: 'Unternehmensreputation Intelligence',
    pdfConfidential: 'Vertrauliches Dokument',
    pdfReportTitle: 'Reputationsanalyse-Bericht',
    pdfReportSubtitle: 'Erstellt von Rix Agent — Künstliche Intelligenz Assistent',
    pdfPreparedFor: 'Erstellt für {role}',
    pdfQuery: 'Anfrage',
    pdfAnalysis: 'RepIndex Analyse',
    pdfInternalUse: 'Interne Verwendung',
    pdfSuggestedAnalysis: 'Vorgeschlagene zusätzliche Analysen',
    pdfFooterTagline: 'Künstliche Intelligenz für Unternehmensreputationsanalyse',
    pdfDisclaimer: 'Dieses Dokument ist vertraulich und wurde automatisch von Rix Agent generiert. Die Daten und Analysen basieren auf Informationen in der RepIndex-Datenbank. Vervielfältigung oder Verbreitung ohne ausdrückliche Genehmigung ist untersagt.',
    pdfExported: 'Antwort exportiert',
    pdfExportedDesc: 'HTML-Datei erfolgreich heruntergeladen',
    // Depth selector
    depthLabel: 'Tiefe',
    depthQuick: 'Schnell',
    depthComplete: 'Vollständig',
    depthExhaustive: 'Erschöpfend',
    depthQuickTooltip: 'Exekutive Synthese in 30 Sekunden',
    depthCompleteTooltip: 'Vollständiger Bericht mit detaillierter Analyse',
    depthExhaustiveTooltip: 'Erschöpfende Analyse mit allen Metriken',
    // Role selector
    roleLabel: 'Perspektive',
    roleGeneral: 'Allgemein',
    selectRole: 'Perspektive wählen',
    configureAnalysis: 'Konfigurieren Sie Ihre Analyse',
    selectConfigBeforeSending: 'Wählen Sie Berichtstyp und Perspektive vor dem Senden',
    // Drumroll question
    drumrollTitle: 'Vorgeschlagener Ergänzungsbericht',
    drumrollAction: 'Diesen Bericht erstellen',
    // Clarification
    clarificationNeeded: 'Um Ihnen eine genaue Analyse zu liefern, benötige ich mehr Informationen',
    // Smart suggestions
    personalizedLabel: 'Personalisiert',
    discoveryLabel: 'Entdeckung',
    historyLabel: 'Aus Ihrem Verlauf',
    refreshSuggestions: 'Andere Vorschläge anzeigen',
    generatingReport: 'Bericht wird generiert...',
    suggestedQuestionsLabel: 'Vorgeschlagene Fragen:',
  },
  pt: {
    pageTitle: 'Agente Rix',
    pageSubtitle: 'Pergunte sobre empresas, tendências, comparações e análises de reputação',
    newConversation: 'Nova Conversa',
    conversation: 'Conversa',
    assistantDescription: 'Seu assistente inteligente para analisar dados do RepIndex',
    export: 'Exportar',
    downloadTxt: 'Baixar como TXT',
    downloadJson: 'Baixar como JSON',
    downloadHtml: 'Baixar como HTML',
    downloadReport: 'Baixar como relatório',
    exportTooltip: 'Salvar conversa para imprimir ou compartilhar',
    startConversation: 'Iniciar uma conversa',
    askAboutCompanies: 'Pergunte sobre empresas do IBEX e sua reputação segundo as IAs',
    suggestions: 'Sugestões:',
    inputPlaceholder: 'Pergunte ao Agente Rix sobre empresas, rankings ou tendências...',
    inputListening: 'Ouvindo...',
    dictateMessage: 'Ditar mensagem',
    stopDictation: 'Parar ditado',
    responseReceived: 'Resposta recebida',
    documentsAnalyzed: 'documentos, {count} registros analisados',
    responseAdapted: 'Resposta adaptada',
    perspectiveOf: 'Perspectiva de {role}',
    emptyQuestion: 'Pergunta vazia',
    pleaseWriteQuestion: 'Por favor escreva uma pergunta',
    error: 'Erro',
    analysisError: 'Erro na análise',
    couldNotAdapt: 'Não foi possível adaptar a resposta',
    updatingKnowledgeBase: 'Atualizando base de conhecimento',
    responsesLessPrecise: 'As respostas podem ser menos precisas temporariamente',
    languageChanged: 'Idioma alterado',
    willRespondIn: 'Agente Rix responderá em: {language}',
    analyzingData: 'Analisando dados...',
    consultingDatabase: 'Consultando banco de dados',
    rateResponse: 'Avaliar resposta',
    viewFullScreen: 'Ver tela cheia',
    print: 'Imprimir',
    pdfTitle: 'Relatório RepIndex',
    pdfTagline: 'Inteligência de Reputação Corporativa',
    pdfConfidential: 'Documento Confidencial',
    pdfReportTitle: 'Relatório de Análise de Reputação',
    pdfReportSubtitle: 'Gerado por Agente Rix — Assistente de Inteligência Artificial',
    pdfPreparedFor: 'Preparado para {role}',
    pdfQuery: 'Consulta',
    pdfAnalysis: 'Análise RepIndex',
    pdfInternalUse: 'Uso interno',
    pdfSuggestedAnalysis: 'Análises adicionais sugeridas',
    pdfFooterTagline: 'Inteligência Artificial para Análise de Reputação Corporativa',
    pdfDisclaimer: 'Este documento é confidencial e foi gerado automaticamente pelo Agente Rix. Os dados e análises são baseados em informações disponíveis no banco de dados RepIndex. A reprodução ou distribuição sem autorização expressa é proibida.',
    pdfExported: 'Resposta exportada',
    pdfExportedDesc: 'Arquivo HTML baixado com sucesso',
    // Depth selector
    depthLabel: 'Profundidade',
    depthQuick: 'Rápido',
    depthComplete: 'Completo',
    depthExhaustive: 'Exaustivo',
    depthQuickTooltip: 'Síntese executiva em 30 segundos',
    depthCompleteTooltip: 'Relatório completo com análise detalhada',
    depthExhaustiveTooltip: 'Análise exaustiva com todas as métricas',
    // Role selector
    roleLabel: 'Perspectiva',
    roleGeneral: 'Geral',
    selectRole: 'Selecionar perspectiva',
    configureAnalysis: 'Configure sua análise',
    selectConfigBeforeSending: 'Selecione o tipo de relatório e perspectiva antes de enviar',
    // Drumroll question
    drumrollTitle: 'Relatório Complementar Sugerido',
    drumrollAction: 'Gerar este relatório',
    // Clarification
    clarificationNeeded: 'Para fornecer uma análise precisa, preciso de mais informações',
    // Smart suggestions
    personalizedLabel: 'Personalizado',
    discoveryLabel: 'Descoberta',
    historyLabel: 'Do seu histórico',
    refreshSuggestions: 'Ver outras sugestões',
    generatingReport: 'Gerando relatório...',
    suggestedQuestionsLabel: 'Perguntas sugeridas:',
  },
  it: {
    pageTitle: 'Agente Rix',
    pageSubtitle: 'Chiedi informazioni su aziende, tendenze, confronti e analisi della reputazione',
    newConversation: 'Nuova Conversazione',
    conversation: 'Conversazione',
    assistantDescription: 'Il tuo assistente intelligente per analizzare i dati RepIndex',
    export: 'Esporta',
    downloadTxt: 'Scarica come TXT',
    downloadJson: 'Scarica come JSON',
    downloadHtml: 'Scarica come HTML',
    downloadReport: 'Scarica come rapporto',
    exportTooltip: 'Salva la conversazione per stampare o condividere',
    startConversation: 'Inizia una conversazione',
    askAboutCompanies: 'Chiedi informazioni sulle aziende IBEX e la loro reputazione secondo le IA',
    suggestions: 'Suggerimenti:',
    inputPlaceholder: 'Chiedi all\'Agente Rix informazioni su aziende, classifiche o tendenze...',
    inputListening: 'Ascolto...',
    dictateMessage: 'Dettare messaggio',
    stopDictation: 'Ferma dettatura',
    responseReceived: 'Risposta ricevuta',
    documentsAnalyzed: 'documenti, {count} record analizzati',
    responseAdapted: 'Risposta adattata',
    perspectiveOf: 'Prospettiva di {role}',
    emptyQuestion: 'Domanda vuota',
    pleaseWriteQuestion: 'Per favore scrivi una domanda',
    error: 'Errore',
    analysisError: 'Errore di analisi',
    couldNotAdapt: 'Impossibile adattare la risposta',
    updatingKnowledgeBase: 'Aggiornamento base di conoscenza',
    responsesLessPrecise: 'Le risposte potrebbero essere meno precise temporaneamente',
    languageChanged: 'Lingua cambiata',
    willRespondIn: 'Agente Rix risponderà in: {language}',
    analyzingData: 'Analisi dei dati...',
    consultingDatabase: 'Consultazione del database',
    rateResponse: 'Valuta risposta',
    viewFullScreen: 'Visualizza a schermo intero',
    print: 'Stampa',
    pdfTitle: 'Report RepIndex',
    pdfTagline: 'Intelligenza di Reputazione Aziendale',
    pdfConfidential: 'Documento Riservato',
    pdfReportTitle: 'Report di Analisi della Reputazione',
    pdfReportSubtitle: 'Generato da Agente Rix — Assistente di Intelligenza Artificiale',
    pdfPreparedFor: 'Preparato per {role}',
    pdfQuery: 'Richiesta',
    pdfAnalysis: 'Analisi RepIndex',
    pdfInternalUse: 'Uso interno',
    pdfSuggestedAnalysis: 'Analisi aggiuntive suggerite',
    pdfFooterTagline: 'Intelligenza Artificiale per l\'Analisi della Reputazione Aziendale',
    pdfDisclaimer: 'Questo documento è riservato ed è stato generato automaticamente da Agente Rix. I dati e le analisi si basano sulle informazioni disponibili nel database RepIndex. La riproduzione o distribuzione senza autorizzazione espressa è vietata.',
    pdfExported: 'Risposta esportata',
    pdfExportedDesc: 'File HTML scaricato con successo',
    // Depth selector
    depthLabel: 'Profondità',
    depthQuick: 'Veloce',
    depthComplete: 'Completo',
    depthExhaustive: 'Esaustivo',
    depthQuickTooltip: 'Sintesi esecutiva in 30 secondi',
    depthCompleteTooltip: 'Rapporto completo con analisi dettagliata',
    depthExhaustiveTooltip: 'Analisi esaustiva con tutte le metriche',
    // Role selector
    roleLabel: 'Prospettiva',
    roleGeneral: 'Generale',
    selectRole: 'Seleziona prospettiva',
    configureAnalysis: 'Configura la tua analisi',
    selectConfigBeforeSending: 'Seleziona il tipo di rapporto e la prospettiva prima di inviare',
    // Drumroll question
    drumrollTitle: 'Rapporto Complementare Suggerito',
    drumrollAction: 'Genera questo rapporto',
    // Clarification
    clarificationNeeded: 'Per fornirti un\'analisi accurata, ho bisogno di più informazioni',
    // Smart suggestions
    personalizedLabel: 'Personalizzato',
    discoveryLabel: 'Scoperta',
    historyLabel: 'Dalla tua cronologia',
    refreshSuggestions: 'Vedi altri suggerimenti',
    generatingReport: 'Generazione del rapporto...',
    suggestedQuestionsLabel: 'Domande suggerite:',
  },
  ar: {
    pageTitle: 'وكيل ريكس',
    pageSubtitle: 'اسأل عن الشركات والاتجاهات والمقارنات وتحليل السمعة',
    newConversation: 'محادثة جديدة',
    conversation: 'المحادثة',
    assistantDescription: 'مساعدك الذكي لتحليل بيانات RepIndex',
    export: 'تصدير',
    downloadTxt: 'تحميل كـ TXT',
    downloadJson: 'تحميل كـ JSON',
    downloadHtml: 'تحميل كـ HTML',
    downloadReport: 'تحميل كتقرير',
    exportTooltip: 'حفظ المحادثة للطباعة أو المشاركة',
    startConversation: 'ابدأ محادثة',
    askAboutCompanies: 'اسأل عن شركات IBEX وسمعتها وفقًا للذكاء الاصطناعي',
    suggestions: 'اقتراحات:',
    inputPlaceholder: 'اسأل وكيل ريكس عن الشركات أو التصنيفات أو الاتجاهات...',
    inputListening: 'جارِ الاستماع...',
    dictateMessage: 'إملاء رسالة',
    stopDictation: 'إيقاف الإملاء',
    responseReceived: 'تم استلام الرد',
    documentsAnalyzed: 'مستندات، {count} سجلات تم تحليلها',
    responseAdapted: 'تم تكييف الرد',
    perspectiveOf: 'منظور {role}',
    emptyQuestion: 'سؤال فارغ',
    pleaseWriteQuestion: 'يرجى كتابة سؤال',
    error: 'خطأ',
    analysisError: 'خطأ في التحليل',
    couldNotAdapt: 'تعذر تكييف الرد',
    updatingKnowledgeBase: 'جارِ تحديث قاعدة المعرفة',
    responsesLessPrecise: 'قد تكون الردود أقل دقة مؤقتًا',
    languageChanged: 'تم تغيير اللغة',
    willRespondIn: 'سيستجيب وكيل ريكس بـ: {language}',
    analyzingData: 'جارِ تحليل البيانات...',
    consultingDatabase: 'جارِ الاستعلام من قاعدة البيانات',
    rateResponse: 'تقييم الرد',
    viewFullScreen: 'عرض ملء الشاشة',
    print: 'طباعة',
    pdfTitle: 'تقرير RepIndex',
    pdfTagline: 'استخبارات السمعة المؤسسية',
    pdfConfidential: 'وثيقة سرية',
    pdfReportTitle: 'تقرير تحليل السمعة',
    pdfReportSubtitle: 'تم إنشاؤه بواسطة وكيل ريكس — مساعد الذكاء الاصطناعي',
    pdfPreparedFor: 'معد لـ {role}',
    pdfQuery: 'استفسار',
    pdfAnalysis: 'تحليل RepIndex',
    pdfInternalUse: 'للاستخدام الداخلي',
    pdfSuggestedAnalysis: 'تحليلات إضافية مقترحة',
    pdfFooterTagline: 'الذكاء الاصطناعي لتحليل السمعة المؤسسية',
    pdfDisclaimer: 'هذا المستند سري وتم إنشاؤه تلقائيًا بواسطة وكيل ريكس. تستند البيانات والتحليلات إلى المعلومات المتاحة في قاعدة بيانات RepIndex. يُحظر النسخ أو التوزيع بدون إذن صريح.',
    pdfExported: 'تم تصدير الرد',
    pdfExportedDesc: 'تم تنزيل ملف HTML بنجاح',
    // Depth selector
    depthLabel: 'العمق',
    depthQuick: 'سريع',
    depthComplete: 'كامل',
    depthExhaustive: 'شامل',
    depthQuickTooltip: 'ملخص تنفيذي في 30 ثانية',
    depthCompleteTooltip: 'تقرير كامل مع تحليل مفصل',
    depthExhaustiveTooltip: 'تحليل شامل مع جميع المقاييس',
    // Role selector
    roleLabel: 'المنظور',
    roleGeneral: 'عام',
    selectRole: 'اختر المنظور',
    configureAnalysis: 'قم بتكوين تحليلك',
    selectConfigBeforeSending: 'حدد نوع التقرير والمنظور قبل الإرسال',
    // Drumroll question
    drumrollTitle: 'تقرير تكميلي مقترح',
    drumrollAction: 'إنشاء هذا التقرير',
    // Clarification
    clarificationNeeded: 'لتقديم تحليل دقيق، أحتاج إلى مزيد من المعلومات',
    // Smart suggestions
    personalizedLabel: 'مخصص',
    discoveryLabel: 'اكتشاف',
    historyLabel: 'من سجلك',
    refreshSuggestions: 'عرض اقتراحات أخرى',
    generatingReport: 'جاري إنشاء التقرير...',
    suggestedQuestionsLabel: 'أسئلة مقترحة:',
  },
  zh: {
    pageTitle: 'Rix代理',
    pageSubtitle: '询问公司、趋势、比较和声誉分析',
    newConversation: '新对话',
    conversation: '对话',
    assistantDescription: '您的智能助手，用于分析RepIndex数据',
    export: '导出',
    downloadTxt: '下载为TXT',
    downloadJson: '下载为JSON',
    downloadHtml: '下载为HTML',
    downloadReport: '下载为报告',
    exportTooltip: '保存对话以打印或分享',
    startConversation: '开始对话',
    askAboutCompanies: '询问IBEX公司及其AI感知的声誉',
    suggestions: '建议：',
    inputPlaceholder: '向Rix代理询问公司、排名或趋势...',
    inputListening: '正在听...',
    dictateMessage: '语音输入',
    stopDictation: '停止语音',
    responseReceived: '收到回复',
    documentsAnalyzed: '文档，{count}条记录已分析',
    responseAdapted: '回复已调整',
    perspectiveOf: '{role}的观点',
    emptyQuestion: '空问题',
    pleaseWriteQuestion: '请写一个问题',
    error: '错误',
    analysisError: '分析错误',
    couldNotAdapt: '无法调整回复',
    updatingKnowledgeBase: '正在更新知识库',
    responsesLessPrecise: '回复可能暂时不太精确',
    languageChanged: '语言已更改',
    willRespondIn: 'Rix代理将使用以下语言回复：{language}',
    analyzingData: '正在分析数据...',
    consultingDatabase: '正在查询数据库',
    rateResponse: '评价回复',
    viewFullScreen: '全屏查看',
    print: '打印',
    pdfTitle: 'RepIndex报告',
    pdfTagline: '企业声誉情报',
    pdfConfidential: '机密文件',
    pdfReportTitle: '声誉分析报告',
    pdfReportSubtitle: '由Rix代理生成 — 人工智能助手',
    pdfPreparedFor: '为{role}准备',
    pdfQuery: '查询',
    pdfAnalysis: 'RepIndex分析',
    pdfInternalUse: '内部使用',
    pdfSuggestedAnalysis: '建议的额外分析',
    pdfFooterTagline: '企业声誉分析人工智能',
    pdfDisclaimer: '本文件为机密文件，由Rix代理自动生成。数据和分析基于RepIndex数据库中可用的信息。未经明确授权，禁止复制或分发。',
    pdfExported: '响应已导出',
    pdfExportedDesc: 'HTML文件下载成功',
    // Depth selector
    depthLabel: '深度',
    depthQuick: '快速',
    depthComplete: '完整',
    depthExhaustive: '详尽',
    depthQuickTooltip: '30秒执行摘要',
    depthCompleteTooltip: '包含详细分析的完整报告',
    depthExhaustiveTooltip: '包含所有指标的详尽分析',
    // Role selector
    roleLabel: '视角',
    roleGeneral: '通用',
    selectRole: '选择视角',
    configureAnalysis: '配置您的分析',
    selectConfigBeforeSending: '发送前请选择报告类型和视角',
    // Drumroll question
    drumrollTitle: '建议的补充报告',
    drumrollAction: '生成此报告',
    // Clarification
    clarificationNeeded: '为了提供准确的分析，我需要更多信息',
    // Smart suggestions
    personalizedLabel: '个性化',
    discoveryLabel: '发现',
    historyLabel: '来自您的历史',
    refreshSuggestions: '查看其他建议',
    generatingReport: '正在生成报告...',
    suggestedQuestionsLabel: '推荐问题：',
  },
  ja: {
    pageTitle: 'Rixエージェント',
    pageSubtitle: '企業、トレンド、比較、レピュテーション分析について質問',
    newConversation: '新しい会話',
    conversation: '会話',
    assistantDescription: 'RepIndexデータを分析するインテリジェントアシスタント',
    export: 'エクスポート',
    downloadTxt: 'TXTとしてダウンロード',
    downloadJson: 'JSONとしてダウンロード',
    downloadHtml: 'HTMLとしてダウンロード',
    downloadReport: 'レポートとしてダウンロード',
    exportTooltip: '印刷または共有するために会話を保存',
    startConversation: '会話を始める',
    askAboutCompanies: 'IBEX企業とAIが認識する評判について質問',
    suggestions: '提案：',
    inputPlaceholder: 'Rixエージェントに企業、ランキング、トレンドについて質問...',
    inputListening: '聞いています...',
    dictateMessage: 'メッセージを音声入力',
    stopDictation: '音声入力を停止',
    responseReceived: '回答を受信',
    documentsAnalyzed: 'ドキュメント、{count}件のレコードを分析',
    responseAdapted: '回答を調整しました',
    perspectiveOf: '{role}の視点',
    emptyQuestion: '質問が空です',
    pleaseWriteQuestion: '質問を入力してください',
    error: 'エラー',
    analysisError: '分析エラー',
    couldNotAdapt: '回答を調整できませんでした',
    updatingKnowledgeBase: 'ナレッジベースを更新中',
    responsesLessPrecise: '回答が一時的に不正確になる場合があります',
    languageChanged: '言語が変更されました',
    willRespondIn: 'Rixエージェントは以下の言語で応答します：{language}',
    analyzingData: 'データを分析中...',
    consultingDatabase: 'データベースに問い合わせ中',
    rateResponse: '回答を評価',
    viewFullScreen: 'フルスクリーン表示',
    print: '印刷',
    pdfTitle: 'RepIndexレポート',
    pdfTagline: '企業レピュテーションインテリジェンス',
    pdfConfidential: '機密文書',
    pdfReportTitle: 'レピュテーション分析レポート',
    pdfReportSubtitle: 'Rixエージェント生成 — 人工知能アシスタント',
    pdfPreparedFor: '{role}向けに準備',
    pdfQuery: 'クエリ',
    pdfAnalysis: 'RepIndex分析',
    pdfInternalUse: '内部使用',
    pdfSuggestedAnalysis: '追加分析の提案',
    pdfFooterTagline: '企業レピュテーション分析のための人工知能',
    pdfDisclaimer: 'この文書は機密であり、Rixエージェントによって自動的に生成されました。データと分析はRepIndexデータベースで利用可能な情報に基づいています。明示的な許可なしの複製または配布は禁止されています。',
    pdfExported: 'レスポンスがエクスポートされました',
    pdfExportedDesc: 'HTMLファイルが正常にダウンロードされました',
    // Depth selector
    depthLabel: '深さ',
    depthQuick: '高速',
    depthComplete: '完全',
    depthExhaustive: '網羅的',
    depthQuickTooltip: '30秒でエグゼクティブサマリー',
    depthCompleteTooltip: '詳細な分析を含む完全なレポート',
    depthExhaustiveTooltip: 'すべてのメトリクスを含む網羅的な分析',
    // Role selector
    roleLabel: '視点',
    roleGeneral: '一般',
    selectRole: '視点を選択',
    configureAnalysis: '分析を設定',
    selectConfigBeforeSending: '送信前にレポートタイプと視点を選択してください',
    // Drumroll question
    drumrollTitle: '推奨補完レポート',
    drumrollAction: 'このレポートを生成',
    // Clarification
    clarificationNeeded: '正確な分析を提供するために、より多くの情報が必要です',
    // Smart suggestions
    personalizedLabel: 'パーソナライズ',
    discoveryLabel: '発見',
    historyLabel: 'あなたの履歴から',
    refreshSuggestions: '他の提案を見る',
    generatingReport: 'レポートを生成中...',
    suggestedQuestionsLabel: 'おすすめの質問：',
  },
  ko: {
    pageTitle: 'Rix 에이전트',
    pageSubtitle: '기업, 트렌드, 비교 및 평판 분석에 대해 질문하세요',
    newConversation: '새 대화',
    conversation: '대화',
    assistantDescription: 'RepIndex 데이터를 분석하는 지능형 어시스턴트',
    export: '내보내기',
    downloadTxt: 'TXT로 다운로드',
    downloadJson: 'JSON으로 다운로드',
    downloadHtml: 'HTML로 다운로드',
    downloadReport: '보고서로 다운로드',
    exportTooltip: '인쇄 또는 공유를 위해 대화 저장',
    startConversation: '대화 시작하기',
    askAboutCompanies: 'IBEX 기업과 AI가 인식하는 평판에 대해 질문하세요',
    suggestions: '제안:',
    inputPlaceholder: 'Rix 에이전트에게 기업, 랭킹 또는 트렌드에 대해 질문...',
    inputListening: '듣는 중...',
    dictateMessage: '메시지 음성 입력',
    stopDictation: '음성 입력 중지',
    responseReceived: '응답 수신',
    documentsAnalyzed: '문서, {count}개 레코드 분석됨',
    responseAdapted: '응답 조정됨',
    perspectiveOf: '{role}의 관점',
    emptyQuestion: '빈 질문',
    pleaseWriteQuestion: '질문을 작성해 주세요',
    error: '오류',
    analysisError: '분석 오류',
    couldNotAdapt: '응답을 조정할 수 없습니다',
    updatingKnowledgeBase: '지식 베이스 업데이트 중',
    responsesLessPrecise: '응답이 일시적으로 덜 정확할 수 있습니다',
    languageChanged: '언어가 변경되었습니다',
    willRespondIn: 'Rix 에이전트가 다음 언어로 응답합니다: {language}',
    analyzingData: '데이터 분석 중...',
    consultingDatabase: '데이터베이스 조회 중',
    rateResponse: '응답 평가',
    viewFullScreen: '전체 화면 보기',
    print: '인쇄',
    pdfTitle: 'RepIndex 보고서',
    pdfTagline: '기업 평판 인텔리전스',
    pdfConfidential: '기밀 문서',
    pdfReportTitle: '평판 분석 보고서',
    pdfReportSubtitle: 'Rix 에이전트 생성 — 인공지능 어시스턴트',
    pdfPreparedFor: '{role}를 위해 준비됨',
    pdfQuery: '쿼리',
    pdfAnalysis: 'RepIndex 분석',
    pdfInternalUse: '내부 사용',
    pdfSuggestedAnalysis: '제안된 추가 분석',
    pdfFooterTagline: '기업 평판 분석을 위한 인공지능',
    pdfDisclaimer: '이 문서는 기밀이며 Rix 에이전트에 의해 자동으로 생성되었습니다. 데이터 및 분석은 RepIndex 데이터베이스에서 사용 가능한 정보를 기반으로 합니다. 명시적인 허가 없이 복제 또는 배포하는 것은 금지되어 있습니다.',
    pdfExported: '응답 내보냄',
    pdfExportedDesc: 'HTML 파일이 성공적으로 다운로드되었습니다',
    // Depth selector
    depthLabel: '깊이',
    depthQuick: '빠른',
    depthComplete: '완전한',
    depthExhaustive: '상세한',
    depthQuickTooltip: '30초 이내 경영진 요약',
    depthCompleteTooltip: '상세 분석이 포함된 전체 보고서',
    depthExhaustiveTooltip: '모든 지표가 포함된 상세 분석',
    // Role selector
    roleLabel: '관점',
    roleGeneral: '일반',
    selectRole: '관점 선택',
    configureAnalysis: '분석 설정',
    selectConfigBeforeSending: '보내기 전에 보고서 유형과 관점을 선택하세요',
    // Drumroll question
    drumrollTitle: '권장 보완 보고서',
    drumrollAction: '이 보고서 생성',
    // Clarification
    clarificationNeeded: '정확한 분석을 제공하려면 더 많은 정보가 필요합니다',
    // Smart suggestions
    personalizedLabel: '개인화',
    discoveryLabel: '발견',
    historyLabel: '귀하의 기록에서',
    refreshSuggestions: '다른 제안 보기',
    generatingReport: '보고서 생성 중...',
    suggestedQuestionsLabel: '추천 질문:',
  },
};

export function getChatTranslations(languageCode: string): ChatUITranslations {
  return translations[languageCode] || translations['es'];
}

// Helper to replace template variables like {company}, {count}, {role}, {language}
export function t(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  let result = template;
  Object.entries(vars).forEach(([key, value]) => {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  });
  return result;
}
