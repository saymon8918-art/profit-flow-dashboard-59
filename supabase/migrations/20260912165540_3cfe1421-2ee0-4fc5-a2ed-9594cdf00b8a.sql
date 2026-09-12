CREATE TABLE public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  file_name text NOT NULL,
  sheet_name text,
  total_rows integer NOT NULL DEFAULT 0,
  inserted_rows integer NOT NULL DEFAULT 0,
  duplicate_rows integer NOT NULL DEFAULT 0,
  skipped_rows integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'processing',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_batches TO authenticated;
GRANT ALL ON public.import_batches TO service_role;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own import batches" ON public.import_batches
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_import_batches_updated_at BEFORE UPDATE ON public.import_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX import_batches_user_created_idx ON public.import_batches (user_id, created_at DESC);

CREATE TABLE public.sales_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  import_batch_id uuid REFERENCES public.import_batches(id) ON DELETE CASCADE,
  transaction_id text,
  transaction_date date,
  transaction_time time,
  transaction_qty numeric,
  store_id text,
  store_location text,
  product_id text,
  unit_price numeric,
  product_category text,
  product_type text,
  product_detail text,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_transactions_user_row_hash_key UNIQUE (user_id, row_hash)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_transactions TO authenticated;
GRANT ALL ON public.sales_transactions TO service_role;
ALTER TABLE public.sales_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own sales transactions" ON public.sales_transactions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_sales_transactions_updated_at BEFORE UPDATE ON public.sales_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX sales_transactions_user_date_idx ON public.sales_transactions (user_id, transaction_date DESC, transaction_time DESC);
CREATE INDEX sales_transactions_user_batch_idx ON public.sales_transactions (user_id, import_batch_id);