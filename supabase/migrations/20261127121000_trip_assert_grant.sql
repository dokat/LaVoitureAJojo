-- Correctif de la migration trips (M9) : trips_before_update est SECURITY
-- INVOKER — c'est voulu, car ses écritures induites dans kilometers (miroir
-- d'annulation D36, restauration D37) doivent rester sous les policies de
-- l'appelant. Mais il appelle le contrôleur D34 trip_assert_order dans le
-- contexte de l'utilisateur : le revoke EXECUTE posé à l'application le
-- bloquait (« permission denied for function trip_assert_order ») pour toute
-- clôture par un rôle authentifié — trahi par trips_test.sql (C1/C2/C4/R2/R6).
-- Le contrôle est une simple lecture des deux relevés (déjà visibles par tout
-- authentifié) : rendre EXECUTE à authenticated n'expose aucune écriture.

grant execute on function public.trip_assert_order(uuid, uuid, boolean)
  to authenticated;
