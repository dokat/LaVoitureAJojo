-- Storage : bucket privé `photos`, chemin objet {user_id}/{reading_id}.jpg
-- (D16). Compression client ~1600 px/JPEG avant upload ; le brut > 10 Mo est
-- refusé à l'upload client et gardé ici par file_size_limit.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photos',
  'photos',
  false,                              -- privé : lecture par signed URLs
  10485760,                           -- 10 Mo (garde-fou D16)
  array['image/jpeg']                 -- sortie de la compression canvas
);

-- Lecture : tout authentifié (les signed URLs sont émises pour des
-- sessions authentifiées ; la policy est vérifiée à la lecture du lien).
create policy "photos lisibles par tout authentifie"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'photos');

-- Écriture : uniquement dans son propre dossier (premier segment du chemin =
-- auth.uid()), jamais d'écrasement du nom d'un autre.
create policy "upload photo dans son dossier"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Pas d'UPDATE ni DELETE : une photo d'un relevé est figée à son id ; une
-- soft-delete ne touche aucun octet (D7). Upsert non autorisé (INSERT seul).
