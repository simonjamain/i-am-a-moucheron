# Revue des références — lot retours terrain

Revue du 29 octobre 2026, effectuée après implémentation des onze tâches BUG-04 à
ECO-02. Les Markdown ci-dessous ont été inventoriés et confrontés au code ou à
leur périmètre historique. Le contrôle `npm run check:docs` vérifie leurs liens
locaux ; il complète la revue sémantique et ne la remplace pas.

## Point d’entrée et méthode

- [AGENTS](../AGENTS.md) : exécution continue conservée, revue finale exhaustive
  des Markdown ajoutée comme critère de livraison, commande de contrôle des liens.
- [README](../README.md) : ZIP des sources, runtime Node/UDP et référence du lot.
- [Accueil ChatGPT](../CHATGPT-PROJECT.md) : ancien résumé Worker/HTTP remplacé par
  Node/RAM/UDP et distinction claire de la publication historique.
- [Backlog](../BACKLOG.md) : onze états et suivi des causes, tests et limites.
- [Recherche réseau](../NETWORK-RESEARCH.md) : relue comme recherche datée, conserve
  explicitement son avertissement et ses liens vers l’architecture courante.

## Architecture, exécution et fonctionnalités

- [Carte du code](code-structure.md) et [exploitation](operations.md) : réécrites
  pour présenter d’abord le runtime réel, ses modules et le parcours court de reprise.
- [Gameplay](gameplay.md) : minute de préparation, visée, chute, lits et prêts.
- [Contrôles](controls.md) : lit personnel et observation C du tank.
- [Réseau des corps](walking-network.md) : incarnation, corps recréé et anciennes
  descriptions HTTP explicitement limitées à la compatibilité historique.
- [Serveur UDP](udp-server.md) : livraison source courante, Docker optionnel,
  garanties et limites de transport conservées.
- [Échelle et flotte](scale-fleet-weapons.md) : gravité du personnage séparée du
  vol, anciens 60 km/h uniformes retirés, préparation Node de 60 s.
- [Nuées et équipements](swarm-equipment.md) : sortie du seul occupant, durée de
  vague issue du trajet ; ancien texte d’éjection générale corrigé.
- [Économie et physique](economy-physics.md) : achats actuels, navigation statique,
  anciennes constantes de chute signalées comme remplacées pour le personnage.
- [Combat et mondes](combat-worlds.md) : autorité Node en RAM, noms SQL historiques,
  lien vers dégâts d’impact et destination de résurrection.
- [File des purgatoires](purgatory-queue.md) : simulation Node sans humain au tick,
  Worker historique sur requêtes ; règles de file conservées.
- [Progression](progression.md) : minute entre vagues, lits et persistance RAM.
- [Retours de partie précédents](party-feedback.md) : première vague d’environ
  une minute et diagnostic désormais corrigé.
- [Pistolet](pistol-diagnosis.md) : état ARM-02 actuel et tests ; ancienne demande
  « ne pas corriger » déplacée dans une archive identifiée.
- [Logistique](logistics-contracts.md) : lits ajoutés, références de compatibilité
  Worker conservées avec leur avertissement de runtime.
- [Véhicules et banque](vehicles-bank.md) : taux 10–20 %, lien vers lunette et lits,
  ancien paquet `.2` et capture à faibles taux identifiés comme historiques.
- [Retours terrain](field-update.md) : référence détaillée du lot, mesures et limites.
- [Docker](docker.md) : archive `.2` explicitement historique ; construction depuis
  sources possible, aucune nouvelle image produite par défaut.
- Le présent inventaire reste la trace de cette revue, pas un second catalogue
  de règles métier ; les détails continuent d’avoir une référence unique.

## Archives identifiées

[Prototype initial](archive/design-notes.md), [anciennes sorties](archive/sorties.md)
et [diagnostic avant ARM-02](archive/pistol-before-arm02.md) portent chacun un
avertissement et un lien de reprise. Leurs anciennes valeurs ne sont pas des règles
actuelles. Les entrées passées du backlog restent un journal daté, avec suivi final
levant les anciennes attentes de validation.

## Validation et limites

Contrôle des liens, format, suite complète et validation du paquet ESM. Les
modules de jeu et les tests natifs sont distingués des anciens tests Worker.
Les composants HUD/contrat de lit ont été exercés au navigateur sur des données
jetables ; [comparaison des modèles](models-before-after.png) par projection CPU.
Les mesures de réponse injectée ne sont pas des mesures WAN. Le navigateur de
contrôle ne permet pas la validation WebGL ; confort de visée, tactile physique,
écoute et jeu sur Internet restent à vérifier sur la VM.

Le fichier d’accueil joint au projet ChatGPT est remis à jour séparément pour
éviter qu’un agent reprenne l’ancien résumé Worker/D1 comme stack courante.
Le dépôt reste la référence pour les prochaines modifications.
