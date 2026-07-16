ALTER TABLE public.leave_requests ALTER COLUMN days TYPE numeric(5,1) USING days::numeric;

ALTER TABLE public.leave_balances 
  ALTER COLUMN annual_total TYPE numeric(6,1) USING annual_total::numeric,
  ALTER COLUMN annual_used TYPE numeric(6,1) USING annual_used::numeric,
  ALTER COLUMN medical_total TYPE numeric(6,1) USING medical_total::numeric,
  ALTER COLUMN medical_used TYPE numeric(6,1) USING medical_used::numeric,
  ALTER COLUMN maternity_total TYPE numeric(6,1) USING maternity_total::numeric,
  ALTER COLUMN maternity_used TYPE numeric(6,1) USING maternity_used::numeric,
  ALTER COLUMN paternity_total TYPE numeric(6,1) USING paternity_total::numeric,
  ALTER COLUMN paternity_used TYPE numeric(6,1) USING paternity_used::numeric,
  ALTER COLUMN emergency_total TYPE numeric(6,1) USING emergency_total::numeric,
  ALTER COLUMN emergency_used TYPE numeric(6,1) USING emergency_used::numeric,
  ALTER COLUMN unpaid_total TYPE numeric(6,1) USING unpaid_total::numeric,
  ALTER COLUMN unpaid_used TYPE numeric(6,1) USING unpaid_used::numeric,
  ALTER COLUMN compassionate_total TYPE numeric(6,1) USING compassionate_total::numeric,
  ALTER COLUMN compassionate_used TYPE numeric(6,1) USING compassionate_used::numeric,
  ALTER COLUMN replacement_total TYPE numeric(6,1) USING replacement_total::numeric,
  ALTER COLUMN replacement_used TYPE numeric(6,1) USING replacement_used::numeric,
  ALTER COLUMN hospitalisation_total TYPE numeric(6,1) USING hospitalisation_total::numeric,
  ALTER COLUMN hospitalisation_used TYPE numeric(6,1) USING hospitalisation_used::numeric;