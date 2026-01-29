import React, { createContext, useContext, useState, ReactNode } from 'react';

export type AIModelOption = "ChatGPT" | "Deepseek" | "Google Gemini" | "Perplexity" | "Grok" | "Qwen";

interface LandingAIModelContextType {
  selectedModel: AIModelOption;
  setSelectedModel: (model: AIModelOption) => void;
}

const LandingAIModelContext = createContext<LandingAIModelContextType | undefined>(undefined);

export const AI_MODEL_OPTIONS: AIModelOption[] = [
  "ChatGPT",
  "Perplexity", 
  "Google Gemini",
  "Deepseek",
  "Grok",
  "Qwen"
];

export function LandingAIModelProvider({ children }: { children: ReactNode }) {
  const [selectedModel, setSelectedModel] = useState<AIModelOption>("ChatGPT");

  return (
    <LandingAIModelContext.Provider value={{ selectedModel, setSelectedModel }}>
      {children}
    </LandingAIModelContext.Provider>
  );
}

export function useLandingAIModel() {
  const context = useContext(LandingAIModelContext);
  if (context === undefined) {
    throw new Error('useLandingAIModel must be used within a LandingAIModelProvider');
  }
  return context;
}
