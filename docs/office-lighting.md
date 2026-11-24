# Éclairage et ombres du bureau

Lumières, ombres portées et préréglages d'ombre de la salle de jeu. Code :
`src/office-lights.ts` (appelé par `src/office.ts`), `src/shadow-settings.ts` ;
les paliers du [rendu dessin animé](toon-rendering.md) s'appliquent à chaque lumière.

## Deux éclairages selon le plan

- **Soleil oblique** (plans sans lampes) : ciel hémisphérique et soleil incliné
  (`LAMP_LOOK.legacySky`, `legacySun`), carte d'ombre 2048² ; tout le décor et les objets
  mobiles projettent.
- **Lampes** (plan `diagonale` seulement) : deux **ventilateurs de plafond lumineux**
  (modèle `Ceiling_Fan` du [Cartoon Office Pack](office-layouts.md#décor--le-cartoon-office-pack))
  et un ciel atténué ; le soleil devient presque vertical et ne porte plus que les objets
  mobiles, dont l'ombre tombe sous eux et aide à juger l'altitude à l'atterrissage.

Les lampes de bureau (`Desk_Lamp`) s'allument dans tous les plans.

| Source               | Réglage (`LAMP_LOOK`)                                                                                      | Ombre                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Ventilateur          | cône `#ffcf8f`, intensité 20, demi-angle 1,15 rad, pénombre 0,95, depuis le globe (0,45 m sous l'accroche) | carte 1024², flou PCF 4 texels, **calculée une fois** |
| Globe du ventilateur | verre de l'atlas émissif dans la couleur du cône (`GLOWING`, `src/office-pack.ts`)                         | —                                                     |
| Lampe de bureau      | point `#ffc27a`, 0,8, sous l'abat-jour                                                                     | aucune                                                |
| Ciel (hémisphère)    | `#f3efe2` / `#6b6a5a`, 0,75                                                                                | —                                                     |
| Soleil               | `#e6ecfb`, 1,6, presque vertical                                                                           | carte 2048², **objets mobiles seulement**             |

## Ventilateurs suspendus

- Chaque ventilateur pend à une tige qui monte dans les nuages (`ROD` = 1,2 m,
  `src/office-props.ts`) depuis `FAN_TOP` = 2,34 m (`src/layouts.ts`) : pales entre 1,99
  et 2,04 m, sous la couche de nuages (2,2125 m). Ce sont des **obstacles de pilotage**.
- Collisions : tige, moyeu et disque balayé par les pales (rayon 0,75 m, approché par un
  carré et une croix), valable aussi pour un ventilateur qui tournerait.
- Emplacements (−0,7 ; 1,1) et (−0,85 ; −0,95), hors des trajectoires des ennemis : le
  test exige au moins 15 cm entre chaque collider et chaque trajectoire.

## Ombres des lampes calculées une fois

`createOffice` crée les cônes avec `shadow.autoUpdate = false`. Le client appelle
`office.bakeShadows(renderer)` à l'ouverture et à chaque changement de plan : la pièce
**seule** (sans avion, insecte ni personnage) est rendue une fois hors écran, ce qui
remplit les cartes des cônes, puis les objets de la pièce cessent de projeter dans la
carte du soleil. Sans cet appel (outils, moteur logiciel), les cônes se calculent à la
première image. Après l'ouverture, le coût restant est la lecture des deux cartes à
chaque image.

## Préréglages d'ombre

`SHADOW_PRESETS` (`src/shadow-settings.ts`) fixe le filtrage et les intensités du ciel et
du soleil ; `applyShadowPreset` est appliqué par `src/renderer.ts` (filtrage) et
`src/office-lights.ts` (intensités), avec `landing` par défaut :

| Préréglage | Filtrage                | Ciel | Soleil |
| ---------- | ----------------------- | ---: | -----: |
| `landing`  | `PCFShadowMap`, 1 texel |  1,5 |      4 |
| `baseline` | `PCFSoftShadowMap`      |  2,5 |      3 |

`landing` donne des ombres sombres et contrastées sous les appareils, aux bords
légèrement adoucis ; un rayon de 1,5 ou 2 texels éclaircit trop les petites ombres. Le
plan à lampes remplace ensuite ciel et soleil par ceux de `LAMP_LOOK`.

### Comparer deux préréglages

`scripts/review-shadows.html` compare `baseline` et `landing` avec les vrais modules :
servir la racine du dépôt en local (`python3 -m http.server 8080 --bind 127.0.0.1`, à ne
pas exposer) et ouvrir `http://127.0.0.1:8080/scripts/review-shadows.html` dans un
navigateur WebGL.

1. Garder matériel, navigateur, fenêtre et résolution constants, outils de
   développement fermés.
2. Comparer sur le bureau puis le sol, aux hauteurs 0,006 / 0,04 / 0,15 m : appui des
   roues et patins, contraste, artefacts.
3. « Mesurer A/B/B/A » : sept véhicules, 120 insectes, caméra fixe, trajectoire
   déterministe ; chaque phase chauffe 120 images puis en mesure 600.
4. Exporter le JSON (temps d'image médian/p95/min/max, soumission CPU, temps GPU si
   l'extension existe — nul sinon, ce qui ne vaut pas « zéro coût » —, appels de dessin,
   triangles, matériel). Une perte de contexte invalide l'essai.

Le comparateur ne prouve ni performance maximale ni confort en partie.

## Vérifier

- `scripts/test-office-lights.mjs` : lampes du plan, ventilateurs, collisions et
  distance aux trajectoires, cuisson unique des ombres.
- `scripts/test-shadow-settings.mjs` : préréglages et inventaire de la scène (mêmes
  maillages, projecteurs, receveurs et carte 2048² pour les deux préréglages).
- `scripts/test-shadow-review.mjs` : instrumentation du comparateur.
- Rendu et coût réels à juger sur un GPU : SwiftShader exagère la lecture des cartes
  d'ombre des cônes.

## Limites

- Les ventilateurs ne tournent pas ; le flux d'air sur les insectes et les plateformes
  lumineuses restent des idées.
- Un objet construit en partie (fortification…) n'entre pas dans les ombres des cônes :
  il n'a que l'ombre du soleil, comme les objets mobiles.
- Seul `diagonale` a des ventilateurs ; les cinq autres plans gardent le soleil oblique.
