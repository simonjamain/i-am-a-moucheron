# Revue des références

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
