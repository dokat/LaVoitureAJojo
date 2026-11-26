-- Durcissement signalé par les advisors Supabase (fin de milestone 2) :
-- 1) search_path figé sur les fonctions de trigger (lint 0011) ;
-- 2) handle_new_user() n'est plus callable via RPC par anon/authenticated
--    (lints 0028/0029) — EXECUTE retiré au public, rendu à service_role seul
--    (c'est lui qui déclenche le trigger lors des inscriptions GoTrue).

alter function public.kilometers_immutable_columns() set search_path = '';
alter function public.enforce_odometer_no_regression() set search_path = '';

revoke execute on function public.handle_new_user() from public, anon, authenticated;
-- Les rôles internes qui insèrent dans auth.users (via trigger ou RPC de
-- synchronisation) doivent garder EXECUTE, sinon l'inscription casse.
grant execute on function public.handle_new_user() to
  service_role, supabase_auth_admin, supabase_admin;
