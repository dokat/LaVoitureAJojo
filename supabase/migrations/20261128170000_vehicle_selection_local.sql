-- D44 (2026-11-28) : le véhicule courant devient un choix PAR NAVIGATEUR,
-- porté par le client (localStorage) — l'information n'a rien à faire en
-- base. Amendement de D3/D8 : la bascule admin d'activation disparaît, la
-- flotte (réel + dev) reste telle quelle. Le trigger anti-recul D6 est déjà
-- par véhicule (vehicle_id) : deux historiques parallèles, deux chronologies
-- indépendantes — rien d'autre à bouger côté règles métier.

-- 1) L'INSERT de relevés n'est plus borné au véhicule « actif » : n'importe
--    quel véhicule de la flotte (l'existence suffit ; le FK vehicles.id fait
--    le reste). La policy « ajout de releves sur le vehicule actif » citait
--    la colonne supprimée plus bas — la remplacer d'abord.
drop policy "ajout de releves sur le vehicule actif" on public.kilometers;

create policy "ajout de releves sur un vehicule de la flotte"
  on public.kilometers for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.vehicles v
      where v.id = vehicle_id
    )
  );

-- 2) Invariants d'activation hors service : l'index partiel unique qui
--    garantissait « au plus un actif » (D3), puis la colonne.
drop index if exists public.vehicles_one_active_at_a_time;

alter table public.vehicles drop column is_active;

comment on table public.vehicles is
  'Flotte = 1 véhicule réel + 1 véhicule de dev. Édition des infos réservée à '
  'l''admin (D8). Depuis D44 : aucun état « actif » en base, le véhicule '
  'courant est le choix de chaque navigateur.';
