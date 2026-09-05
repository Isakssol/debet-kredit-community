-- Rättelseverifikatets vändning ska följa originalets registreringsordning.
--
-- correct_verification byggde vändningen med `jsonb_agg(...) from
-- verification_rows where verification_id = p_original` UTAN `order by row_no`.
-- Postgres garanterar ingen radordning utan explicit sortering, så vändningens
-- rader kunde hamna i en annan ordning än originalets. Beloppen blev rätt, men
-- jämförelsen original mot rättelse blev onödigt svårläst för den som granskar.
--
-- BFNAR 2013:2 p. 2.2: "Inom den systematiska ordningen ska registreringsordningen
-- framgå för varje sorteringsbegrepp [...] Använder företaget flera
-- verifikationsnummerserier, ska registreringsordningen framgå inom varje enskild
-- serie." BFNAR 2013:2 p. 5.15: "Rättas en verifikation ska det göras på sådant
-- sätt att den ursprungliga uppgiften klart framgår."
-- https://www.bfn.se/wp-content/uploads/2020/06/bfnar13-2-grund.pdf

create or replace function correct_verification(
  p_original uuid,
  p_new_date date,
  p_new_description text,
  p_new_rows jsonb,
  p_reason text
) returns table (reversal_id uuid, replacement_id uuid)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_orig verifications%rowtype;
  v_series_code text;
  v_reversed jsonb;
  v_rev_id uuid;
  v_new_id uuid;
begin
  select * into v_orig from verifications where id = p_original;
  if not found then
    raise exception 'Originalverifikatet finns inte.';
  end if;
  if v_orig.corrected_by_id is not null then
    raise exception 'Verifikatet är redan rättat.';
  end if;
  select code into v_series_code from verification_series where id = v_orig.series_id;

  select jsonb_agg(jsonb_build_object(
           'account', account, 'debit', credit, 'credit', debit,
           'note', 'Vändning') order by row_no)
    into v_reversed
    from verification_rows where verification_id = p_original;

  select out_id into v_rev_id from book_verification(
    v_series_code, p_new_date,
    format('Rättelse av %s%s: %s', v_series_code, v_orig.number, p_reason),
    v_reversed, v_orig.counterparty, 'correction', p_original);

  if p_new_rows is not null then
    select out_id into v_new_id from book_verification(
      v_series_code, p_new_date, p_new_description, p_new_rows,
      v_orig.counterparty, 'correction', p_original);
  end if;

  return query select v_rev_id, v_new_id;
end;
$$;
