// GTM DataLayer Event Tracking Utility

declare global {
  interface Window {
    dataLayer: Record<string, unknown>[];
  }
}

type GTMEventName = 
  | 'page_view'
  | 'news_click'
  | 'news_article_view'
  | 'chat_open'
  | 'chat_close'
  | 'chat_message_sent'
  | 'chat_suggestion_click'
  | 'chat_export'
  | 'chat_bulletin_generate'
  | 'dashboard_filter_change'
  | 'company_detail_view'
  | 'navigation';

interface GTMEvent {
  event: GTMEventName;
  [key: string]: unknown;
}

/**
 * Push an event to GTM dataLayer
 */
export const pushGTMEvent = (eventData: GTMEvent): void => {
  if (typeof window !== 'undefined' && window.dataLayer) {
    window.dataLayer.push(eventData);
    console.debug('[GTM]', eventData.event, eventData);
  }
};

/**
 * Track page navigation
 */
export const trackPageView = (pagePath: string, pageTitle: string, sectionType: 'public' | 'private' = 'public'): void => {
  pushGTMEvent({
    event: 'page_view',
    page_path: pagePath,
    page_title: pageTitle,
    section_type: sectionType
  });
};

/**
 * Track navigation between pages
 */
export const trackNavigation = (fromPath: string, toPath: string, navMethod: 'link' | 'menu' | 'button' = 'link'): void => {
  pushGTMEvent({
    event: 'navigation',
    from_path: fromPath,
    to_path: toPath,
    nav_method: navMethod
  });
};

/**
 * Track news article click from newsroom
 */
export const trackNewsClick = (slug: string, headline: string, category: string, isMainStory: boolean = false): void => {
  pushGTMEvent({
    event: 'news_click',
    article_slug: slug,
    article_headline: headline,
    article_category: category,
    is_main_story: isMainStory
  });
};

/**
 * Track individual article view
 */
export const trackArticleView = (slug: string, headline: string, readingTime: number): void => {
  pushGTMEvent({
    event: 'news_article_view',
    article_slug: slug,
    article_headline: headline,
    reading_time_minutes: readingTime
  });
};

/**
 * Track chat widget open/close
 */
export const trackChatToggle = (isOpen: boolean): void => {
  pushGTMEvent({
    event: isOpen ? 'chat_open' : 'chat_close',
    chat_state: isOpen ? 'opened' : 'closed'
  });
};

/**
 * Track chat message sent
 */
export const trackChatMessage = (messageLength: number, hasCompanyContext: boolean = false): void => {
  pushGTMEvent({
    event: 'chat_message_sent',
    message_length: messageLength,
    has_company_context: hasCompanyContext
  });
};

/**
 * Track chat suggested question click
 */
export const trackChatSuggestionClick = (suggestion: string): void => {
  pushGTMEvent({
    event: 'chat_suggestion_click',
    suggestion_text: suggestion.substring(0, 100) // Truncate for privacy
  });
};

/**
 * Track chat export action
 */
export const trackChatExport = (exportType: 'html' | 'pdf' | 'bulletin'): void => {
  pushGTMEvent({
    event: exportType === 'bulletin' ? 'chat_bulletin_generate' : 'chat_export',
    export_type: exportType
  });
};

/**
 * Track dashboard filter changes
 */
export const trackDashboardFilter = (filterType: string, filterValue: string): void => {
  pushGTMEvent({
    event: 'dashboard_filter_change',
    filter_type: filterType,
    filter_value: filterValue
  });
};

/**
 * Track company detail page view
 */
export const trackCompanyDetailView = (ticker: string, companyName: string, model: string): void => {
  pushGTMEvent({
    event: 'company_detail_view',
    company_ticker: ticker,
    company_name: companyName,
    ai_model: model
  });
};
