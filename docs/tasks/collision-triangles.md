# collision-triangles — décor collisionnant sur ses triangles

- Tâche / PR : demande de l'utilisateur (session « Cartoon Office Pack ») ; lot 1 en PR.
- Branche : `claude/tender-edison-l0y0if`.
- Résultat attendu : tout le jeu (tirs, pose, caméra, vol, marche, véhicules,
  fourmis, serveur) collisionne sur les triangles des modèles du pack ; seules les
  piles de feuilles et les boules de papier restent approximées ; la fente de
  sortie de la photocopieuse est libre. Référence : [collisions](../collisions.md).
- État réel :
  - Décision : Rapier porte le décor (pas de BVH maison) ; physique côté client
    seulement (l'utilisateur : Rapier sous Node reste possible plus tard).
  - Lot 1 fait : `office-collision.ts` (`DecorCollision` : monde Rapier, un trimesh
    par objet, `raycast`, `nearest`), `office.buildDecor(RAPIER)` /
    `office.decor` / `office.decorWire`, fil de fer jaune en mode debug. Les boîtes
    restent les solides du jeu.
  - Lot 2a fait (v408) : `solidRayDistance` (client) pour tirs, explosions,
    caméra, visée hélicoptère, jet d'eau ; boîtes des objets marquées `decor`.
  - Lot 2b fait (v409) : pose d'équipement par le joueur (`DecorSupport`,
    `decorTrust`, `aimPlacement`). Restent sur les boîtes jusqu'au lot 4, car
    calculés par le serveur seul : largages (`airdrop.ts`), livraisons
    (`delivery.ts`), lits (`beds.ts`), constructions du Castor (visée client.js
    `aim`, `groundCommand`).
  - Lot 3 fait (v410) : vol (`sweptHitsDecor`, `resolveLanding` avec `decor`),
    marcheur (`stepWalker` avec `decor`), appareils sans pilote, véhicules Rapier
    (`PhysicsWorld.useDecor`). Restent visuels sur boîtes : `crash-effects.ts`,
    `track-suspension.ts`. Ressenti en vol non validé par un humain.
  - Lot 4 : navigation des fourmis (`ground-defense.ts`, grille depuis la
    géométrie), serveur et workers (boîtes grossières ou triangles).
- Vérifications : `node scripts/test-collision-mesh.mjs`, `npm test`.
- Prochaine action : lot 4, serveur (largages, livraisons, lits, Castor) et navigation des fourmis sur la géométrie.
