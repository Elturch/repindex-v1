// Agente Rix v2 — shared OpenAI streaming helper
// Streams Chat Completions chunks to a callback so skills can emit SSE
// progressively (TTFB <3s instead of waiting for the full response).
// Replaces the per-skill non-streaming callOpenAI used in the skeleton.

export interface StreamOpenAIInput {
  systemPrompt: string;
  userMessage: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  onChunk: (delta: string) => void;
  logPrefix: string;
}

export interface StreamOpenAIResult {
  fullText: string;
  error?: string;
  chunksCount: number;
}

/**
 * Streams an OpenAI Chat Completions response. Calls onChunk with every
 * token delta and returns the full concatenated text at the end.
 */
export async function streamOpenAIResponse(
  input: StreamOpenAIInput,
): Promise<StreamOpenAIResult> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return { fullText: "", error: "OPENAI_API_KEY no configurada", chunksCount: 0 };
  }

  const {
    systemPrompt,
    userMessage,
    model = "gpt-4o-mini",
    temperature = 0.2,
    maxTokens = 4000,
    timeoutMs = 90_000,
    onChunk,
    logPrefix,
  } = input;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let fullText = "";
  let chunksCount = 0;

  try {
    console.log(`${logPrefix} stream OpenAI | model=${model} | sys_chars=${systemPrompt.length}`);
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature,
        max_completion_tokens: maxTokens,
        stream: true,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!resp.ok || !resp.body) {
      clearTimeout(timeoutId);
      const txt = await resp.text().catch(() => "");
      console.error(`${logPrefix} OpenAI ${resp.status}:`, txt.slice(0, 400));
      return { fullText: "", error: `OpenAI ${resp.status}`, chunksCount: 0 };
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
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta.length > 0) {
            fullText += delta;
            chunksCount++;
            try { onChunk(delta); } catch (cbErr) {
              console.error(`${logPrefix} onChunk threw:`, cbErr);
            }
          }
        } catch {
          // partial JSON: re-buffer and wait for more bytes
          buffer = line + "\n" + buffer;
          break;
        }
      }
    }

    clearTimeout(timeoutId);
    console.log(`${logPrefix} stream done | chunks=${chunksCount} | chars=${fullText.length}`);
    return { fullText, chunksCount };
  } catch (e: any) {
    clearTimeout(timeoutId);
    const msg = e?.name === "AbortError" ? "OpenAI timeout" : (e?.message ?? "Unknown");
    console.error(`${logPrefix} stream exception:`, msg);
    return { fullText, error: msg, chunksCount };
  }
}