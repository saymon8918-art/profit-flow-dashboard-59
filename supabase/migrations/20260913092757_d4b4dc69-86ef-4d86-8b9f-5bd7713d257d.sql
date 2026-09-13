alter function public.sales_agg(text[], date, date, text, text, text, text, int) security invoker;
revoke all on function public.sales_agg(text[], date, date, text, text, text, text, int) from public, anon;
grant execute on function public.sales_agg(text[], date, date, text, text, text, text, int) to authenticated;