# Tourelle automatique Gatling

Deuxième tourelle automatique, **amélioration** de la [T-01](t01-asset.md) : elle ne
s'achète plus (ni roue d'outils, ni largage du Castor volant) et s'obtient en
refondant une T-01 déjà posée ([Amélioration](#amélioration)). Comportement identique
à la T-01 : elle tire sur l'ennemi le plus proche dans sa portée, se répare et se
recharge aux zones de service.

## Amélioration

Un joueur à pied qui vise une T-01 à portée voit la tourelle cernée du bleu d'interaction
(le contour des postes de véhicules) ; un clic gauche ouvre l'**ordre de refonte**, un
document papier comme les autres : une case par variante de l'arbre, jamais cochée
d'office, puis la signature. La case peut être décochée, la signature reste verrouillée
tant qu'aucune n'est cochée. Signer sans assez d'argent dans la caisse commune donne le
tampon « REFUSÉ » et rien n'est envoyé. La portée est celle des postes de véhicules
(demi-taille de la tourelle + `POST_REACH`, `upgradeInReach`) ; tous les joueurs peuvent
améliorer.

Le serveur (`groundCommand`, action `upgrade`) change le type pour la variante demandée,
débite le **prix de la variante** (25 $ pour la Gatling), **répare** la tourelle et
**remplit ses munitions** au maximum de la variante. Une tourelle au dernier stade (ni
variante restante) n'est plus ni cernée ni interactive. L'arbre vit dans
`TURRET_UPGRADES` (`src/ground-sentry.ts`) : ajouter une variante, c'est l'y inscrire et
ajouter son type de tourelle, le formulaire s'adapte.

## Règles

| Valeur            | Gatling             | T-01 (pour mémoire) |
| ----------------- | ------------------- | ------------------- |
| Prix              | 25 $                | 5 $                 |
| Points de vie     | 150                 | 150                 |
| Dégâts par tir    | 30                  | 60                  |
| Cadence           | 12 tirs par seconde | 2 tirs par seconde  |
| Munitions         | 1 000               | 180                 |
| Portée            | 0,42 m (identique)  | 0,42 m              |
| Empreinte de pose | 2 cm (identique)    | 2 cm                |

À 12 tirs par seconde, les 1 000 munitions durent environ 83 s de feu continu. Les valeurs vivent dans `GATLING` (`src/ground-sentry.ts`). Le plafond de
**12 tourelles par salle** est partagé entre les deux types ; la recharge payante
et la réparation utilisent la capacité de chaque type (`turretSpec`).

## Cadence et réseau

Le serveur avance une salle toutes les 250 ms (et à chaque commande) alors qu'un
tir Gatling revient toutes les 83,3 ms. `fireGroundSentries` tient donc un
**calendrier exact** : un tick peut devoir jusqu'à trois tirs, la dérive ne s'accumule
pas, et une tourelle restée inactive plus de 500 ms recommence par un seul tir
(jamais de rafale de rattrapage). Une cible abattue au premier tir n'est pas
touchée une seconde fois dans le même tick. Les 10 s de feu continu donnent
120 tirs (`scripts/test-gatling.mjs`).

Pour ne pas multiplier les messages, le serveur publie **un effet `sentry-shot`
par tourelle et par tick** avec `turret: 'gatling'` et `shots` (1 à 3). La T-01
garde son effet par tir. Le client étale les tirs d'un effet à la cadence de l'arme
(`noteGatlingBurst` / `takeGatlingShots`, au plus deux par image) : un traceur et
un éclair par tir, chacun depuis le canon du haut du faisceau, **sans son par tir**.

## Son continu

Un tir isolé n'a plus de son. Une **boucle de 1 s** (douze impulsions, raccord sans
couture, `gatling` dans `src/game-audio/synth.ts`) joue pendant tout le feu, dans l'espace du
Castor : sa hauteur et sa cadence suivent la vitesse du faisceau (montée en
régime, puis arrêt avec la fin du feu). Seules les trois Gatling les plus proches
de l'auditeur ont une voix, ce qui borne les boucles simultanées.

## Modèle Meshy et animation

Source : export Meshy « Sentinel Sentry » (`Meshy_AI_Sentinel_Sentry_1121103608_texture.glb`,
SHA-256 `a2a4e7eb9b42aed070b12c1a004ef4b998275b205c033f451f8dda9b39c07920`,
1 948 triangles, 2 510 sommets, atlas 2 048 × 2 048). L'original est **monobloc** :
il n'est pas versionné dans Git (le script contrôle son SHA).

`scripts/import-meshy-gatling.py` le sépare, par composantes connexes et **sans
toucher aux UV**, en quatre pièces rigides qui partagent un seul atlas WebP 1 024 × 1 024 :

| Pièce    | Triangles | Rôle                                                                                                  |
| -------- | --------: | ----------------------------------------------------------------------------------------------------- |
| `socle`  |       590 | Trépied et couronne, fixes.                                                                           |
| `tete`   |       896 | Tête en lacet : boîtier, radar, caisse et bande de munitions.                                         |
| `anneau` |        80 | Base circulaire du faisceau (plaque arrière, rebord) : suit l'élévation, ne tourne pas sur elle-même. |
| `rotor`  |       382 | Les six canons et leurs deux colliers : seule pièce qui tourne.                                       |

Total 1 948 (590 + 896 + 382 + 80) : aucun triangle perdu. Aucune réduction de maillage n'a été appliquée :
à moins de 2 000 triangles, l'optimiseur Docker n'a rien de sûr à gagner (voir le
[pipeline d'assets](asset-pipeline.md)). Le rendu WebGL des quatre pièces assemblées a
été contrôlé avec des captures (repos, +45°, rotation du faisceau).

```sh
python3 scripts/import-meshy-gatling.py --source Meshy_AI_Sentinel_Sentry_1121103608_texture.glb --output src
```

**Axe du faisceau.** Les six canons sont à 60° les uns des autres autour de l'axe,
mais l'original est incliné d'environ **2,25°** vers le haut. L'import ajuste l'axe
sur les six canons et **redresse le faisceau** sur l'horizontale avant de le poser
sur son pivot (le centre de l'ouverture du boîtier), sinon les canons « nageraient »
en tournant. Le pivot et les centres des six bouches sont enregistrés dans les données.

**Hiérarchie** (`src/gatling-model.ts`) : `socle` fixe → `lacet` → `elevation-canon`
(pivot horizontal au **sommet de la couronne**, sur l'axe de lacet) qui porte **toute la
partie supérieure** : la tête (boîtier, radar, caisse de munitions, témoin) et
`ensemble-canons` (au centre de l'ouverture : `anneau-faisceau`, qui ne tourne pas sur
lui-même, et `rotation-barillet`, qui tourne autour de l'axe central avec
`faisceau-canons` et les six bouches). Le recul de chaque tir ne déplace que
`ensemble-canons`. L'anneau est redressé comme le faisceau (même axe) ; il garde le léger
décalage de 0,2 mm du modèle d'origine, dont les canons sont un peu bas dans l'ouverture.

Échelle `GATLING_SCALE = 0,021` : 16 mm de haut, canons de 8 mm (la mitrailleuse du
Castor fait environ 9 mm). **Élévation de −10° à +45°.** Au-delà de 45°, le dessous de
la tête s'enfonce nettement dans le socle : la tourelle reste à 45° (le tir part malgré
tout vers la cible, les traceurs sont calculés depuis la bouche vers la cible réelle). À
l'élévation maximale, l'arrière de la tête affleure la couronne ; le pied de la tête
s'écarte du socle à l'avant, comme une charnière.

**Rotation.** Le faisceau tourne à 2 tours par seconde à plein régime : avec six
canons et 12 tirs par seconde, un tir par canon et par tour. Il monte en régime en
0,35 s, et ralentit en 1,1 s après le dernier tir (`stepGatlingSpin`). Il ne
tourne que lorsque des tirs partent réellement.

## Vérifications

`scripts/test-gatling.mjs` (dans `npm test`) couvre : valeurs, plafond partagé,
cadence de 120 tirs en 10 s au tick de 250 ms, cible abattue, munitions, recharge,
largage du Castor volant, achat serveur idempotent, effets du tick, hiérarchie du
modèle, atlas partagé, symétrie sextuple et centrage du faisceau, inertie, tirs
étalés, voix sonore par tourelle et raccord de la boucle.

**Reste à valider à la main** (WebGL/UDP/ressenti, non prouvables ici) : le rendu en
partie réelle, la lisibilité du faisceau en rotation à distance de jeu, le confort
du son continu avec plusieurs Gatling, le coût de 12 Gatling (144 traceurs par
seconde, partagés avec le plafond de 256 traces) et l'équilibrage du prix (25 $)
face à la T-01.
