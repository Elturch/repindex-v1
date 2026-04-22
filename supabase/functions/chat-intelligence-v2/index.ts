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

function sseEncode(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("[RIX-V2] Request received");

  try {
    const body = await req.json().catch(() => ({}));
    const messages: ConversationMessage[] = Array.isArray(body?.messages) ? body.messages : [];
    const conversationHistory: ConversationMessage[] = Array.isArray(body?.conversationHistory)
      ? body.conversationHistory
      : messages.slice(0, -1);

    const lastUser = [...messages].reverse().find((m) => m?.role === "user");
    const question = (lastUser?.content || body?.question || "").toString().trim();

    if (!question) {
      return new Response(JSON.stringify({ error: "Missing user question" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const result = await orchestratorProcess(question, conversationHistory, supabase);

    const stream = new ReadableStream({
      start(controller) {
        try {
          if (result.type === "guard_rejection") {
            controller.enqueue(sseEncode({ choices: [{ delta: { content: result.content } }] }));
          } else {
            const text = result.content || "";
            const chunkSize = 256;
            for (let i = 0; i < text.length; i += chunkSize) {
              controller.enqueue(
                sseEncode({ choices: [{ delta: { content: text.slice(i, i + chunkSize) } }] }),
              );
            }
          }
          if (result.metadata) {
            controller.enqueue(sseEncode({ metadata: result.metadata }));
          }
          controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        } catch (err) {
          console.error("[RIX-V2] stream error:", err);
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