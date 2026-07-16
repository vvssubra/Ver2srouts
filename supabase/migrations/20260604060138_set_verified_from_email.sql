-- Use the verified sprouts.littlegreenhearts.com domain so Resend can deliver
-- to any recipient (not just the account owner).
UPDATE public.email_global_settings
SET from_email = 'noreply@sprouts.littlegreenhearts.com',
    reply_to_email = COALESCE(NULLIF(reply_to_email, ''), 'hello@littlegreenhearts.com'),
    updated_at = now()
WHERE singleton = true;
