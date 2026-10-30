# Issue #11 — validation du candidat d’ombres

- Issue : https://github.com/simonjamain/i-am-a-moucheron/issues/11
- Branche : `feat/issue-11-shadow-visibility`, base `b879557` (après #9 et #10).
- Code : réglage des ombres franches/contraste et comparateur A/B/B/A implémentés.
- Référence : [ombres](../shadow-visibility.md), avec protocole et limites.
- Preuves disponibles : inventaire CPU identique et test de l’instrumentation.
- Blocage : Chromium absent ; aucune comparaison WebGL ni performance réelle.
- Livraison attendue : PR brouillon avec build Docker, non fusionnée tant que le
  critère de non-régression de l’issue n’a pas été vérifié.
- Prochaine action : comparer sol/bureau à trois hauteurs, mesurer ABBA deux fois,
  exporter JSON et captures ; reprendre la décision à partir de ces preuves.
