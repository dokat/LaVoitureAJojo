# features/

Découpage par fonctionnalité métier : `auth/`, `trips/` (flux sortie —
`saisie` M11 a disparu, remplacé), `dashboard/`, `history/`, `offline/`,
`vehicle/`.

Règles :

- chaque feature contient ses composants d'écran/formulaires et ses sous-unités
  propres ;
- les composants restent petits et composables, issus de `components/ui`
  (shadcn) ;
- le partage entre features passe par `hooks/` et `repositories/`, pas par des
  imports croisés de composants.
