# Revue des références

## Lot retours multijoueurs, HUD et déploiement au sol

Revue du 29 octobre 2026 après les 14 tâches MORT-01 à RAD-02 : **31 Markdown**
inventoriés, confrontés à leurs sources ou à leur périmètre historique.

- `AGENTS.md` : consignes d’exécution et revue finale relues, conservées.
- `README.md`, `docs/gameplay.md`, `docs/code-structure.md`, `docs/operations.md` :
  référence de reprise actualisée, nouveaux modules, règles et limites de tests.
- `BACKLOG.md` : 14 états terminés, prix choisis, causes reproduites et mesures ;
  radar renommé RAD-02 pour ne pas doubler RAD-01 de l’ancien lot.
- `docs/multiplayer-return.md` : référence détaillée nouvelle, 90 chemins et
  comparaison CPU reproductibles, distinction explicite des limites GPU/WAN.
- `docs/field-update.md`, `docs/scale-fleet-weapons.md`, `docs/economy-physics.md`,
  `docs/walking-network.md` : ancienne gravité du personnage retirée des règles
  courantes ou identifiée comme remplacée par CHU-02 ; déduplication conservée.
- `docs/clean-flight.md`, `docs/vehicles-bank.md`, `docs/logistics-contracts.md` :
  stock 1 000 balles et salves partielles, véhicules achetés à poser, réserve
  renouvelée au décollage, radar cylindrique et bombes spécifiques du B3.
- `docs/controls.md` : aide permanente, observation, entrée volontaire et regard
  presque vertical ; anciennes touches B et pistolet/Espace non réintroduites.
- `docs/combat-worlds.md`, `docs/purgatory-queue.md`, `docs/pistol-diagnosis.md` :
  état sans corps avant l’âme et nouvelle cause visuelle du tir arrière.
- `docs/progression.md`, `docs/swarm-equipment.md`, `docs/party-feedback.md` :
  six moucherons/deux fourmis, longues approches, taille 2,025 et tolérance 1,2.
- `CHATGPT-PROJECT.md` : gravité miniature corrigée aussi dans le fichier d’accueil
  pour éviter une reprise sur l’ancienne décision ; parcours d’accès inchangé.
- `docs/udp-server.md` et `docs/docker.md` : transport, ports et procédure de
  construction inchangés ; le dernier lot se livre toujours en ZIP, sans nouveau
  binaire Docker ni publication du client Node sur le Worker.
- `NETWORK-RESEARCH.md` et les cinq documents de `docs/archive/` : contexte daté
  et avertissements conservés ; les liens pointent vers les références actives.
- Le présent audit garde ci-dessous les traces des deux lots précédents.

Contrôles : format, liens, suite complète, deux pairs natifs UDP, compilation et
validateur ESM. Le navigateur a chargé le client et vérifié aide, compteurs et
bouton d’observation sur données jetables ; [capture du HUD](ui-return-hud.jpg). WebGL est indisponible ; les figures
sont des projections CPU ou des chemins calculés, sans prétention de capture 3D.
Les mesures synthétiques ne sont pas des tests WAN ni de trois navigateurs réels.

## Lot lisibilité, commandes, nettoyage et Spitfire

Revue du 29 octobre 2026 après ECO-03 à VEH-05 : **30 Markdown** inventoriés.
Le nouveau [guide du lot](clean-flight.md) contient les règles uniques, choix non
fixés, tests et limites. Les commandes et quantités des documents actifs ont été
confrontées aux modules actuels ; les historiques sont distingués.

- `AGENTS.md` : règles relues, revue exhaustive et livraison ZIP maintenues.
- `README.md`, `docs/gameplay.md`, `docs/code-structure.md`, `docs/operations.md` :
  nouvelle reprise courte, modules et guide du lot ajoutés ; Node/RAM/UDP conservé.
- `BACKLOG.md` : onze états terminés et suivi vérifications/limites ; l’ID nettoyage
  est devenu NET-02 pour éviter le doublon NET-01 du transport historique.
- `docs/controls.md`, `docs/vehicles-bank.md` : anciennes commandes B/Espace du
  canon et bombes remplacées, 50 bombes et intervalle 0,5 s corrigés.
- `docs/logistics-contracts.md`, `docs/progression.md`, `docs/economy-physics.md` :
  bon payé avant pose, commandes en attente dans prix/limite, Spitfire ajouté.
- `docs/swarm-equipment.md`, `docs/scale-fleet-weapons.md` : couleurs de provenance,
  collision unique, unités du jet et tick Node distingué du Worker historique.
- `docs/combat-worlds.md`, `docs/pistol-diagnosis.md`, `docs/purgatory-queue.md`,
  `docs/party-feedback.md`, `docs/field-update.md` : règles antérieures conservées,
  renvois au nouveau lot lorsque commandes/effets évoluent ; dégâts du pistolet,
  file, résurrection et lit restent conformes.
- `docs/walking-network.md`, `docs/udp-server.md` : ram/UDP et physique déclarative
  inchangés ; commandes de nettoyage bornées et effets décoratifs dans le nouveau guide.
- `CHATGPT-PROJECT.md` : accès et stack toujours exacts, aucune copie métier à
  réécrire. `NETWORK-RESEARCH.md` et les cinq fichiers `docs/archive/` gardent
  leurs avertissements historiques. `docs/docker.md` décrit désormais la construction locale ; l’ancien binaire
  a son guide archivé. Aucun nouveau binaire Docker n’est livré.
- Nouveau `docs/clean-flight.md` : référence courante du dernier lot.

Vérifications : liens locaux, formatage, tests complets et deux pairs natifs UDP.
Le bon et sa signature ont été exercés dans le navigateur avec données jetables ;
[vue du bon](ui-purchase-contract.jpg). Le contrôle a révélé l’absence de
`crypto.randomUUID` en HTTP de démonstration, corrigée par le même repli local que
les autres bons ; le jeu distant reste sur HTTPS. Le navigateur n’offre pas WebGL :
la visibilité 3D, l’écoute, le tactile physique, la charge et le WAN ne sont pas
revendiqués. Le Site historique n’est pas redéployé avec ce client Node.

## Intégration documentaire concurrente

Avant livraison, le dépôt a reçu une mise à jour documentaire : ancien guide
Docker déplacé vers `docs/archive/docker-package-2026-10-29.md`, guide actif
réécrit pour construction locale, ancien audit archivé dans
[la revue retours terrain](archive/reference-audit-2026-10-29.md). Ces deux archives
ont été relues avec leurs avertissements et liens corrigés. La fusion conserve
ces changements et le présent audit distinct du nouveau lot. Aucun code de
l’autre chat n’a été remplacé.
