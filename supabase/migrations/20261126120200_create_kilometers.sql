-- kilometers : relevés du compteur (D5 + soft-delete D7 + sémantique date D14).

create table public.kilometers (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id),
  user_id uuid not null references public.profiles (id),
  km integer not null check (km >= 0),
  fuel_percent integer check (fuel_percent between 0 and 100),
  photo_path text,
  notes text,
  reading_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id),
  restored_at timestamptz,
  created_at timestamptz not null default now()
);

comment on column public.kilometers.reading_at is
  'Moment de la manipulation utilisateur, pas de l''insertion (D14) ; pré-rempli '
  'à maintenant, éditable ; sert de base aux comparaisons D6.';
comment on column public.kilometers.deleted_at is
  'Soft-delete (D7) : NULL = vivant. invisible par défaut dans l''UI ; les '
  'octets storage ne sont jamais purgés en v1.';

-- Sert au trigger anti-recul D6 (« dernier relevé du véhicule actif ») et à
-- l'historique trié : colonnes de tri descendantes + partiel sur les vivants.
create index kilometers_vehicle_reading_active
  on public.kilometers (vehicle_id, reading_at desc, created_at desc)
  where deleted_at is null;

-- Filtre « par utilisateur » (admin, D8) et historique de l'auteur.
create index kilometers_user
  on public.kilometers (user_id);
