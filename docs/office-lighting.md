# Éclairage du bureau

Depuis la version 403, un plan peut être éclairé par ses propres lampes au lieu du
soleil oblique historique. `diagonale` est le premier : deux **ventilateurs de
plafond lumineux** (modèle `Ceiling_Fan` du [Cartoon Office Pack](office-layouts.md#décor-le-cartoon-office-pack))
et la lampe de bureau de l'îlot A. Code : `src/office-lights.ts`, appelé par
`src/office.js` ; contrôle : `scripts/test-office-lights.mjs`.

## Suspensions sous les nuages

- Chaque ventilateur pend à une tige fine qui monte dans les nuages (`ROD`, 1,2 m
  au-dessus de son point d'accroche, `src/office-props.ts`). Point d'accroche à
  `FAN_TOP` = 2,34 m : pales entre 1,99 et 2,04 m, sous le voile (2,2125 m), moyeu
  jusqu'à 1,86 m. Ce sont des **obstacles de pilotage voulus**.
- Collisions : la tige, le moyeu, et le disque balayé par les pales (rayon 0,75 m),
  approché par un carré et une croix. Le disque vaut aussi pour un ventilateur
  qui tournera plus tard.
- Emplacements choisis pour rester hors des trajectoires des ennemis : (−0,7 ; 1,1)
  entre les îlots et (−0,85 ; −0,95) devant le tableau blanc. Deux points de plongée
  de Diagonale ont été décalés de 25 à 30 cm. Le test exige au moins 15 cm entre
  chaque collider de ventilateur et chaque trajectoire (17 cm au plus près).

## Lumières

| Source                        | Réglage (`LAMP_LOOK`)                                                                                                  | Ombre                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Ventilateur                   | cône chaud `#ffcf8f`, 20 cd, demi-angle 1,15 rad, pénombre 0,95, depuis le globe (0,45 m sous l'accroche), vers le bas | carte 1024², flou PCF 4 texels, **calculée une fois** |
| Lampe de bureau (`Desk_Lamp`) | point chaud `#ffc27a`, 0,8 cd, sous l'abat-jour                                                                        | aucune                                                |
| Ciel (hémisphère)             | `#f3efe2` / `#6b6a5a`, 0,75                                                                                            | —                                                     |
| Soleil                        | `#e6ecfb`, 1,6, presque à la verticale                                                                                 | carte 2048², **objets mobiles seulement**             |

Un plan sans ventilateur garde le soleil oblique et le préréglage `landing`
([ombres d'atterrissage](shadow-visibility.md)). Les lampes de bureau s'allument
dans tous les plans. Les paliers du rendu dessin animé s'appliquent à chaque
lumière ([rendu dessin animé](toon-rendering.md)).

## Ombres calculées une fois

`createOffice` crée les cônes avec `shadow.autoUpdate = false`. Le client appelle
ensuite `office.bakeShadows(renderer)` (à l'ouverture et à chaque changement de
plan). Cet appel rend une seule fois la pièce **seule** (sans avion, insecte ni
personnage) dans une cible hors écran, ce qui remplit les cartes d'ombre des cônes.
Les objets de la pièce cessent ensuite de projeter dans la carte du soleil, qui ne
contient plus que les objets mobiles. Leur ombre tombe presque à la verticale,
sous eux, ce qui aide à juger l'altitude à l'atterrissage. Sans appel (outils,
moteur logiciel), les cônes se calculent à la première image.

## Mesures

Rendu WebGL logiciel (SwiftShader), Diagonale, 1280 × 720, cinq images, vue de jeu :

| Version                                      | Image (toon) |
| -------------------------------------------- | ------------ |
| v401, soleil oblique, tout projette          | 375–385 ms   |
| v403, deux cônes ombrés + soleil des mobiles | 535–555 ms   |
| v403 sans ombre de cône (essai)              | ≈ 460 ms     |

Le calcul des cartes ne coûte plus rien après l'ouverture. Le coût restant est la
lecture des deux cartes des cônes, pixel par pixel, à chaque image. Deux lumières
d'appoint autour des globes (≈ 60 ms) ont été retirées pour cette raison. Le moteur
logiciel exagère ce coût ; reste à mesurer sur de vrais GPU. Piste suivante si besoin :
une texture de lumière cuite pour le sol et les murs, qui supprimerait cette lecture.

## Limites

- Les ventilateurs ne tournent pas encore. Le flux d'air qui ferait plonger les
  insectes, et les plateformes lumineuses où se poser, restent des idées à venir.
- Un objet construit en partie (fortification…) n'entre pas dans les ombres des
  cônes : il n'a que l'ombre du soleil, comme les objets mobiles.
- Seul `diagonale` a ses lampes ; les cinq autres plans gardent le soleil oblique.
