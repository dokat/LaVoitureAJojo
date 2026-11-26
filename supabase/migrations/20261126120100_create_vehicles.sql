-- vehicles : une seule voiture partagée active (D2) ; le véhicule de dev est
-- une ligne supplémentaire que l'admin active/désactive (D3).

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  model text not null,
  plate text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.vehicles is
  'Flotte = 1 véhicule réel + 1 véhicule de dev. Bascule d''activation '
  'réservée à l''admin (D8).';

-- Au plus un véhicule actif à la fois (invariant D3, côté base).
create unique index vehicles_one_active_at_a_time
  on public.vehicles (is_active)
  where is_active;
