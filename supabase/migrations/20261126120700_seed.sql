-- Seed : le véhicule réel + le véhicule de dev (D2/D3), et marquage manuel du
-- compte admin initial (D8).

insert into public.vehicles (brand, model, plate, is_active) values
  ('Honda', 'Insight', 'AA876RE', true),
  ('Dev', 'Véhicule de test', 'DEV-000', false);

comment on table public.vehicles is
  'Seed 2026-11-26 : Honda Insight (actif) + véhicule de dev inactif, basculé '
  'par l''admin (D3).';

-- Compte admin initial : promotion « à la main » comme le dit D8. À exécuter
-- APRÈS la création du compte auth.users (sinon 0 ligne touchée — rejouer ce
-- update après coup). Voir notes du milestone 2 dans docs/plan-execution.md.
update public.profiles
set role = 'admin'
where id in (
  select id from auth.users
  where email = 'jonathan.perrinet@gmail.com'
);
