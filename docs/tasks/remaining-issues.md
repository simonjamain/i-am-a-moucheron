# Issues restantes — traitement autonome par priorité

- Dépôt : https://github.com/simonjamain/i-am-a-moucheron.
- Demande : implémenter les issues restantes successivement, P0 puis P1/P2/P3 ;
  demander uniquement les décisions explicites, dont validation des nouveaux visuels Meshy.
- Livré : #94 via PR #115, squash `782cc61350da14b1047621a7bdf24635fe26c8cc`.
  Six contrôles GitHub réussis, dont Docker et 50 pairs UDP ; issue fermée.
- En cours : #95, branche `fix/95-placement-preview`, base `782cc61`.
  Modèles de défense partagés avec l’aperçu ; orientation achetée transmise au serveur,
  emprise tournée et pointage des canons après rotation. Tests Three.js sans GPU ajoutés.
- Suite : #96 aide contextuelle, #97 trajectoires ; P1 #98–103, P2 #104–108,
  P3 #109–113. #99/#111/#112/#113 nécessitent des propositions visuelles approuvées
  avant les générations concernées. #76 et #78 restent des chantiers à vérifier
  contre leurs notes et critères, pas à fermer sur simple présence de code.
- PR préexistantes : #49, #84, hors contribution courante ; ne pas les confondre
  avec les correctifs livrés ici.
- Environnement : clone public et npm ci fonctionnent ; push Git sans credentials
  échoue. Publier les sources via le connecteur GitHub (tree/commit/branch/PR),
  puis récupérer main après fusion. Ne pas pousser les sorties générées périmées :
  build/démarrage régénèrent worker/assets.js, worker/index.js et docs/ui-review.html.
- Vérifications : npm test complet réussi pour #94 (Node v24.22.1), build/artefact,
  docs, format des fichiers CI et version. Pour #95, tests ciblés placement/modèles
  réussis ; suite complète réussie, puis contrôles ciblés relancés après revue.
  CI et Docker restent à vérifier avant fusion.
- Limites : Docker absent localement. Chromium tenté avec Playwright, arrêt au
  démarrage `socket() failed: Operation not permitted`. Aucun essai WebGL interactif
  ni WAN revendiqué ; deux pairs UDP natifs locaux couverts par npm test.
- Prochaine action : terminer revue et contrôles de #95, publier PR ciblée,
  attendre tous les checks dont Docker avant squash ; vérifier issue et main.
