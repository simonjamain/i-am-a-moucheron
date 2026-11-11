# Chasseur et bombardier biplans — version 275

Deux modèles Meshy fournis par l'utilisateur remplacent le chasseur léger **M1** et le
bombardier **B3** comme avions de base du bureau. Les identifiants de jeu restent
`fighter` et `bomber` (stock de départ, boutique, achats) ; leurs noms deviennent
**M1 Chasseur biplan** et **B3 Bombardier biplan**. Le Stuka, le Spitfire et le H2
ne changent pas : ils dérivent de l'ancien chasseur léger conservé comme référence
(`LIGHT_FIGHTER` dans `src/fleet.js`).

## Modèles

| Avion             | Source                  | SHA-256                                                            | Triangles |
| ----------------- | ----------------------- | ------------------------------------------------------------------ | --------: |
| Chasseur biplan   | `chasseur_biplan.glb`   | `4ca14796ad8154a636dff5b2a7f9646dea2eb29ab8a49774e2d4c103429d228a` |     2 702 |
| Bombardier biplan | `bombardier_biplan.glb` | `62a9205e7fd834c30ce11e931da966f208fadc433859a3ebf12f7c587b3e8023` |     1 762 |

`scripts/import-meshy-vehicle.py biplane|biplanebomber SOURCE.glb` conserve chaque
triangle et les UV d'origine (atlas JPEG 1 024 px) et écrit
`src/meshy-biplane-data.js` et `src/meshy-biplane-bomber-data.js` ; `src/biplane-model.js`
construit les rigs. Les anciens fichiers `m1-model.js`, `b3-model.js` et leurs données
sont supprimés ([ancien M1](m1-model.md), [ancien B3](b3-model.md)).

- **Chasseur** : envergure 5,6 (10,4 m de référence), hélice articulée, **une**
  mitrailleuse centrale sculptée sur le capot devant le pilote ; son extrémité est
  l'unique canon du pilote (`pilotMuzzles`).
- **Bombardier** : une seule hélice de nez, pilote et **un** mitrailleur arrière dont
  l'arme (îlots 12, 14, 23) pivote sur son anneau (lacet) puis s'élève, arme tournée
  vers l'arrière au repos ; le muzzle est sur l'axe du canon passant par le pivot.
  Envergure 11,3 (21 m), longueur 8,55 (15,9 m).

## Chasseur biplan — règles

- **25 % moins rapide** que le chasseur léger : vitesse maximale 52,5 (au lieu de 70)
  et poussée 7,4 ; la vitesse de palier mesurée (38 contre 50,5) vaut 0,756 fois celle
  de l'ancien chasseur.
- **Décroche moins facilement** à basse vitesse : autorité des commandes pleine dès 8
  (13 avant, `authoritySpeed`), portance de base 0,0056 (0,0032) et angle de décrochage
  0,45 rad (0,30, `stallAngle`) ; la vitesse minimale de vol en palier baisse d'environ
  un cinquième. Ces trois réglages sont des champs optionnels du profil de vol
  (`src/flight.js`), sans effet sur les autres avions.
- **Une mitrailleuse centrale** qui tire comme _une seule_ des deux mitrailleuses du
  chasseur léger : un coup toutes les 0,12 s au lieu de 0,06 s (`gunIntervalFactor: 2`,
  `pilotFireInterval`), soit **deux fois moins de DPS** ; même dégât par balle (75).
  La réserve reste d'une minute de tir : 500 balles (1 000 avant).

## Bombardier biplan — règles

- **Deux postes** : pilote et mitrailleur (poste « dorsal », qui regarde vers l'arrière
  au début). Plus de postes de queue ni ventral sur cet avion.
- **30 bombes** en soute (50 avant), **une toutes les secondes** au lieu de 0,5 s
  (`heavyInterval('bomb', 'bomber')`) ; la grille du Stuka (6 bombes, 0,5 s) est
  inchangée.
- Autres caractéristiques identiques au B3 : vitesse maximale 52,5, poussée 8, traînée,
  portance, virage, 100 PV, prix 16 $. Le pilote n'a toujours pas de mitrailleuse.

## Vérifications

`scripts/test-biplane-models.mjs` (modèles, contact au sol, rapports de vitesse et de
décrochage, canon unique, cadence, bombes), `test-meshy-vehicles.mjs` (SHA, triangles,
mitrailleur arrière, hélice), `test-b3-crew.mjs` et `test-fleet-scale.mjs` (deux postes),
`test-clean-flight.mjs` (30 bombes à 1 s) et `test-muzzle-alignment.mjs`. Aperçu 3D vérifié
hors partie ; le confort de pilotage et du tir arrière reste à essayer en partie.
