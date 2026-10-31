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
