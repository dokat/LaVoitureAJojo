-- D27 (milestone 6) : le filtre historique « par utilisateur » (D8) exige des
-- libellés lisibles ; la table `profiles` (§6) ne porte que id/role et le
-- champ email de auth.users n'est pas exposé aux clients. On ajoute donc une
-- colonne email sur profiles, synchronisée depuis auth.users par trigger.
--
-- Confidentialité assumée : la policy SELECT existante (« profils lisibles par
-- tout authentifie ») rend l'email visible de tout membre du cercle — cohérent
-- avec D8 (« un membre voit tout l'historique », saisies déjà nominatives).
-- Pas de nouvelle policy : pas de nouveau droit d'écriture.

alter table public.profiles add column email text;

comment on column public.profiles.email is
  'Copie de auth.users.email (trigger). Nulle que pour des lignes antérieures '
  'à la migration ; visible des membres authentifiés (D8/D27).';

-- ── Synchronisation ──────────────────────────────────────────────────────────
-- Même patron que handle_new_user() : SECURITY DEFINER, search_path figé,
-- EXECUTE retiré au public et rendu aux seuls rôles internes qui écrivent
-- dans auth.users (durcissement des advisors, cf. 20261126120800).

create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

comment on function public.sync_profile_email() is
  'Trigger AFTER INSERT OR UPDATE OF email on auth.users. upsert : ne crée '
  'jamais de rôle admin (le défaut de colonne suffit — D8).';

revoke execute on function public.sync_profile_email() from public, anon, authenticated;
grant execute on function public.sync_profile_email() to
  service_role, supabase_auth_admin, supabase_admin;

create trigger on_auth_user_email_synced
  after insert or update of email on auth.users
  for each row execute function public.sync_profile_email();

-- ── Backfill des comptes existants (créés par SQL ou avant ce trigger) ──────
update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id
   and p.email is null;
