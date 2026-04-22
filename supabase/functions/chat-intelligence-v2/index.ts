// Agente Rix v2 — entry point (routing only, max 150 LOC)
// See specs/architecture.md and specs/constraints.md
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { process as orchestratorProcess } from "./orchestrator.ts";
import type { ConversationMessage } from "./types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function sseEncode(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const question = (body?.question || "").toString().trim();
    const sessionId = (body?.session_id || body?.sessionId || "").toString().trim();
    const conversationHistory: ConversationMessage[] = Array.isArray(body?.conversation_history)
      ? body.conversation_history
      : Array.isArray(body?.conversationHistory)
        ? body.conversationHistory
        : [];

    if (!question) {
      return new Response(JSON.stringify({ error: "Missing user question" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!,
    );

    console.log("[RIX-V2] Request received", { sessionId, history: conversationHistory.length });

    const result = await orchestratorProcess(question, conversationHistory, supabase);
    // Emit SSE in the SAME shape v1 (chat-intelligence) emits, so the frontend
    // parser in src/contexts/ChatContext.tsx (which only understands
    // {type:"chunk",text} / {type:"done",metadata,...}) can render v2 responses
    // without any client-side change. Keeping the contract aligned is what
    // makes the v1/v2 toggle interchangeable.
    const stream = new ReadableStream({
      start(controller) {
        try {
          // 1) "start" event with minimal metadata (mirrors v1 first frame).
          controller.enqueue(sseEncode({
            type: "start",
            metadata: {
              agentVersion: "v2",
              entity: result.datapack?.entity?.company_name ?? null,
              ticker: result.datapack?.entity?.ticker ?? null,
              models: result.datapack?.models_used ?? [],
            },
          }));

          // 2) Stream the synthesized content as {type:"chunk",text} frames.
          const text = result.content || "";
          const chunkSize = 256;
          for (let i = 0; i < text.length; i += chunkSize) {
            controller.enqueue(sseEncode({ type: "chunk", text: text.slice(i, i + chunkSize) }));
          }

          // 3) Final "done" event carrying metadata in the v1-compatible shape.
          controller.enqueue(sseEncode({
            type: "done",
            metadata: {
              ...(result.metadata ?? {}),
              agentVersion: "v2",
              responseType: result.type,
            },
            suggestedQuestions: [],
            drumrollQuestion: null,
          }));

          // 4) Terminator (v1 also closes the SSE without [DONE], but harmless).
          controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        } catch (streamErr) {
          console.error("[RIX-V2] stream error:", streamErr);
          controller.enqueue(sseEncode({
            type: "error",
            error: streamErr instanceof Error ? streamErr.message : "Stream error",
          }));
        } finally {
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
  } catch (err) {
    console.error("[RIX-V2] fatal error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});