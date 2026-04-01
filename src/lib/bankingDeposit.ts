import type { SupabaseClient } from "@supabase/supabase-js";

export type DepositToastFn = (
  variant: "error" | "success" | "info",
  message: string
) => void;

function isMissingColumnOrSchemaError(message: string) {
  return /does not exist|schema cache|could not find.*column/i.test(message);
}

function isMissingLedgerTableError(message: string | undefined) {
  return /banking_account_ledger|42P01|relation.*does not exist/i.test(message ?? "");
}

/**
 * Ensures the id refers to an existing banking_accounts row (no inserts).
 */
export async function assertDepositAccountExists(
  supabase: SupabaseClient,
  accountId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("banking_accounts")
    .select("id")
    .eq("id", accountId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(
      "That deposit account is not in your Banking list. Add it under Banking first, then refresh this page."
    );
  }
}

async function tryRecordLedgerEntry(
  supabase: SupabaseClient,
  accountId: string,
  amount: number,
  memo: string,
  opts: { bookingId?: string | null; source?: string }
) {
  const { error } = await supabase.from("banking_account_ledger").insert({
    banking_account_id: accountId,
    amount,
    source: opts.source ?? "booking",
    booking_id: opts.bookingId ?? null,
    memo,
  });
  if (error && !isMissingLedgerTableError(error.message)) {
    throw error;
  }
}

/**
 * Prefer RPC; if missing, read–modify–write balance (current_balance or legacy balance).
 * Optionally records a ledger row (ticket booking, standalone visa case, etc.).
 */
export type DepositLedgerRef =
  | { memo: string; bookingId: string; source?: "booking" }
  | { memo: string; source: "visa_case" };

export async function applyDepositIncrement(
  supabase: SupabaseClient,
  accountId: string,
  amount: number,
  toast: DepositToastFn,
  ledger: DepositLedgerRef | null,
  opts?: { silent?: boolean }
) {
  await assertDepositAccountExists(supabase, accountId);

  const { error: rpcError } = await supabase.rpc("increment_bank_account_balance", {
    p_account_id: accountId,
    p_amount: amount,
  });

  if (!rpcError) {
    if (ledger) {
      const source =
        "bookingId" in ledger ? ledger.source ?? "booking" : ledger.source;
      const bookingId = "bookingId" in ledger ? ledger.bookingId : null;
      await tryRecordLedgerEntry(supabase, accountId, amount, ledger.memo, {
        bookingId,
        source,
      });
    }
    return;
  }

  const msg = rpcError.message ?? "";
  const fnMissing =
    /increment_bank_account_balance/i.test(msg) &&
    (/could not find function|schema cache|does not exist/i.test(msg));

  if (!fnMissing) throw rpcError;

  let current = 0;
  const selPrimary = await supabase
    .from("banking_accounts")
    .select("current_balance")
    .eq("id", accountId)
    .maybeSingle();

  if (selPrimary.error && isMissingColumnOrSchemaError(selPrimary.error.message ?? "")) {
    const selLegacy = await supabase
      .from("banking_accounts")
      .select("balance")
      .eq("id", accountId)
      .maybeSingle();
    if (selLegacy.error) throw selLegacy.error;
    const row = selLegacy.data as Record<string, unknown> | null;
    current = row?.balance != null ? Number(row.balance) : 0;
  } else if (selPrimary.error) {
    throw selPrimary.error;
  } else {
    const row = selPrimary.data as Record<string, unknown> | null;
    current = row?.current_balance != null ? Number(row.current_balance) : 0;
  }

  const next = current + amount;

  let { error: upErr } = await supabase
    .from("banking_accounts")
    .update({ current_balance: next })
    .eq("id", accountId);

  if (upErr && isMissingColumnOrSchemaError(upErr.message ?? "")) {
    const second = await supabase.from("banking_accounts").update({ balance: next }).eq("id", accountId);
    upErr = second.error;
  }

  if (upErr) throw upErr;

  if (ledger) {
    const source = "bookingId" in ledger ? ledger.source ?? "booking" : ledger.source;
    const bookingId = "bookingId" in ledger ? ledger.bookingId : null;
    await tryRecordLedgerEntry(supabase, accountId, amount, ledger.memo, { bookingId, source });
  }

  if (!opts?.silent) {
    toast("info", "Deposit applied to the selected account.");
  }
}
