-- D40 — Purge physique du patrimoine pré-sortie (écart unique et daté à D7,
-- acté en grillage produit 2026-11-27) : les relevés nés sous le modèle
-- « saisie brute » sont dénués de sens dans le modèle « sortie » — pas de
-- conversion, pas de cimetière legacy. Les octets storage référencés ont été
-- supprimés AVANT cette migration (ordre du plan M9 ; bucket photos vérifié
-- vide, y compris un orphelin sans ligne pointant dessus).
-- Sauvegarde de filet : dump SQL pris la veille de la purge (session M9),
-- hors-repo (supabase/.temp, gitignoré) — rejouable dans le SQL Editor.
-- D7 redevient intégral pour toute donnée née à partir d'ici : rien ne sera
-- plus jamais purgé physiquement.

delete from public.kilometers;

-- Note : aucune écriture sur trips — la table naît de la migration précédente
-- et est encore vide ; les véhicules et les profils ne sont pas concernés.
