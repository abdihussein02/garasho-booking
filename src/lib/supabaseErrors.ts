/** Normalize Supabase/PostgREST errors (not always `instanceof Error` in all bundles). */
export function getSupabaseErrorMessage(e: unknown): string {
  if (e == null) return "";
  if (typeof e === "string") return e.trim();
  if (e instanceof Error && e.message.trim()) return e.message.trim();
  if (typeof e === "object") {
    const o = e as Record<string, unknown>;
    if (typeof o.message === "string" && o.message.trim()) return o.message.trim();
    if (typeof o.error_description === "string" && o.error_description.trim()) {
      return o.error_description.trim();
    }
    if (typeof o.details === "string" && o.details.trim()) return o.details.trim();
    if (typeof o.hint === "string" && o.hint.trim()) return o.hint.trim();
    if (typeof o.code === "string" && o.code.trim()) return o.code.trim();
  }
  return "";
}
