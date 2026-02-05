// TypeScript types for RepIndex PPTX Design System

export interface HeroSlideData {
  slideType: 'hero';
  headline: string;
  subheadline?: string;
  company_name?: string; // Company being analyzed - displayed prominently
}

export interface ContentSlideData {
  slideType: 'content';
  title: string;
  bullets: string[];
}

export interface SplitSlideData {
  slideType: 'split';
  title: string;
  bullets: string[];
  highlight_stat?: {
    value: string;
    label: string;
  };
}

export interface MetricData {
  value: string;
  label: string;
  trend: 'up' | 'down' | 'neutral';
}

export interface MetricsSlideData {
  slideType: 'metrics';
  title: string;
  metrics: MetricData[];
}

export interface ComparisonSlideData {
  slideType: 'comparison';
  title: string;
  left: {
    label: string;
    points: string[];
  };
  right: {
    label: string;
    points: string[];
  };
  winner: 'left' | 'right' | 'none';
}

export interface ThreeColumnsSlideData {
  slideType: 'three_columns';
  title: string;
  columns: Array<{
    icon: string;
    title: string;
    text: string;
  }>;
}

export interface QuoteSlideData {
  slideType: 'quote';
  quote: string;
  attribution?: string;
  context?: string;
}

export interface QuestionItem {
  question: string;
  why_it_matters: string;
}

export interface QuestionsSlideData {
  slideType: 'questions';
  title: string;
  questions: QuestionItem[];
}

export interface CTASlideData {
  slideType: 'cta';
  headline: string;
  subtext?: string;
  button_text: string;
}

export type SlideDesign =
  | HeroSlideData
  | ContentSlideData
  | SplitSlideData
  | MetricsSlideData
  | ComparisonSlideData
  | ThreeColumnsSlideData
  | QuoteSlideData
  | QuestionsSlideData
  | CTASlideData;

export interface PPTXGenerationRequest {
  company_name: string;
  target_profile: string;
  content: string[];
  rix_questions: string[];
}

export interface PPTXDesignResponse {
  slides: SlideDesign[];
  metadata: {
    total_slides: number;
    design_version: string;
  };
}
