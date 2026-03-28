import type { SupabaseClient } from "@supabase/supabase-js";
import { applyDepositIncrement, type DepositToastFn } from "./bankingDeposit";
import { getSupabaseErrorMessage } from "./supabaseErrors";

function isMissingRelation(msg: string | undefined) {
  return /42P01|does not exist|relation|schema cache/i.test(msg ?? "");
}

/**
 * Deletes a booking and related rows. If the ticket had a selling price and deposit account,
 * tries to reverse that amount on the linked banking account first (best-effort — failure does not block delete).
 */
export async function deleteBookingById(
  supabase: SupabaseClient,
  bookingId: string,
  toast: DepositToastFn
): Promise<void> {
  // Use * so we don’t reference columns some DBs never had (e.g. legacy deposit_account_id).
  const { data: row, error: fetchErr } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!row) {
    throw new Error("Ticket not found or already deleted.");
  }

  const raw = row as Record<string, unknown>;
  const accountId = (raw.deposit_to_id ?? raw.deposit_account_id) as string | null | undefined;
  const sp = raw.selling_price != null ? Number(raw.selling_price) : null;

  let depositReversalFailed: string | null = null;
  if (accountId && sp != null && sp > 0) {
    try {
      await applyDepositIncrement(supabase, String(accountId), -sp, toast, null, { silent: true });
    } catch (revErr) {
      depositReversalFailed = getSupabaseErrorMessage(revErr) || "reversal failed";
    }
  }

  const ly = await supabase.from("booking_layovers").delete().eq("booking_id", bookingId);
  if (ly.error && !isMissingRelation(ly.error.message)) throw ly.error;

  const led = await supabase.from("banking_account_ledger").delete().eq("booking_id", bookingId);
  if (led.error && !isMissingRelation(led.error.message)) throw led.error;

  const del = await supabase.from("bookings").delete().eq("id", bookingId);
  if (del.error) throw del.error;

  if (depositReversalFailed) {
    toast(
      "info",
      `Ticket removed. The linked bank balance was not adjusted automatically: ${depositReversalFailed}`
    );
  }
}
