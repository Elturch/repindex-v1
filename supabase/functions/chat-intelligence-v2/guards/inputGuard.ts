// chat-intelligence-v2 / guards / inputGuard.ts
// Pure pre-pipeline triage. Max 80 LOC.
// Detects off-topic queries, prompt-injection attempts and greetings.

export interface GuardResult {
  pass: boolean;
  reply?: string;
}

const OFF_TOPIC_PATTERNS: RegExp[] = [
  /\b(tiempo|clima|temperatura|lluvia|nieva|pron[óo]stico)\b/i,
  /\b(receta|cocina|ingrediente|plato)\b/i,
  /\b(f[úu]tbol|baloncesto|tenis|f[óo]rmula 1|partido|liga|champions)\b/i,
  /\b(pel[íi]cula|serie|netflix|hbo|disney\+?)\b/i,
  /\b(chiste|broma|cu[ée]ntame algo gracioso)\b/i,
  /\b(horoscopo|hor[óo]scopo|tarot|astrolog[íi]a)\b/i,
  /\b(traduce|tradu[cz]ir al)\b/i,
];

const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all|previous|prior) (instructions?|prompts?|rules?)/i,
  /disregard (the )?(above|previous|system)/i,
  /\bsystem\s*:\s*/i,
  /you are now (an?|the)\b/i,
  /act as (an?|the) (different|new)/i,
  /reveal (your|the) (system )?prompt/i,
  /<\|im_start\|>|<\|im_end\|>/,
];

const GREETING_PATTERNS: RegExp[] = [
  /^\s*(hola|buenas|buenos d[íi]as|buenas tardes|buenas noches|hey|hi|hello)[\s!.\?]*$/i,
  /^\s*(qu[ée] tal|c[óo]mo est[áa]s|qui[ée]n eres|qu[ée] eres|qu[ée] haces)[\s!.\?]*$/i,
];

const WELCOME_REPLY =
  "Hola, soy el Agente Rix. Analizo la reputaci\u00f3n algor\u00edtmica de empresas espa\u00f1olas cotizadas a partir de datos de seis modelos de IA (ChatGPT, Perplexity, Gemini, DeepSeek, Grok y Qwen). Puedes preguntarme por una empresa concreta, comparar varias, ver evoluciones temporales o rankings sectoriales. \u00bfPor d\u00f3nde empezamos?";

const OFF_TOPIC_REPLY =
  "Solo puedo analizar reputaci\u00f3n de empresas monitorizadas por RepIndex (cotizadas espa\u00f1olas). Pru\u00e9bame con una pregunta sobre una compa\u00f1\u00eda concreta, un sector o el IBEX-35.";

const INJECTION_REPLY =
  "Solo respondo a consultas sobre reputaci\u00f3n algor\u00edtmica de empresas espa\u00f1olas cotizadas. \u00bfQu\u00e9 compa\u00f1\u00eda o sector te interesa analizar?";

// Sprint 1 Fix 3 — IBEX families that RepIndex does NOT cover today.
// Detect them BEFORE skill dispatch and reject with a canonical message
// instead of letting the LLM fabricate a ranking.
const UNSUPPORTED_FAMILY_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bibex\s*top\s*dividendo\b/i, label: "IBEX Top Dividendo" },
  { re: /\bibex\s*growth\b/i, label: "IBEX Growth" },
  { re: /\bbme\s*growth\b/i, label: "BME Growth" },
];

const UNSUPPORTED_FAMILY_REPLY = (label: string) =>
  `La familia "${label}" no está cubierta actualmente por RepIndex. Mi universo de análisis es el IBEX-35 y el mercado continuo español. ¿Quieres que te muestre el ranking equivalente en el IBEX-35?`;

export function checkInput(question: string): GuardResult {
  const q = (question ?? "").trim();
  if (!q) return { pass: false, reply: WELCOME_REPLY };

  for (const re of INJECTION_PATTERNS) {
    if (re.test(q)) return { pass: false, reply: INJECTION_REPLY };
  }

  for (const re of GREETING_PATTERNS) {
    if (re.test(q)) return { pass: false, reply: WELCOME_REPLY };
  }

  for (const re of OFF_TOPIC_PATTERNS) {
    if (re.test(q)) return { pass: false, reply: OFF_TOPIC_REPLY };
  }

  for (const { re, label } of UNSUPPORTED_FAMILY_PATTERNS) {
    if (re.test(q)) return { pass: false, reply: UNSUPPORTED_FAMILY_REPLY(label) };
  }

  return { pass: true };
}

export const __test__ = { OFF_TOPIC_PATTERNS, INJECTION_PATTERNS, GREETING_PATTERNS, UNSUPPORTED_FAMILY_PATTERNS };