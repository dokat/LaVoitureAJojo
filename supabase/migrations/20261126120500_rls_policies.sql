-- RLS : modèle cible de decisions.md §6. SELECT tout authentifié ; INSERT
-- tout authentifié sur véhicule actif (auteur = user_id) ; soft-delete par
-- l'auteur ou admin ; restauration admin seulement.

-- ── Helper : rôle admin depuis profiles (jamais depuis le JWT — D8) ───────
create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  );
$$;

comment on function public.is_admin() is
  'SECURITY INVOKER : lit profiles via la policy SELECT (pas de recursion, '
  'pas de bypass). Utiliser (select public.is_admin()) dans les policies.';

-- ── Activation ─────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.kilometers enable row level security;

-- ── profiles ───────────────────────────────────────────────────────────────
-- Lecture de tous (rôles non confidentiels, jointure historique « par
-- utilisateur ») ; auto-création limitée au rôle 'membre' : personne ne se
-- promeut lui-même par l'API (la promotion passe par le dashboard, D8).

create policy "profils lisibles par tout authentifie"
  on public.profiles for select
  to authenticated
  using (true);

create policy "creation de son propre profil en membre"
  on public.profiles for insert
  to authenticated
  with check (id = (select auth.uid()) and role = 'membre');

-- Pas de policy UPDATE/DELETE : le rôle ne bouge que par intervention
-- manuelle en base.

-- ── vehicles ───────────────────────────────────────────────────────────────

create policy "vehicules lisibles par tout authentifie"
  on public.vehicles for select
  to authenticated
  using (true);

-- Édition infos + bascule d'activation réservées à l'admin (D8, milestone 6).
-- Pas d'INSERT/DELETE : les véhicules naissent du seed et ne meurent pas (v1).

create policy "vehicules editables par admin"
  on public.vehicles for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ── kilometers ─────────────────────────────────────────────────────────────

create policy "releves visibles par tout authentifie"
  on public.kilometers for select
  to authenticated
  using (true);

-- L'écriture n'est bornée par RLS qu'au véhicule ACTIF (D2/D3) et à
-- l'auteur ; le contrôle D6 lui-même est dans le trigger.

create policy "ajout de releves sur le vehicule actif"
  on public.kilometers for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.vehicles v
      where v.id = vehicle_id and v.is_active
    )
  );

-- Auteur : compléter ses relevés vivants (photo_path après upload, notes,
-- essence). Les colonnes structurantes sont gardées par le trigger
-- kilometers_immutable. deleted_at doit rester NULL → ne restaure rien.

create policy "complement de ses releves par l_auteur"
  on public.kilometers for update
  to authenticated
  using (user_id = (select auth.uid()) and deleted_at is null)
  with check (user_id = (select auth.uid()) and deleted_at is null);

-- Auteur : soft-delete des SIENS uniquement (deleted_by forcé = soi).

create policy "soft_delete de ses releves par l_auteur"
  on public.kilometers for update
  to authenticated
  using (user_id = (select auth.uid()) and deleted_at is null)
  with check (
    user_id = (select auth.uid())
    and deleted_at is not null
    and deleted_by = (select auth.uid())
  );

-- Admin : soft-delete d'autrui + restauration (deleted_at → NULL). Le trigger
-- de restauration D6 recontrôle la remise en chronologie.

create policy "admin gere tous les releves"
  on public.kilometers for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Pas de policy DELETE : rien n'est purgé physiquement en v1 (D7).
