# G1 Castor — issue #76

## Lot 8 — première défense exclusive (branche feat/issue-76-castor-defenses)

- Carte de plan « Tourelle automatique du Castor », construction ponctuelle depuis le conducteur pour 9 $, plafond de 12 installations par salle.
- Ciblage et dégâts calculés par Node (30 dégâts, 0,42 m, 1 tir/0,5 s), 180 balles finies et recharge payante seulement à portée d’une station ou du Castor, via le répartiteur commun. Maquette low-poly de tourelle dans le client.
- Tests de domaine et serveur : `node scripts/test-ground-sentry.mjs` dans la suite ; contrôles GitHub Actions `Docker build` obligatoires avant fusion. Aucun essai WebGL/FPS réel revendiqué.
- **Restant pour clôturer #76** : bunker LEGO occupable, canon antichar lourd occupable, essais réels WebGL/UDP et FPS de plusieurs Castor ; ne pas fermer l’issue lors de la fusion de ce lot.


- Issue : https://github.com/simonjamain/i-am-a-moucheron/issues/76.
- Branche du premier lot : `feat/castor-paid-service` ; **ne clôture pas l'issue**.
- Contexte : main VERSION 171 à la prise en charge. Modèles Meshy générés et texturés (châssis `01a1afc9-29f8-771d-8efc-493296643670`, tourelle `01a1afc9-3823-7324-ae2b-56cd8adf4c34`, roue `01a1afc9-4756-727e-8b75-cf19b054f6d4`). Les fichiers GLB n'ont pas été intégrés dans ce lot.
- Terminé dans ce lot : moteur de service payant automatique des véhicules à proximité des stations fixes ; algorithme de répartition équitable, service des véhicules en vol et en mouvement, premiers tarifs, tests de domaine.
- Restant : Castor pilotable, véritable Meshy/textures/animations indépendantes, pose continue, caméra tactique, réparations de barricades, pistolets/DCA fixes à munitions finies, défenses exclusives et plans de cartes, tests WebGL/UDP.
- Vérifications attendues sur le commit final : `npm run format:check`, `npm test`, `npm run check:docs`, `npm run build`, `node scripts/validate-artifact.mjs`, `docker build -t g1-castor .`.
- Environnement de l'agent : Docker et clone réseau GitHub indisponibles localement ; vérifier `Docker build` sur GitHub Actions avant toute fusion. Pas de prévisualisation PR.
- Prochaine action : vérifier CI du premier lot, corriger si nécessaire, puis prendre l'intégration du Castor et des GLB Meshy dans une branche dédiée. Les tests réseau et pilotage réel resteront à mener.

- Correctif après première CI : le test d'absence de ravitaillement déplace désormais l'avion hors de la zone (le service en vol est devenu intentionnel). Ajustement du test de période (le tick est borné à 5 s). Le résultat dépend de la nouvelle CI.

- Deuxième CI : le test du tank doit aussi quitter le rayon d'Alpha, sinon le rechargement payant en vol annule le débit d'un obus. Le formatage du nouveau bloc serveur est corrigé.

- Troisième CI : la régression de réparation (test-comfort) reposait sur la gratuité, l'immobilisation et 10 s en un seul appel ; elle prévoit désormais le service payant, réparation même en mouvement, et les 5 s bornées par tick.

- Quatrième CI : test-backlog-return initialise maintenant la caisse pour un service payant, et exige la réparation progressive du moteur/des ailes (plutôt que leur remise instantanée et gratuite).

- Cinquième CI : test-paid-service a révélé que les capacités de munitions appliquaient un multiplicateur `undefined` lorsqu'on passe une balance partielle vide. Le service utilise désormais les capacités de base en l'absence de `balance.ammo`.

- Contrôle de dette : les prêts peuvent laisser la caisse négative. Ne pas annuler cette dette lors d'un tick de service : aucun service si solde négatif, mais conserver le solde réel.

## Lot 2 — pilotage et soutien
- Branche : `feat/castor-drivable-support`, issue #76 partiellement couverte.
- Fait dans la branche : Castor signé à 12 $, conduite monoplace, mitrailleuse légère (500 balles), vue tactique V, soutien sphérique mobile 50 cm incluant son propre entretien. Maquette 6 roues articulées et tourelle, **pas les exports Meshy**.
- Restant : import des 3 modèles texturés Meshy, construction continue en roulant, service des barricades/pistolets/DCA fixes, défenses exclusives et cartes ; essai WebGL/UDP humain.
- Contrôles à effectuer sur le commit final : suite complète, format, documentation, build/artefact, GitHub Actions Docker build ; pas de Docker ni clone GitHub réseau direct dans cet environnement.

- Première CI PR #79 : la compatibilité Worker/D1 créait le Castor gratuitement à la connexion car sa boucle historique énumérait toutes les entrées de `VEHICLES`. Exclusion explicite : **le Castor relève uniquement des achats Node/UDP**. Remise du `server/game.js` historique : PV inchangés à 100, pas de changement d'autorité santé nécessaire dans ce lot. Le build Docker et les tests doivent être relancés sur le commit de correction.

- CI complémentaire : les tests de durée standard des munitions sont désormais exclus pour le Castor : sa MG 500 balles a volontairement une cadence réduite, avec couverture dédiée dans `test-castor.mjs`.

- Les tests Node, y compris celui du Castor, passent sur la CI précédente. Reste un contrôle de formatage de `src/client.js` et `docs/code-structure.md` à corriger, puis réexécution complète.

- Diagnostic temporaire de formatage Prettier exécuté dans CI, puis retiré du test : seul le retrait d'une ligne blanche et l'alignement d'une chaîne de ternaires étaient nécessaires. Les tests de domaine et la suite complète avaient passé ; attendre les cinq jobs sur le dernier SHA avant fusion.


## Lot 4 — vrais modèles Meshy (branche feat/castor-real-meshy)
- Issue : #76, PR consacrée aux graphismes uniquement (en parallèle de la #80).
- Source : les trois tâches Meshy texturées ci-dessus, export GLB téléchargé pour conversion sur un runner GitHub Actions temporaire. Aucune URL Meshy expirante ne doit être conservée dans la PR finale.
- Cible : modules intégrés hors ligne, VRAM partagée, pivots séparés, tests source/UV/roues/tourelle. Conserver les textures et couleurs originales.
- Risques : orientation et roues doublées dans la coque à vérifier en jeu, FPS avec plusieurs Castor, absence de visualisation WebGL dans les contrôles automatisés.
- Suivi : tester `npm test`, format, docs et Docker build sur le commit final ; ne pas fermer l'issue.


## Correctif des roues (#76, capture utilisateur du 7 novembre)

- Observation en jeu : doubles roues géantes flottantes autour du Castor (le GLB du châssis possède déjà ses roues sculptées ; celles importées séparément avaient les pivots trop éloignés, et une échelle excessive).
- Correction ciblée `fix/castor-wheel-overlap` : filtrage au rendu des triangles des roues intégrées et réemploi des six vrais modèles de roue, centrés et mis à l'échelle, avec pivots animés.
- Test d'encombrement et de suppression de faces ajouté à `scripts/test-castor-meshy.mjs`.
- Restant : vérification visuelle de découpe, performances GPU, construction en roulant (PR #80 toujours distincte).


## Lot 3 — reprise de la PR #80 après les vrais Meshy et les roues corrigées

- Branche : `feat/castor-rolling-construction` ; la PR #80 conserve son numéro.
- Reprise depuis `main` après les PR #82 (vrais Meshy) et #85 (roues).
- Contributions : poser les murs LEGO/rubans en roulant en segments de 20 cm,
  utiliser les outils ponctuels à bord, vérifier le pilote et la distance côté
  serveur, empêcher les doubles facturations de messages réémis, maintenir la
  caisse commune et les collisions.
- Reprise ciblée : conserver `meshyShared` dans `client.js` pour ne pas détruire
  les ressources Meshy partagées ; conserver les modèles et roues corrigées.
- Tests : le script provisoire de diagnostic Prettier est retiré. Exécuter
  `test-castor-building.mjs` dans `npm test` ; suivre les cinq jobs GitHub
  Actions avant fusion. Les essais WebGL du ressenti restent indisponibles.
- **Restant après la PR** : réparation automatique des murs, munitions finies du
  pistolet et des DCA fixes, bunkers/canons/tourelles exclusifs.


## Lot 5 — réparation automatique des barricades (branche feat/castor-automatic-wall-repair)

- Issue #76 partiellement couverte : stations fixes et Castor ont le même service
  progressif et payant pour les barricades existantes à portée ; le budget est
  partagé équitablement avec les véhicules, sans facturation gratuite.
- Les segments détruits (0 PV) restent détruits, le pathfinding n'est pas recalculé
  si seul un segment encore debout est réparé. Aucun nouvel équipement n'est ajouté.
- Vérifications : nouveau test de domaine `test-castor-repair.mjs` dans `npm test`,
  CI Docker/build/format/docs et test de synchronisation serveur. Pas de test
  visuel WebGL/WAN dans l'environnement d'agent.
- Restant : limitation des munitions pistolets et DCA fixes, défenses exclusives
  (plans de cartes, bunkers occupables, canon antichar, tourelle automatique),
  visuel/FPS du Castor en situation et vérification humaine du placement.


## Lot 6 — stocks finis DCA fixes (PR dédiée)

- Branche : `feat/finite-fixed-dca-ammo`, référence #76.
- Chaque DCA est posée avec 120 obus ; tir serveur dédupliqué et cadencé, HUD
  munitions du poste et tir distant supprimé si stock épuisé.
- Le ravitaillement des DCA exige une station ou le Castor à portée et coûte
  1 $/10 obus avec répartition de la caisse entre tous les bénéficiaires.
- Tests : `test-fixed-dca-ammo.mjs` intégré à `npm test`, formats/docs/build
  et GitHub Actions Docker à vérifier. L'effet visuel d'un tir est immédiat ;
  un tir rejeté tardivement par le serveur peut avoir été aperçu localement.
- Restant : pistolets limités avec approvisionnement au sol et purgatoire,
  défenses exclusives (bunker, canon, tourelle automatique), essais WebGL/WAN.

- Première CI PR #87 : l'assemblage n'incluait pas encore le nouveau module navigateur `ground-ammo.js` et le formatage de l'expression de cadence du serveur échouait. Corrigés sur le commit suivant, puis CI complète à relancer.

- Dernier diagnostic CI : Prettier exigeait deux retours à la ligne dans `src/client.js` (HUD du canon et expression de tir). Appliquer ces deux corrections, supprimer le diagnostic temporaire et relancer les cinq contrôles sur le SHA final.


## Lot 7 — pistolet personnel fini

- Branche : `feat/castor-finite-pistol-ammo` ; PR dédiée à #76.
- Chaque incarnation reçoit 120 balles, frappes validées à partir d'un tir
  déjà accepté, un impact maximum par identifiant et coût unique par tir.
- Le client affiche les cartouches et attend la validation de la réserve avant
  d'émettre un impact ; le tracé visuel immédiat reste optimiste. Les stations et
  le Castor rechargent automatiquement, payant à 0,001 $/balle et sous la même
  répartition équitable que les autres installations.
- Purgatoire : réserve finie par incarnation, sans recharge à distance ; la
  paperasse reste accessible. Essai humain du ressenti non couvert.
- Vérifications attendues : tests ciblés + suite complète GitHub Actions,
  Docker build, format et docs, puis revue et fusion si tous verts.
- **Restant** : les trois défenses exclusives Castor et leurs cartes, modèles et
  contrôles, test manuel WebGL/UDP et FPS avec plusieurs Castor.

- Première CI PR #88 : test de combat RAM et de nuées utilisaient des impacts fictifs sans coup préalable ; conservés après ajout de reçus de tirs simulés via la vraie commande serveur. Diagnostic du pistolet mis à jour pour son caractère asynchrone. Formatage du serveur corrigé. Poursuivre par la CI complète et traiter les éventuels scénarios historiques équivalents.

- CI sur le commit de diagnostic : suite complète et test de synchronisation réseau passent. Une seule différence Prettier restait dans l'expression `position` de `server/game.js`; elle est corrigée et le diagnostic temporaire retiré. Vérifier les cinq jobs Actions et Docker sur le SHA final.
