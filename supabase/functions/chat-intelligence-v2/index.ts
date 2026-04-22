// Agente Rix v2 — entry point (routing only, max 150 LOC)
// See specs/architecture.md and specs/constraints.md
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { process as orchestratorProcess } from "./orchestrator.ts";
import type { ConversationMessage } from "./types.ts";
import { runAllTests } from "./tests/regression.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function sseEncode(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

// FASE A — Removed fragile regex helpers (inferEntityFromAssistantHistory,
// shouldInheritFromHistory). Conversational context is now sourced from a
// single, structured channel: the `previousContext` field that the frontend
// builds from `lastQueryContextRef` (ChatContext.tsx). For users with
// authenticated sessions we additionally hydrate from the persisted
// `user_conversations.last_report_context` JSONB column when the FE payload
// is missing (cold reload, conversation re-open).

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ── Regression suite endpoint: GET /chat-intelligence-v2?test=regression ──
  // Hits the same edge function recursively (sequential cases). Useful for
  // smoke-testing v2 after a deploy without booting the frontend.
  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.searchParams.get("test") === "regression") {
      try {
        // Self-call URL: derive from SUPABASE_URL (public ingress) because
        // req.url inside the runtime points at an internal host that does
        // not accept further function invocations. Forward the inbound
        // Authorization header AND the apikey so the gateway accepts the
        // recursive call (Supabase requires apikey for /functions/v1/*).
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const baseUrl = supabaseUrl
          ? `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/chat-intelligence-v2`
          : `${url.origin}${url.pathname}`;
        const authHeader = req.headers.get("authorization");
        const apiKey = req.headers.get("apikey")
          ?? Deno.env.get("SUPABASE_ANON_KEY")
          ?? null;
        const summary = await runAllTests({ baseUrl, authHeader, apiKey });
        return new Response(JSON.stringify(summary, null, 2), {
          status: summary.failed === 0 ? 200 : 207,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        return new Response(
          JSON.stringify({ error: e instanceof Error ? e.message : "regression failed" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }
  }

  try {
    const body = await req.json().catch(() => ({}));
    const question = (body?.question || "").toString().trim();
    const originalQuestion = (body?.originalQuestion || "").toString().trim();
    const effectiveQuestion = originalQuestion || question;
    const sessionId = (body?.session_id || body?.sessionId || "").toString().trim();
    const conversationId = (body?.conversationId || body?.conversation_id || "").toString().trim();
    const conversationHistory: ConversationMessage[] = Array.isArray(body?.conversation_history)
      ? body.conversation_history
      : Array.isArray(body?.conversationHistory)
        ? body.conversationHistory
        : [];
    let previousContext = body?.previousContext || null;
    const isFollowup = body?.isFollowup === true;

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

    // FASE A — Hydrate previousContext from `user_conversations.last_report_context`
    // when the FE didn't ship one (cold reload, conversation re-open from the
    // sidebar). This replaces the legacy regex-over-assistant-text fallback.
    if (!previousContext?.entity && (conversationId || sessionId)) {
      try {
        const lookup = supabase
          .from("user_conversations")
          .select("last_report_context")
          .order("updated_at", { ascending: false })
          .limit(1);
        const { data: convRow } = conversationId
          ? await lookup.eq("id", conversationId).maybeSingle()
          : await lookup.eq("session_id", sessionId).maybeSingle();
        const persisted = (convRow as any)?.last_report_context as
          | { company?: string; ticker?: string; sector?: string; intent?: string;
              period_from?: string; period_to?: string; models?: string[] }
          | null;
        if (persisted?.ticker || persisted?.company) {
          previousContext = {
            ...(previousContext ?? {}),
            entity: persisted.ticker || persisted.company,
            company_name: persisted.company ?? null,
            ticker: persisted.ticker ?? null,
            sector: persisted.sector ?? null,
            models: persisted.models ?? null,
            period: persisted.period_from && persisted.period_to
              ? { from: persisted.period_from, to: persisted.period_to }
              : null,
            source: "user_conversations.last_report_context",
          };
          console.log("[RIX-V2] hydrated previousContext from user_conversations:", previousContext.entity);
        }
      } catch (lookupErr) {
        console.warn("[RIX-V2] last_report_context lookup failed (non-fatal):", lookupErr);
      }
    }

    console.log("[RIX-V2] Request received", {
      sessionId,
      conversationId: conversationId || null,
      history: conversationHistory.length,
      inheritedEntity: previousContext?.entity ?? null,
      inheritedSource: previousContext?.source ?? null,
      question,
      originalQuestion: originalQuestion || null,
      effectiveQuestion,
    });

    // Real progressive streaming: the orchestrator → skill → streamOpenAIResponse
    // chain calls onChunk for every LLM delta. We pipe each delta into the SSE
    // controller as a {type:"chunk",text} frame, matching v1's contract. The
    // final {type:"done"} frame is emitted after the orchestrator settles.
    const stream = new ReadableStream({
      async start(controller) {
        let startEmitted = false;
        const emitStartOnce = (meta: Record<string, unknown>) => {
          if (startEmitted) return;
          startEmitted = true;
          controller.enqueue(sseEncode({ type: "start", metadata: { agentVersion: "v2", ...meta } }));
        };
        // Emit the start frame immediately so the frontend can render the
        // assistant bubble and start measuring TTFB.
        emitStartOnce({});

        const onChunk = (delta: string) => {
          if (!delta) return;
          try {
            controller.enqueue(sseEncode({ type: "chunk", text: delta }));
          } catch (e) {
            console.error("[RIX-V2] enqueue chunk failed:", e);
          }
        };

        try {
          const result = await orchestratorProcess(
            effectiveQuestion,
            conversationHistory,
            supabase,
            onChunk,
            previousContext,
            isFollowup,
          );
          const resultMeta = result as Record<string, any>;
          const reportContext = {
            company: resultMeta.entities?.[0]?.company_name ?? result.datapack?.entity?.company_name ?? null,
            ticker: resultMeta.entities?.[0]?.ticker ?? result.datapack?.entity?.ticker ?? null,
            sector: resultMeta.entities?.[0]?.sector_category ?? result.datapack?.entity?.sector_category ?? null,
            intent: resultMeta.intent ?? null,
            user_question: effectiveQuestion,
            date_from: resultMeta.period_from ?? result.metadata?.period_from ?? result.datapack?.temporal?.from ?? null,
            date_to: resultMeta.period_to ?? result.metadata?.period_to ?? result.datapack?.temporal?.to ?? null,
            models: resultMeta.models_used ?? result.datapack?.models_used ?? [],
            sample_size: resultMeta.data_count ?? result.metadata?.observations_count ?? 0,
            models_count: Array.isArray(resultMeta.models_used ?? result.datapack?.models_used)
              ? (resultMeta.models_used ?? result.datapack?.models_used).length
              : 0,
            weeks_analyzed: result.metadata?.unique_weeks ?? result.datapack?.temporal?.snapshots_available ?? null,
            _parsed_mode: result.datapack?.mode ?? null,
          };

          controller.enqueue(sseEncode({
            metadata: true,
            reportContext,
            documentsFound: resultMeta.data_count ?? result.metadata?.observations_count ?? 0,
            structuredDataFound: resultMeta.data_count ?? result.metadata?.observations_count ?? 0,
            questionCategory: resultMeta.intent ?? null,
            methodology: resultMeta.methodology ?? null,
          }));

          // FASE A — persist structured context for the next turn. We write
          // to user_conversations.last_report_context (JSONB). Best-effort:
          // failures must never break the SSE stream.
          if ((conversationId || sessionId) && (reportContext.ticker || reportContext.company)) {
            try {
              const updatePayload = {
                last_report_context: reportContext,
                last_message_at: new Date().toISOString(),
              } as const;
              const updater = supabase
                .from("user_conversations")
                .update(updatePayload);
              const { error: updErr } = conversationId
                ? await updater.eq("id", conversationId)
                : await updater.eq("session_id", sessionId);
              if (updErr) {
                console.warn("[RIX-V2] last_report_context persist warning:", updErr.message);
              } else {
                console.log("[RIX-V2] persisted last_report_context for", conversationId || sessionId);
              }
            } catch (persistErr) {
              console.warn("[RIX-V2] persist last_report_context failed (non-fatal):", persistErr);
            }
          }

          // Final "done" event with metadata in the v1-compatible shape.
          controller.enqueue(sseEncode({
            type: "done",
            metadata: {
              ...(result.metadata ?? {}),
              agentVersion: "v2",
              responseType: result.type,
              entity: result.datapack?.entity?.company_name ?? null,
              ticker: result.datapack?.entity?.ticker ?? null,
              models: result.datapack?.models_used ?? [],
              modelsUsed: resultMeta.models_used ?? result.datapack?.models_used ?? [],
              companyName: reportContext.company,
              documentsFound: resultMeta.data_count ?? result.metadata?.observations_count ?? 0,
              structuredDataFound: resultMeta.data_count ?? result.metadata?.observations_count ?? 0,
              questionCategory: resultMeta.intent ?? null,
              methodology: resultMeta.methodology ?? null,
              reportContext,
              coverage_ratio: result.datapack?.temporal?.coverage_ratio ?? null,
              is_partial: result.datapack?.temporal?.is_partial ?? null,
              snapshots_available: result.datapack?.temporal?.snapshots_available ?? null,
              snapshots_expected: result.datapack?.temporal?.snapshots_expected ?? null,
            },
            suggestedQuestions: [],
            drumrollQuestion: null,
          }));
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