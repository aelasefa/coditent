create extension if not exists supabase_vault with schema vault;

-- Only the trusted Edge Function's service_role may retrieve the application
-- secret bundle. Teammate tokens are checked by that function, never by SQL.
create or replace function public.get_coditent_runtime_secrets()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(secret.name, secret.decrypted_secret),
    '{}'::jsonb
  )
  from vault.decrypted_secrets as secret
  where secret.name = any (array[
    'DATABASE_URL',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'JWT_SECRET',
    'SECRET_KEY',
    'GEMINI_API_KEY',
    'GEMINI_MODEL',
    'GEMINI_FALLBACK_MODEL',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'LINKEDIN_CLIENT_ID',
    'LINKEDIN_CLIENT_SECRET',
    'RESEND_API_KEY',
    'EMAIL_OUTBOX_ENCRYPTION_KEY',
    'TOTP_ENCRYPTION_KEY'
  ]::text[]);
$$;

revoke all on function public.get_coditent_runtime_secrets() from public;
revoke all on function public.get_coditent_runtime_secrets() from anon;
revoke all on function public.get_coditent_runtime_secrets() from authenticated;
grant execute on function public.get_coditent_runtime_secrets() to service_role;
