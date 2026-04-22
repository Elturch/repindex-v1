// Agente Rix v2 — regression suite (max 300 LOC).
// Self-contained smoke tests that hit the live deployed edge function and
// validate streaming contract + intent dispatch. Triggered via:
//   GET /chat-intelligence-v2?test=regression
// or by importing runAllTests() from a Deno test runner.

export interface RegressionCase {
  name: string;
  intent: string;
  question: string;
  /** Expected substrings (case-insensitive, OR-matched) in the assembled stream text. */
  expects?: string[];
  /** Whether the case is a guard rejection (skips chunk-count threshold). */
  isGuard?: boolean;
}

export interface CaseResult {
  name: string;
  intent: string;
  question: string;
  http_status: number;
  ttfb_ms: number | null;
  total_ms: number;
  chunks_count: number;
  done_seen: boolean;
  agent_version_ok: boolean;
  expects_match: boolean | null;
  passed: boolean;
  errors: string[];
}

export interface RegressionSummary {
  total: number;
  passed: number;
  failed: number;
  ran_at: string;
  cases: CaseResult[];
}

export const REGRESSION_CASES: RegressionCase[] = [
  {
    name: "company_analysis · Iberdrola",
    intent: "company_analysis",
    question: "Analiza la reputación de Iberdrola",
    expects: ["iberdrola"],
  },
  {
    name: "company_analysis · Ferrovial",
    intent: "company_analysis",
    question: "Analiza la reputación de Ferrovial",
    expects: ["ferrovial"],
  },
  {
    name: "sector_ranking · IBEX-35 top 5",
    intent: "sector_ranking",
    question: "Dame el ranking del top 5 del IBEX-35",
    expects: ["ranking", "ibex"],
  },
  {
    name: "comparison · Repsol vs Endesa",
    intent: "comparison",
    question: "Compara Repsol con Endesa",
    expects: ["repsol", "endesa"],
  },
  {
    name: "model_divergence · Inditex",
    intent: "model_divergence",
    question: "Analiza la divergencia entre modelos para Inditex",
    expects: ["divergencia", "inditex"],
  },
  {
    name: "period_evolution · Iberdrola 4w",
    intent: "period_evolution",
    question: "Evolución de Iberdrola en las últimas 4 semanas",
    expects: ["evoluci", "iberdrola"],
  },
  {
    name: "guard · off-topic (Francia)",
    intent: "out_of_scope",
    question: "Cuál es la capital de Francia",
    expects: ["fuera", "no cubro", "no admit", "scope", "ámbito"],
    isGuard: true,
  },
  {
    name: "guard · scope (Apple)",
    intent: "company_analysis",
    question: "Analiza Apple",
    expects: ["fuera", "no cubro", "no encuentro", "español", "ibex", "ámbito"],
    isGuard: true,
  },
];

const TTFB_BUDGET_MS = 5000;
const MIN_CHUNKS = 10;
const MIN_CHUNKS_GUARD = 1; // Guards usually emit a single chunk reply.
const TIMEOUT_MS = 60_000;

async function runOneCase(
  baseUrl: string,
  authHeader: string | null,
  apiKey: string | null,
  testCase: RegressionCase,
): Promise<CaseResult> {
  const errors: string[] = [];
  const t0 = Date.now();
  let ttfbMs: number | null = null;
  let chunks = 0;
  let doneSeen = false;
  let agentVersionOk = false;
  let assembled = "";
  let httpStatus = 0;

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authHeader) headers["Authorization"] = authHeader;
    if (apiKey) headers["apikey"] = apiKey;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ question: testCase.question, conversation_history: [] }),
      signal: ctrl.signal,
    });
    httpStatus = res.status;
    if (!res.ok || !res.body) {
      errors.push(`HTTP ${res.status}`);
      clearTimeout(timer);
      return finalize();
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const frame = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 2);
        if (!frame.startsWith("data:")) continue;
        const payload = frame.slice(5).trim();
        if (payload === "[DONE]") continue;
        let json: any;
        try { json = JSON.parse(payload); } catch { continue; }
        if (json?.type === "chunk" && typeof json.text === "string") {
          if (ttfbMs == null) ttfbMs = Date.now() - t0;
          chunks += 1;
          assembled += json.text;
        } else if (json?.type === "done") {
          doneSeen = true;
          if (json?.metadata?.agentVersion === "v2") agentVersionOk = true;
        } else if (json?.type === "error") {
          errors.push(`stream error: ${json.error ?? "?"}`);
        }
      }
    }
    clearTimeout(timer);
  } catch (e) {
    errors.push(`fetch failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  return finalize();

  function finalize(): CaseResult {
    const totalMs = Date.now() - t0;
    // Validations
    if (httpStatus !== 200) errors.push(`expected HTTP 200, got ${httpStatus}`);
    if (ttfbMs == null) errors.push("no chunk received");
    else if (ttfbMs > TTFB_BUDGET_MS) errors.push(`TTFB ${ttfbMs}ms > ${TTFB_BUDGET_MS}ms`);
    const minChunks = testCase.isGuard ? MIN_CHUNKS_GUARD : MIN_CHUNKS;
    if (chunks < minChunks) errors.push(`chunks=${chunks} < ${minChunks}`);
    if (!doneSeen) errors.push("no done frame");
    if (!agentVersionOk) errors.push("metadata.agentVersion !== 'v2'");

    let expectsMatch: boolean | null = null;
    if (testCase.expects && testCase.expects.length > 0) {
      const lower = assembled.toLowerCase();
      expectsMatch = testCase.expects.some((needle) => lower.includes(needle.toLowerCase()));
      if (!expectsMatch) errors.push(`none of expects matched: ${testCase.expects.join("|")}`);
    }

    return {
      name: testCase.name,
      intent: testCase.intent,
      question: testCase.question,
      http_status: httpStatus,
      ttfb_ms: ttfbMs,
      total_ms: totalMs,
      chunks_count: chunks,
      done_seen: doneSeen,
      agent_version_ok: agentVersionOk,
      expects_match: expectsMatch,
      passed: errors.length === 0,
      errors,
    };
  }
}

/**
 * Run the full regression suite against the deployed v2 edge function.
 * Cases run sequentially to keep cost/log noise predictable.
 */
export async function runAllTests(opts: {
  baseUrl: string;
  authHeader?: string | null;
  apiKey?: string | null;
}): Promise<RegressionSummary> {
  const ranAt = new Date().toISOString();
  const cases: CaseResult[] = [];
  for (const c of REGRESSION_CASES) {
    const r = await runOneCase(opts.baseUrl, opts.authHeader ?? null, opts.apiKey ?? null, c);
    cases.push(r);
  }
  return {
    total: cases.length,
    passed: cases.filter((c) => c.passed).length,
    failed: cases.filter((c) => !c.passed).length,
    ran_at: ranAt,
    cases,
  };
}