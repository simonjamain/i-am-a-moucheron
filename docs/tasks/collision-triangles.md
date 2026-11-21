# collision-triangles — décor collisionnant sur ses triangles

- Tâche / PR : demande de l'utilisateur (session « Cartoon Office Pack ») ; lot 1 en PR.
- Branche : `claude/tender-edison-l0y0if`.
- Résultat attendu : tout le jeu (tirs, pose, caméra, vol, marche, véhicules,
  fourmis, serveur) collisionne sur les triangles des modèles du pack ; seules les
  piles de feuilles et les boules de papier restent approximées ; la fente de
  sortie de la photocopieuse est libre. Référence : [collisions](../collisions.md).
- État réel :
  - Lot 1 fait : `collision-mesh.ts` (BVH, rayon, point le plus proche),
    `office-collision.ts` (`propMeshSolids`, `raycastSolid`, `nearestOnSolid`),
    `office.meshSolids`, fil de fer jaune en mode debug. Les boîtes restent les
    solides du jeu.
  - Lot 2 à faire : rendre `rayCollider` / `placement-aim.ts` sensibles aux solides
    maillés, puis remplacer les boîtes des objets par leurs solides maillés dans
    `colliders`. Consommateurs : `grep -n colliders src/client.js` (caméra 612,
    projectiles 4402, explosions 4280, visée 5762, eau 6718, pose 1745/5288/6404,
    largages `airdrop.ts`).
  - Lot 3 : vol (`flight` / atterrissage 4618, collisions 4662), marcheur
    (`stepWalker`), véhicules Rapier (`physics-world.ts` : trimesh au lieu de
    cuboïdes), effets de crash, suspension des chenilles (`track-suspension.ts`).
  - Lot 4 : navigation des fourmis (`ground-defense.js`, grille depuis la
    géométrie), serveur et workers (boîtes grossières ou triangles).
- Vérifications : `node scripts/test-collision-mesh.mjs`, `npm test`.
- Prochaine action : lot 2, `rayCollider` sur un `MeshSolid`.
