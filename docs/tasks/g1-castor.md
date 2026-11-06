# G1 Castor — issue #76

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

## Lot 3 — construction embarquée
- Branche : `feat/castor-rolling-construction`, issue #76 partiellement couverte.
- Ajouts : construction dans le Castor (pilotage toujours disponible), tracé automatique de segments derrière la roue arrière lorsque le camion roule, possibilité de poser sucre, ventilateur, réparer et supprimer depuis la caméra ; vérification serveur du pilote, distance, sol et budget ; jetons de pose dédupliqués. Échec et déconnexion interrompent la pose.
- Limites : cette pose est encore prototype : segment de 7,5 à 10 cm / 1 $ ; pas de bonus de vitesse ni de défenses exclusives pour le moment. Pas de test de ressenti WebGL/WAN ni intégration des GLB Meshy.
- À vérifier : `scripts/test-castor-building.mjs`, suite complète, format, documentation, artefact, Docker build GitHub Actions, puis essai de jeu humain.
