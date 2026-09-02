CREATE TABLE public.scheduled_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  direction text NOT NULL DEFAULT 'out',
  amount numeric NOT NULL DEFAULT 0,
  recurrence text NOT NULL DEFAULT 'monthly',
  day_of_month integer NOT NULL DEFAULT 1,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_payments TO authenticated;
GRANT ALL ON public.scheduled_payments TO service_role;

ALTER TABLE public.scheduled_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own scheduled payments" ON public.scheduled_payments
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX scheduled_payments_user_idx ON public.scheduled_payments (user_id, start_date);

CREATE TRIGGER update_scheduled_payments_updated_at
  BEFORE UPDATE ON public.scheduled_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();