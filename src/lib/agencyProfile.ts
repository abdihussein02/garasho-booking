import type { SupabaseClient } from "@supabase/supabase-js";

export type AgencyProfileRow = {
  id: string;
  agency_id: string | null;
  is_platform_admin: boolean;
};

export async function fetchAgencyProfile(
  supabase: SupabaseClient
): Promise<AgencyProfileRow | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, agency_id, is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    agency_id: row.agency_id != null ? String(row.agency_id) : null,
    is_platform_admin: Boolean(row.is_platform_admin),
  };
}

/** URL-safe slug: lowercase, hyphens, no leading/trailing hyphen. */
export function normalizeAgencySlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}
