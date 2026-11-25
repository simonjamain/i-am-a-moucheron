# Confiance envers les clients

**Règle pérenne : on fait confiance aux joueurs.** i am a moucheron est un jeu coopératif sans enjeu :
aucun code ne cherche à détecter, empêcher ou limiter la triche d'un client. La règle figure
aussi dans `AGENTS.md`.

## Ce que cela veut dire

- Le client est autoritaire sur ce qu'il simule : positions, vitesses, visées, tirs, impacts et
  dégâts déclarés (voir [autorité et corps partagés](walking-network.md) et [combat et mondes](combat-worlds.md)).
- Le serveur **n'ajoute pas** de contrôle de plausibilité : pas de butée d'élévation d'un canon, pas
  de cadence minimale entre deux tirs, pas de plafond sur les dégâts d'un impact, pas de limite de vitesse ou de saut de position.
- Le client garde ses butées et ses délais pour le confort de jeu (visée, rechargement affiché),
  pas pour se défendre d'un autre client.

## Ce que le serveur garde

Ces contrôles ne visent pas un tricheur ; ils gardent la partie cohérente et la salle en vie :

- **Pose d'équipement** : le serveur n'en juge pas le support ni la portée ; le joueur pose où il veut
  (aperçu et test côté navigateur, `supportedPlacement`). Il garde la limite de 24 installations.
- **Règles de jeu partagées** : sièges et occupation, stocks et munitions (un tir en consomme),
  argent, contrats, signatures, tarifs, ordre des documents, proximité requise pour monter à
  bord ou s'asseoir.
- **Robustesse des entrées** : types, nombres finis (pas de `NaN`), longueurs bornées, identifiants
  de tir présents, idempotence (un même tir ou un même impact ne compte qu'une fois : un réseau
  qui rejoue une commande ne doit pas la doubler), éléments inconnus ignorés.
- **Protection de la salle** : limites de taille des registres et débit maximal de commandes
  (statut 429), contre l'emballement ou un bogue, pas contre la triche.
- **Autorité de propriété** : seul le tireur déclare l'impact de son obus, pour que deux clients ne
  se contredisent pas.

## Quand on ajoute du code

- Ne pas écrire de validation dont la seule raison est qu'« un client pourrait mentir ».
- Une vérification de cohérence entre états partagés reste légitime : la justifier par la
  cohérence (deux joueurs, un siège), pas par la triche.
- Face à un doute, appliquer la règle : faire confiance, et le consigner ici si c'est durable.
