# Issue 21 — traceurs instanciés, validation visuelle en attente

- Tâche : [issue 21](https://github.com/simonjamain/i-am-a-moucheron/issues/21) ;
  [PR 23](https://github.com/simonjamain/i-am-a-moucheron/pull/23), brouillon.
- Branche : `perf/instanced-tracers`. Code candidat, pas intégré à `main`.
  Les optimisations de collisions (#20) et d'encodage UDP (#24) sont intégrées.
- Résultat attendu : quatre lots de rendu pour 256 traceurs, balistique et
  collisions inchangées, sans régression visuelle ni baisse mesurée de fluidité.
- État : code, tests de matrices/couleurs/cycle de vie, repli logiciel et
  comparateur livrés. Après synchronisation avec #24, suite complète, build du
  paquet, validateur et liens réussis. Le commit exact et le Docker CI courant
  sont indiqués dans la PR ; vérifier le head avant de réutiliser ces preuves.
- Mesure CPU : 512 objets de rendu deviennent 4, triangles conservés ; la copie
  des matrices coûte légèrement plus de CPU. Aucun FPS ou temps GPU mesuré.
- Blocage : le navigateur distant ne joint pas localhost (connexion refusée).
  Le tri des halos instanciés avec les fumées et ailes alpha peut différer.
  Les matrices exactes ne prouvent pas une composition transparente identique.
- Prochaine action : servir `scripts/review-tracers.html` sur un poste WebGL,
  comparer images/pixels, draw calls et temps de soumission, puis observer les
  rafales en vraie partie (fumées, ailes, obstacles, tirs alliés/distants).
  Le comparateur ne mesure pas le temps GPU. Conserver le brouillon tant que
  la qualité et le bénéfice réels ne sont pas caractérisés ; ajuster si besoin.
- Référence durable : [performances](../performance.md). Le rendu instancié des
  ennemis, Workers, WASM/SIMD, WebGPU et deltas de snapshots ne sont pas implémentés
  ici ; leur choix demande un profilage sur les appareils ciblés.

## Reprise du 31 octobre 2026 — comparaison WebGL

Head testé : `d9847eb4958ad82c15a5e2c8838c5f90936178a1`.
Suite complète `npm test`, build et validateur du paquet, liens : succès.
Docker absent localement ; contrôle Docker build du head réussi (run 41194270655).

Chromium 153 obtenu via le paquet temporaire @sparticuz/chromium 153.0.0,
Playwright, rendu SwiftShader logiciel, viewport 1280 × 800 ; comparateur
640 × 360, 256 tirs, obstacle opaque, surface alpha et modèles d'insectes.
533 → 25 appels de dessin pour la scène complète ; 13 248 triangles inchangés.
Soumission CPU d'une exécution : 2,758 → 0,333 ms. Mesure statique, ordre A/B
unique : pas un temps GPU, un FPS de partie ni une mesure sur GPU matériel.

Différence : 1 205 canaux RGBA sur 921 600, écart maximal 76/255.
Le rendu n'est donc pas identique ; la capture confirme des différences
localisées autour des traceurs et des surfaces. L'acceptabilité en mouvement
et en partie reste à vérifier. Le gain en appels de dessin est établi pour
ce scénario, mais la parité visuelle et le bénéfice sur les machines ciblées
ne sont pas acquis. Pas de fusion ni de fermeture automatique de l'issue.
