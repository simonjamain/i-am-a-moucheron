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
