-- Allow authenticated users to manage bookings, banking, and related rows (single-tenant agency).
-- Apply in Supabase SQL editor if delete/update fails with RLS / permission errors.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'bookings'
  ) THEN
    ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'bookings' AND policyname = 'garasho_authenticated_all'
    ) THEN
      CREATE POLICY "garasho_authenticated_all" ON public.bookings
        FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'banking_accounts'
  ) THEN
    ALTER TABLE public.banking_accounts ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'banking_accounts' AND policyname = 'garasho_authenticated_all'
    ) THEN
      CREATE POLICY "garasho_authenticated_all" ON public.banking_accounts
        FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'booking_layovers'
  ) THEN
    ALTER TABLE public.booking_layovers ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'booking_layovers' AND policyname = 'garasho_authenticated_all'
    ) THEN
      CREATE POLICY "garasho_authenticated_all" ON public.booking_layovers
        FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'banking_account_ledger'
  ) THEN
    ALTER TABLE public.banking_account_ledger ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'banking_account_ledger' AND policyname = 'garasho_authenticated_all'
    ) THEN
      CREATE POLICY "garasho_authenticated_all" ON public.banking_account_ledger
        FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;
