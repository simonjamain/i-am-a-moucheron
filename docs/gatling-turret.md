# Tourelle automatique Gatling

La Gatling est l'**amélioration** de la tourelle automatique [T-01](models.md#tourelle-t-01) : elle
ne s'achète pas (ni à la roue d'outils du Castor, ni par largage du Castor volant) et
s'obtient en refondant une T-01 posée. Même comportement que la T-01 : elle tire sur
l'ennemi le plus proche à portée, se répare et se recharge aux sources de service
payantes ([logistique](logistics-contracts.md)).

## Amélioration

Un joueur à pied qui vise une T-01 à portée voit la tourelle cernée du bleu
d'interaction des postes ; un clic gauche ouvre l'**ordre de refonte** (`src/upgrade-ui.ts`),
un document papier : une case par variante de l'arbre, jamais cochée d'office, puis la
signature, verrouillée tant qu'aucune case n'est cochée. Sans assez d'argent dans la
caisse commune, le tampon « REFUSÉ » s'affiche et rien n'est envoyé. La portée est celle
des postes de véhicules (demi-taille de la tourelle + `POST_REACH`, `upgradeInReach`) ;
tous les joueurs peuvent améliorer.

Le serveur (`groundCommand`, action `upgrade`) change le type pour la variante choisie,
débite son prix (25 $ pour la Gatling), **répare** la tourelle et **remplit** ses
munitions au maximum de la variante. Une tourelle au dernier stade n'est plus cernée ni
interactive. L'arbre vit dans `TURRET_UPGRADES` (`src/ground-sentry.ts`) ; seules les
racines (`BUYABLE_TURRETS`) sont vendues. Ajouter une variante : l'inscrire dans l'arbre
et ajouter son type de tourelle, le formulaire suit.

## Règles

| Valeur            | Gatling (`GATLING`) | T-01 (`SENTRY`)    |
| ----------------- | ------------------- | ------------------ |
| Prix              | 25 $ (refonte)      | 5 $                |
| Points de vie     | 150                 | 150                |
| Dégâts par tir    | 30                  | 60                 |
| Cadence           | 12 tirs par seconde | 2 tirs par seconde |
| Munitions         | 1 000 (≈ 83 s)      | 180                |
| Portée            | 0,42 m              | 0,42 m             |
| Empreinte de pose | 2 cm                | 2 cm               |

Le plafond de **12 tourelles par salle** est partagé entre les deux types ; recharge et
réparation utilisent la capacité de chaque type (`turretSpec`).

## Cadence et réseau

Le serveur avance une salle toutes les 250 ms (et à chaque commande) alors qu'un tir
Gatling revient toutes les 83,3 ms. `fireGroundSentries` tient un **calendrier exact** :
un tick peut porter jusqu'à trois tirs, sans dérive ; une tourelle inactive depuis plus
de 500 ms reprend par un seul tir, sans rafale de rattrapage. Une cible abattue n'est
pas touchée une seconde fois dans le même tick.

Le serveur publie **un effet `sentry-shot` par tourelle et par tick**, avec
`turret: 'gatling'` et `shots` (1 à 3) ; la T-01 garde un effet par tir. Le client étale
les tirs à la cadence de l'arme (`noteGatlingBurst` / `takeGatlingShots`,
`src/ground-defense-ui.js`, au plus deux par image) : un traceur et un éclair par tir,
depuis le canon du haut du faisceau, sans son par tir.

## Son continu

Une boucle de 1 s sans couture (douze impulsions, `gatling` dans
`src/game-audio/synth.ts`) joue pendant le feu ; sa hauteur et sa cadence suivent la
vitesse du faisceau. Seules les trois Gatling les plus proches de l'auditeur ont une
voix (`gatlingSounds`). Voir [audio](audio.md).

## Modèle Meshy et animation

Source : export Meshy « Sentinel Sentry » (`Meshy_AI_Sentinel_Sentry_1121103608_texture.glb`,
SHA-256 `a2a4e7eb9b42aed070b12c1a004ef4b998275b205c033f451f8dda9b39c07920`,
1 948 triangles, atlas 2 048 × 2 048), monobloc et non versionné (le script contrôle son
empreinte). `scripts/import-meshy-gatling.py` le sépare par composantes connexes, sans
toucher aux UV, en quatre pièces rigides partageant un atlas WebP 1 024 × 1 024
(`src/meshy-gatling-data.ts`) ; aucune réduction de maillage (rien de sûr à gagner sous
2 000 triangles, voir le [pipeline d'assets](asset-pipeline.md)).

```sh
python3 scripts/import-meshy-gatling.py --source Meshy_AI_Sentinel_Sentry_1121103608_texture.glb --output src
```

| Pièce    | Triangles | Rôle                                                          |
| -------- | --------: | ------------------------------------------------------------- |
| `socle`  |       590 | trépied et couronne, fixes                                    |
| `tete`   |       896 | boîtier, radar, caisse et bande de munitions                  |
| `anneau` |        80 | base circulaire du faisceau : suit l'élévation, ne tourne pas |
| `rotor`  |       382 | les six canons et leurs colliers : seule pièce qui tourne     |

L'original incline le faisceau d'environ 2,25° : l'import ajuste l'axe sur les six
canons et le redresse sur l'horizontale avant de le poser sur son pivot (centre de
l'ouverture du boîtier), pour que les canons ne « nagent » pas en tournant. Pivot et
bouches sont enregistrés dans les données.

**Hiérarchie** (`src/gatling-model.ts`) : `socle` fixe → `lacet` → `elevation-canon`
(pivot horizontal au sommet de la couronne, sur l'axe de lacet), qui porte toute la
partie supérieure : la tête et `ensemble-canons` (`anneau-faisceau`, puis
`rotation-barillet` avec `faisceau-canons` et les six bouches). Le recul ne déplace que
`ensemble-canons`.

- Échelle `GATLING_SCALE = 0,021` : 16 mm de haut, canons de 8 mm.
- Élévation de −10° à +45° (`GATLING_MIN_ELEVATION`, `GATLING_MAX_ELEVATION`) ; au-delà,
  la tête entrerait dans le socle, la tourelle reste à 45° et le traceur part tout de
  même de la bouche vers la cible réelle.
- Le faisceau tourne à 2 tours/s à plein régime (un tir par canon et par tour), monte en
  régime en 0,35 s et ralentit en 1,1 s après le dernier tir (`stepGatlingSpin`). Il ne
  tourne que lorsque des tirs partent.

## Vérifier

- `npm test -- gatling` : valeurs, plafond partagé, 120 tirs en 10 s au tick de 250 ms,
  cible abattue, munitions, recharge, absence d'achat et de largage, effets du tick,
  hiérarchie du modèle, atlas partagé, symétrie du faisceau, inertie, tirs étalés, voix
  et raccord de la boucle.
- `npm test -- turret-upgrade` : ordre de refonte, portée, prix, réparation et munitions.

Restent à juger en partie réelle : lisibilité du faisceau en rotation, confort du son
avec plusieurs Gatling et coût de 12 Gatling (144 traceurs par seconde dans le plafond
de 256).
