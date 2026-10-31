# Issue #11 — validation du candidat d’ombres

- Issue : https://github.com/simonjamain/i-am-a-moucheron/issues/11
- Branche : `feat/issue-11-shadow-visibility`, synchronisée avec `main` (`cdd13eb`), version candidate 57.
- Code : réglage des ombres franches/contraste et comparateur A/B/B/A implémentés.
- Référence : [ombres](../shadow-visibility.md), avec protocole et limites.
- Preuves disponibles : inventaire CPU identique et test de l’instrumentation.
- Blocage : mesures WebGL logicielles acquises, acceptation visuelle encore ouverte.
- Livraison attendue : PR brouillon avec build Docker, non fusionnée tant que le
  critère de non-régression de l’issue n’a pas été vérifié.
- Prochaine action : comparer sol/bureau à trois hauteurs, mesurer ABBA deux fois,
  exporter JSON et captures ; reprendre la décision à partir de ces preuves.

## Reprise du 31 octobre 2026

Conflits avec main résolus en conservant les suites de tests des deux branches,
les entrées de backlog et les optimisations de collisions/UDP déjà intégrées.
Chromium absent ; installation Playwright tentée, téléchargement invalide
(archive vide ou tronquée), donc comparaison WebGL toujours indisponible.
Aucune mesure visuelle/GPU ni validation en partie revendiquée.

## Comparaison WebGL obtenue

Arbre local testé : `53e0520776785fc20271534136a11d0aa163011a`
(synchronisation main, candidat 57). Chromium 153 via @sparticuz/chromium,
ANGLE/SwiftShader logiciel ; résolution 640 × 480, ratio 1. Captures bureau
et sol au réglage 0,04 m : contraste plus fort, mais contours Basic fortement
crénelés. Pas d'acceptation visuelle ni de partie humaine validée.

Deux ABBA complets sur le bureau : 120 frames d'échauffement, 600 mesures/phase,
sept véhicules, 120 insectes. Synthèses transcrites depuis les sorties du comparateur (JSON bruts temporaires perdus après changement d’environnement) :
[essai 1](../measurements/shadows-swiftshader-abba-1.json),
[essai 2](../measurements/shadows-swiftshader-abba-2.json).

- Médianes des frames référence : 100 / 83,4 puis 99,9 / 99,9 ms.
- Candidat : 83,3 / 66,7 puis 83,3 / 83,2 ms.
- Draw calls médians identiques : 849 ; triangles médians identiques : 70 230.
- Les champs gpuMs proviennent de requêtes WebGL sur SwiftShader : ils ne
  mesurent pas une carte graphique matérielle. Variabilité importante des
  frames, aucune extrapolation aux postes des joueurs ni à une partie réseau.

La non-régression est observée dans ce scénario logiciel seulement. Le
crénelage doit être ajusté ou accepté explicitement après essai d'atterrissage
sur les postes ciblés. La PR reste en brouillon ; aucune fusion revendiquée.
