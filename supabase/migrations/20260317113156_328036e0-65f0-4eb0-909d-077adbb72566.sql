
-- Fix race condition in generate_invoice_number with advisory lock
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _year text;
  _month text;
  _seq integer;
  _number text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('invoice_number'));
  _year := to_char(CURRENT_DATE, 'YYYY');
  _month := to_char(CURRENT_DATE, 'MM');
  SELECT COALESCE(MAX(
    CAST(substring(invoice_number from 'INV-\d{6}-(\d+)') AS integer)
  ), 0) + 1 INTO _seq
  FROM invoices
  WHERE invoice_number LIKE 'INV-' || _year || _month || '-%';
  _number := 'INV-' || _year || _month || '-' || lpad(_seq::text, 4, '0');
  RETURN _number;
END;
$$;

-- Fix race condition in generate_credit_note_number with advisory lock
CREATE OR REPLACE FUNCTION public.generate_credit_note_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _year text;
  _month text;
  _seq integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('credit_note_number'));
  _year := to_char(CURRENT_DATE, 'YYYY');
  _month := to_char(CURRENT_DATE, 'MM');
  SELECT COALESCE(MAX(
    CAST(substring(credit_note_number from 'CN-\d{6}-(\d+)') AS integer)
  ), 0) + 1 INTO _seq
  FROM credit_notes
  WHERE credit_note_number LIKE 'CN-' || _year || _month || '-%';
  RETURN 'CN-' || _year || _month || '-' || lpad(_seq::text, 4, '0');
END;
$$;
