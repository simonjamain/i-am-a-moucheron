# Exploitation, livraison et vérifications

## Déployer les sources courantes

La livraison habituelle est un **ZIP des sources**, sans `node_modules`, données
de partie, image Docker ni métadonnées Git. Extraire puis utiliser Node 22.13+ :

```sh
npm ci
npm start
```

Le serveur Node garde toutes les salles en RAM ; un redémarrage efface les parties.
HTTP sert les assets, `/healthz` et la négociation WebRTC. Le gameplay utilise UDP
uniquement ; les anciennes routes HTTP renvoient 410. HTTPS, IP annoncée, pare-feu
et plage UDP sont détaillés dans [serveur UDP](udp-server.md). L’utilisateur
installe sur sa VM ; les agents ne provisionnent pas de serveur externe.
Le [Dockerfile](../Dockerfile) reste une option de construction personnelle.
Les archives Docker `.1` et `.2` sont historiques, antérieures aux retours terrain.

## Sources et Site historique

Identité conservée : `appgprj_6ae1e591360481919010bdf89f8da3f0`, déclarée dans
`.openai/hosting.json`. Audience publique conservée. Le dépôt se rouvre avec le
skill Sites et son helper courant ; `/workspace/sites/moucheron-flight` est un
chemin de cette session, pas une convention pour tous les agents.

Le Site public Worker/D1 reste distinct du runtime Node/UDP. Les nouvelles
commandes d’armes lourdes, banque, lits, impacts de chute, bons prépayés et nettoyage ciblent Node. **Ne pas
publier leur client sur le Worker**, qui ne possède pas ces opérations. Les
sources sont poussées au dépôt, puis livrées en ZIP. Une installation sur VM
n’est pas revendiquée sans accès et résultat vérifiés. La publication historique
et les tests D1 restent disponibles pour compatibilité avec les versions précédentes.

## Assemblage et contrôles

Modifier `src/`, `server/`, `scripts/` et les documents de référence. L’assembleur
produit `worker/assets.js` pour Node, le Worker historique et l’aperçu des vrais
composants `/ui-review.html` sur données de démonstration. Les modules navigateur
ont des URL fondées sur leur contenu. Les migrations `drizzle/` déjà publiées
restent immuables ; Node ne les charge pas.

```sh
npm run format:check
npm test
npm run check:docs
npm run build
node scripts/validate-artifact.mjs
```

Le build/validateur ESM vérifie le paquet Worker historique, pas un déploiement Node.
La suite complète inclut les tests de règles Node, physique, signatures, assets,
interface et les deux clients natifs UDP. Les tests Worker utilisent SQLite pour
la compatibilité historique ; cette dépendance n’est pas dans le serveur Node.
`AGENTS.md` exige une revue sémantique finale des Markdown en plus du contrôle
mécanique des liens. La [revue du 29 octobre 2026](archive/reference-audit-2026-10-29.md)
reste une trace historique, pas une seconde référence métier.

## Vérification navigateur et limites

Selon le changement : entrer/signer chaque poste, deux joueurs sur des sièges
différents, achats, tirs, sortie, chute, purgatoires, lit personnel et repli au
départ. Distinguer les contrôles de domaine des interactions humaines réellement
exécutées. L’aperçu utilise les vrais composants HUD, banque et lit avec des
contrats et une caisse jetables ; il n’est pas une partie multijoueur.

Le navigateur de contrôle ne crée pas de contexte WebGL et ne confirme pas une
partie UDP sur son réseau. Le chargement du client et les panneaux sont testables,
ainsi que la géométrie Three.js sans GPU. Les images comparatives des modèles
sont des projections CPU des triangles. Pointer Lock, confort du pilotage,
tactile physique, écoute, charge maximale et WAN restent à vérifier sur la VM.
La capacité configurée (100 joueurs) ne prouve pas des performances à cette charge ;
la cible de jeu reste un petit groupe de 5–10 joueurs.

## Référence métier du lot courant

[Retours terrain](field-update.md) : causes d’embarquement, mesure avant/après de E,
visée, chute, lits, résurrection, lunette et prêts. Les résultats mesurés avec un
retard de réponse injecté ne sont pas des mesures de latence réseau réelle.
Le ZIP final contient tous les fichiers nécessaires à `npm ci && npm start`,
les tests, le backlog et les références à jour.

Dernier lot : [lisibilité et nettoyage](clean-flight.md), incluant le Spitfire.
Recharger tous les navigateurs après installation du nouveau ZIP ; le serveur
Node conserve ses assets assemblés au démarrage et doit être redémarré après modification.

Lot courant : [retours multijoueurs](multiplayer-return.md). Les mesures CPU
comparatives sont reproductibles avec `node scripts/review-return-performance.mjs`
dans un clone Git contenant le commit de référence. Le ZIP permet de jouer sans
Git ; les benchmarks historiques demandent leur référence Git.

## Lot véhicules d’appui

[Hélicoptère et DCA mobile](support-vehicles.md) : code livré en ZIP, contrôles
locaux et deux pairs UDP vérifiés. HEL-06/DCM-03 restent en cours pour les essais
humains WebGL/WAN. Le navigateur de contrôle charge le client mais refuse UDP ;
les quatre HUD sont également consultables dans l’aperçu sans réseau.
`test-support-vehicles.mjs` fait partie de `npm test`. Les sources du Site restent
synchronisées au dépôt, sans publier le client Node sur le Worker historique.

Le [lot confort de jeu, version 37](comfort.md) précise réparation, zoom, jauges,
radar à pied, remise à zéro, fourmis et projectiles du pistolet courants.
