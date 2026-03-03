import type { SupabaseClient } from "@supabase/supabase-js";
import type { SkillResult } from "./shared";

export interface CompanyDetailInput {
  ticker?: string;
  issuer_name?: string;
}

export interface CompanyDetailOutput {
  issuer_name: string;
  ticker: string;
  sector_category: string | null;
  subsector: string | null;
  ibex_status: string;
  ibex_family_code: string | null;
  ibex_family_category: string | null;
  verified_competitors: unknown;
  website: string | null;
  cotiza_en_bolsa: boolean;
  geography: string[];
  corporate?: {
    ceo_name: string | null;
    company_description: string | null;
    headquarters_city: string | null;
    headquarters_country: string | null;
    employees_approx: number | null;
    founded_year: number | null;
    last_reported_revenue: string | null;
  };
}

export async function skillGetCompanyDetail(
  params: CompanyDetailInput,
  supabase: SupabaseClient
): Promise<SkillResult<CompanyDetailOutput>> {
  const start = Date.now();
  try {
    if (!params.ticker && !params.issuer_name) {
      return { success: false, error: "Either ticker or issuer_name is required" };
    }

    let query = supabase
      .from("repindex_root_issuers")
      .select("*");

    if (params.ticker) {
      query = query.eq("ticker", params.ticker);
    } else if (params.issuer_name) {
      query = query.ilike("issuer_name", `%${params.issuer_name}%`);
    }

    const { data, error } = await query.limit(1).maybeSingle();

    if (error) {
      return { success: false, error: `Issuer query failed: ${error.message}` };
    }
    if (!data) {
      return { success: false, error: `No issuer found for ${params.ticker || params.issuer_name}` };
    }

    const issuer = data as Record<string, unknown>;
    const ticker = String(issuer.ticker ?? "");

    // Fetch latest corporate snapshot
    let corporate: CompanyDetailOutput["corporate"] = undefined;
    const { data: snap } = await supabase
      .from("corporate_snapshots")
      .select("ceo_name,company_description,headquarters_city,headquarters_country,employees_approx,founded_year,last_reported_revenue")
      .eq("ticker", ticker)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (snap) {
      const s = snap as Record<string, unknown>;
      corporate = {
        ceo_name: s.ceo_name as string | null,
        company_description: s.company_description as string | null,
        headquarters_city: s.headquarters_city as string | null,
        headquarters_country: s.headquarters_country as string | null,
        employees_approx: s.employees_approx as number | null,
        founded_year: s.founded_year as number | null,
        last_reported_revenue: s.last_reported_revenue as string | null,
      };
    }

    return {
      success: true,
      data: {
        issuer_name: String(issuer.issuer_name ?? ""),
        ticker,
        sector_category: issuer.sector_category as string | null,
        subsector: issuer.subsector as string | null,
        ibex_status: String(issuer.ibex_status ?? ""),
        ibex_family_code: issuer.ibex_family_code as string | null,
        ibex_family_category: issuer.ibex_family_category as string | null,
        verified_competitors: issuer.verified_competitors,
        website: issuer.website as string | null,
        cotiza_en_bolsa: Boolean(issuer.cotiza_en_bolsa),
        geography: (issuer.geography as string[]) || [],
        corporate,
      },
      meta: { rows_returned: 1, execution_ms: Date.now() - start },
    };
  } catch (e: unknown) {
    return { success: false, error: `skillGetCompanyDetail exception: ${e instanceof Error ? e.message : String(e)}` };
  }
}
