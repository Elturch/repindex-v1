// Agente Rix v2 — shared LLM streaming helper (T0 engine restoration).
//
// Capabilities (Fase 2 — REVERT auto-continuation 2026-04-24):
//   • OpenAI Chat Completions streaming with reasoning models
//     (o3 / o1 / gpt-5 family) → uses `reasoning_effort` and skips
//     `temperature` (those models reject it).
//   • Standard models (gpt-4o*, gpt-4*) keep `temperature`.
//   • SINGLE-SHOT (no auto-continuation). The previous multi-turn loop
//     produced a cascade of `enqueue chunk failed` errors when the
//     SSE controller was closed between turns. Single shot keeps the
//     stream lifecycle clean. If the model truncates at 32k tokens
//     that is acceptable for the V2 milestone; the auto-continuation
//     pattern will be re-introduced later with a proper liveness guard.
//   • Fallback: if the OpenAI call fails (any error, timeout, no chunks),
//     retry ONCE with Gemini 2.5 Pro using the same system+user payload
//     and bridge its response into onChunk so the SSE pipe stays alive.
//   • Structured observability logs: `llm_call_start` / `llm_call_end`
//     JSON lines so we can verify model_effective from the dashboard.
//
// Defaults (V1 quality contract):
//   model = "o3", reasoning_effort = "medium", maxTokens = 32000, temp = 0.

export type ReasoningEffort = "low" | "medium" | "high";
export type LLMProvider = "openai" | "gemini";

export interface StreamOpenAIInput {
  systemPrompt: string;
  userMessage: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  reasoning_effort?: ReasoningEffort;
  provider?: LLMProvider;
  onChunk: (delta: string) => void;
  logPrefix: string;
}

export interface StreamOpenAIResult {
  fullText: string;
  error?: string;
  chunksCount: number;
  /** "openai" | "gemini-fallback" — useful for observability. */
  providerUsed?: string;
  /** Effective model identifier reported by the upstream (or requested). */
  modelEffective?: string;
  /** finish_reason from the LLM ("stop" | "length" | "content_filter" | …). */
  finishReason?: string | null;
}

/** Reasoning families that require `reasoning_effort` and reject `temperature`. */
function isReasoningModel(model: string): boolean {
  const m = model.toLowerCase();
  return m.startsWith("o3") || m.startsWith("o1") || m.startsWith("gpt-5");
}

/**
 * Streams an OpenAI Chat Completions response. Calls onChunk with every
 * token delta and returns the full concatenated text at the end.
 */
/** Internal: one streaming turn against OpenAI. Returns delta text, count
 *  and finish_reason so the outer loop can decide whether to continue. */
async function streamOpenAITurn(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  temperature: number,
  reasoningEffort: ReasoningEffort | undefined,
  timeoutMs: number,
  onChunk: (d: string) => void,
  logPrefix: string,
): Promise<{ text: string; chunks: number; finishReason: string | null; modelEffective?: string; error?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let text = "";
  let chunks = 0;
  let finishReason: string | null = null;
  let modelEffective: string | undefined;

  const body: Record<string, unknown> = {
    model,
    max_completion_tokens: maxTokens,
    stream: true,
    messages,
  };
  if (isReasoningModel(model)) {
    if (reasoningEffort) body.reasoning_effort = reasoningEffort;
    // o3/o1/gpt-5 reject temperature → omit.
  } else {
    body.temperature = temperature;
  }

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify(body),
    });

    if (!resp.ok || !resp.body) {
      clearTimeout(timeoutId);
      const txt = await resp.text().catch(() => "");
      console.error(`${logPrefix} OpenAI ${resp.status}:`, txt.slice(0, 400));
      return { text, chunks, finishReason, error: `OpenAI ${resp.status}` };
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let done = false;

    while (!done) {
      const { value, done: streamDone } = await reader.read();
      if (streamDone) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") { done = true; break; }
        try {
          const parsed = JSON.parse(payload);
          const choice = parsed?.choices?.[0];
          if (!modelEffective && typeof parsed?.model === "string") {
            modelEffective = parsed.model;
          }
          const delta = choice?.delta?.content;
          if (typeof delta === "string" && delta.length > 0) {
            text += delta;
            chunks++;
            try { onChunk(delta); } catch (cbErr) {
              console.error(`${logPrefix} onChunk threw:`, cbErr);
            }
          }
          if (choice?.finish_reason) finishReason = choice.finish_reason;
        } catch {
          buffer = line + "\n" + buffer;
          break;
        }
      }
    }

    clearTimeout(timeoutId);
    return { text, chunks, finishReason, modelEffective };
  } catch (e: any) {
    clearTimeout(timeoutId);
    const msg = e?.name === "AbortError" ? "OpenAI timeout" : (e?.message ?? "Unknown");
    return { text, chunks, finishReason, modelEffective, error: msg };
  }
}

/** Fallback: non-streaming Gemini 2.5 Pro call, then bridge as one chunk. */
async function callGeminiFallback(
  systemPrompt: string,
  userMessage: string,
  onChunk: (d: string) => void,
  logPrefix: string,
  timeoutMs: number,
): Promise<{ text: string; error?: string }> {
  const key = Deno.env.get("GOOGLE_GEMINI_API_KEY");
  if (!key) return { text: "", error: "GOOGLE_GEMINI_API_KEY no configurada" };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    console.warn(`${logPrefix} GEMINI FALLBACK ENGAGED`);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${key}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 32000 },
      }),
    });
    clearTimeout(timeoutId);
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      return { text: "", error: `Gemini ${resp.status}: ${t.slice(0, 200)}` };
    }
    const data = await resp.json();
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p: any) => p?.text ?? "").join("");
    if (text) {
      try { onChunk(text); } catch { /* noop */ }
    }
    return { text };
  } catch (e: any) {
    clearTimeout(timeoutId);
    const msg = e?.name === "AbortError" ? "Gemini timeout" : (e?.message ?? "Unknown");
    return { text: "", error: msg };
  }
}

export async function streamOpenAIResponse(
  input: StreamOpenAIInput,
): Promise<StreamOpenAIResult> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  const {
    systemPrompt,
    userMessage,
    model = "o3",
    temperature = 0,
    maxTokens = 32000,
    timeoutMs = 90_000,
    reasoning_effort = "medium",
    provider = "openai",
    onChunk,
    logPrefix,
  } = input;

  const tStart = Date.now();

  // Structured start log — pipe to dashboard for model verification.
  console.log(JSON.stringify({
    event: "llm_call_start",
    log: logPrefix,
    model_requested: model,
    provider_requested: provider,
    maxTokens,
    reasoning_effort: isReasoningModel(model) ? reasoning_effort : null,
    temperature: isReasoningModel(model) ? null : temperature,
    timestamp: new Date().toISOString(),
  }));

  // If primary is gemini (rare, explicit override), go straight to fallback path.
  if (provider === "gemini") {
    const r = await callGeminiFallback(systemPrompt, userMessage, onChunk, logPrefix, timeoutMs);
    console.log(JSON.stringify({
      event: "llm_call_end",
      log: logPrefix,
      model_effective: "gemini-2.5-pro",
      provider_used: "gemini",
      finish_reason: r.error ? "error" : "stop",
      fallback_triggered: false,
      chars_out: r.text.length,
      duration_ms: Date.now() - tStart,
      error: r.error ?? null,
      timestamp: new Date().toISOString(),
    }));
    return {
      fullText: r.text,
      error: r.error,
      chunksCount: r.text ? 1 : 0,
      providerUsed: "gemini",
      modelEffective: "gemini-2.5-pro",
      finishReason: r.error ? "error" : "stop",
    };
  }

  if (!apiKey) {
    // No OpenAI key → try Gemini directly so the user still gets an answer.
    console.warn(`${logPrefix} OPENAI_API_KEY missing → Gemini fallback`);
    const r = await callGeminiFallback(systemPrompt, userMessage, onChunk, logPrefix, timeoutMs);
    console.log(JSON.stringify({
      event: "llm_call_end",
      log: logPrefix,
      model_effective: "gemini-2.5-pro",
      provider_used: "gemini-fallback",
      finish_reason: r.error ? "error" : "stop",
      fallback_triggered: true,
      fallback_reason: "openai_key_missing",
      chars_out: r.text.length,
      duration_ms: Date.now() - tStart,
      error: r.error ?? null,
      timestamp: new Date().toISOString(),
    }));
    return {
      fullText: r.text,
      error: r.error ?? "OPENAI_API_KEY no configurada",
      chunksCount: r.text ? 1 : 0,
      providerUsed: "gemini-fallback",
      modelEffective: "gemini-2.5-pro",
      finishReason: r.error ? "error" : "stop",
    };
  }

  console.log(
    `${logPrefix} stream OpenAI | model=${model} | reasoning=${isReasoningModel(model) ? reasoning_effort : "n/a"} | maxTokens=${maxTokens} | sys_chars=${systemPrompt.length}`,
  );

  // SINGLE-SHOT (auto-continuation removed 2026-04-24 — see header).
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  const turnRes = await streamOpenAITurn(
    apiKey,
    model,
    messages,
    maxTokens,
    temperature,
    reasoning_effort,
    timeoutMs,
    onChunk,
    logPrefix,
  );

  // Primary failed AND produced no text → engage Gemini fallback once.
  if (turnRes.error && !turnRes.text) {
    console.error(`${logPrefix} primary failed (${turnRes.error}) → Gemini fallback`);
    const fb = await callGeminiFallback(systemPrompt, userMessage, onChunk, logPrefix, timeoutMs);
    const ok = fb.text.length > 0;
    console.log(JSON.stringify({
      event: "llm_call_end",
      log: logPrefix,
      model_effective: ok ? "gemini-2.5-pro" : (turnRes.modelEffective ?? model),
      provider_used: ok ? "gemini-fallback" : "openai",
      finish_reason: ok ? "stop" : "error",
      fallback_triggered: true,
      fallback_reason: turnRes.error,
      chars_out: ok ? fb.text.length : 0,
      duration_ms: Date.now() - tStart,
      error: ok ? null : `${turnRes.error} | gemini: ${fb.error ?? "sin texto"}`,
      timestamp: new Date().toISOString(),
    }));
    if (ok) {
      return {
        fullText: fb.text,
        chunksCount: 1,
        providerUsed: "gemini-fallback",
        modelEffective: "gemini-2.5-pro",
        finishReason: "stop",
      };
    }
    return {
      fullText: "",
      error: `${turnRes.error} | gemini: ${fb.error ?? "sin texto"}`,
      chunksCount: 0,
      providerUsed: "openai",
      modelEffective: turnRes.modelEffective ?? model,
      finishReason: "error",
    };
  }

  console.log(JSON.stringify({
    event: "llm_call_end",
    log: logPrefix,
    model_effective: turnRes.modelEffective ?? model,
    provider_used: "openai",
    finish_reason: turnRes.finishReason,
    fallback_triggered: false,
    chunks: turnRes.chunks,
    chars_out: turnRes.text.length,
    duration_ms: Date.now() - tStart,
    error: turnRes.error ?? null,
    timestamp: new Date().toISOString(),
  }));
  return {
    fullText: turnRes.text,
    error: turnRes.error && !turnRes.text ? turnRes.error : undefined,
    chunksCount: turnRes.chunks,
    providerUsed: "openai",
    modelEffective: turnRes.modelEffective ?? model,
    finishReason: turnRes.finishReason,
  };
}