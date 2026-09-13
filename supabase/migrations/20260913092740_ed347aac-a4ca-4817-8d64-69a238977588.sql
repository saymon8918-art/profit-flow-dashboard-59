create or replace function public.sales_agg(
  p_dims text[] default '{}',
  p_start date default null,
  p_end date default null,
  p_category text default null,
  p_location text default null,
  p_product text default null,
  p_order text default 'revenue',
  p_limit int default 50
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_allowed text[] := array['date','month','weekday','hour','store_id','store_location','product_category','product_type','product_detail','product_id'];
  d text;
  v_expr text;
  v_sel text := '';
  v_grp text := '';
  v_sql text;
  v_res jsonb;
  v_order text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  foreach d in array coalesce(p_dims, '{}'::text[]) loop
    if not (d = any(v_allowed)) then
      raise exception 'invalid dimension: %', d;
    end if;
    v_expr := case d
      when 'date' then 'transaction_date::text'
      when 'month' then 'to_char(transaction_date, ''YYYY-MM'')'
      when 'weekday' then 'trim(to_char(transaction_date, ''Day''))'
      when 'hour' then 'lpad(extract(hour from transaction_time)::text, 2, ''0'')'
      else quote_ident(d)
    end;
    v_sel := v_sel || format('%s as %I, ', v_expr, d);
    v_grp := v_grp || v_expr || ', ';
  end loop;

  v_order := case p_order
    when 'units' then 'units desc'
    when 'transactions' then 'transactions desc'
    when 'dimension' then case when v_grp = '' then 'revenue desc' else '1 asc' end
    else 'revenue desc'
  end;

  v_sql := 'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select ' || v_sel ||
    'round(sum(coalesce(transaction_qty,0) * coalesce(unit_price,0))::numeric, 2) as revenue, ' ||
    'sum(coalesce(transaction_qty,0))::numeric as units, ' ||
    'count(*)::bigint as transactions ' ||
    'from public.sales_transactions where user_id = auth.uid() ' ||
    'and ($1 is null or transaction_date >= $1) ' ||
    'and ($2 is null or transaction_date <= $2) ' ||
    'and ($3 is null or product_category ilike $3) ' ||
    'and ($4 is null or store_location ilike $4) ' ||
    'and ($5 is null or product_detail ilike $5 or product_type ilike $5) ';

  if v_grp <> '' then
    v_sql := v_sql || ' group by ' || left(v_grp, length(v_grp) - 2);
  end if;

  v_sql := v_sql || ' order by ' || v_order || ' limit ' || least(coalesce(p_limit, 50), 500) || ') t';

  execute v_sql into v_res using p_start, p_end, p_category, p_location, p_product;
  return coalesce(v_res, '[]'::jsonb);
end
$$;

revoke all on function public.sales_agg(text[], date, date, text, text, text, text, int) from public;
grant execute on function public.sales_agg(text[], date, date, text, text, text, text, int) to authenticated;