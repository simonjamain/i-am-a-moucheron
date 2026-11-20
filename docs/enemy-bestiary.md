# Bestiaire

| Ennemi            |     PV | Déblocage            | Particularité                              |
| ----------------- | -----: | -------------------- | ------------------------------------------ |
| Moustique         |    150 | dès la vague 1       | zigzag rapide                              |
| Araignée pondeuse |  1 200 | dès la vague 1       | 100 bébés sur mort                         |
| Rat géant         | 10 000 | dès la vague 1       | très gros, lent, puissance 24,47           |
| Bébé araignée     |     10 | naissance uniquement | dispersion, vitesse élevée, puissance 0,08 |

Il n'y a plus de vague de déblocage : tous les ennemis (hors bébés araignées) peuvent être tirés dès la première vague, et seule la puissance de la vague décide s'ils tiennent dans son budget restant. La vague 1 (32) peut ainsi appeler une pondeuse (10,94), mais pas encore un rat (24,47) une fois les essaims d'ouverture servis.

La mort d'une pondeuse génère sur le serveur une naissance **exactement une fois**, aussi bien par arme légère que lourde. Cent nouveaux identifiants sont ajoutés au roster, avec départ légèrement échelonné, point d'origine correspondant au décès, navigation au sol et variation procédurale sans dépendance aux voisins. Les bébés passent eux aussi au purgatoire et rapportent leur puissance, et **chaque bébé qui atteint la poubelle ajoute sa puissance (0,08) à l'infestation**. Leur apparition est bornée techniquement par un roster de 20 000 entités : en cas de stress-test anormal au plafond, la naissance peut être partielle.

Les fourmis et les araignées pondeuses utilisent les modèles Meshy « Red Ant Warrior » et « Spotted Velvet Spider » avec une marche à pieds plantés (démarche tripode et tétrapode alternée), dont la phase suit la distance parcourue ; voir [le pipeline d'assets](asset-pipeline.md#fourmi-et-araignée-pondeuse-meshy-marche). Leur zone de tir devient un ellipsoïde du corps, sans les pattes. Le cafard suit la même chaîne avec le modèle Meshy « Low Poly Cockroach » (démarche tripode, longues antennes) ; voir [le cafard](asset-pipeline.md#cafard-version-308). Les moucherons utilisent le modèle Meshy « Angry Little Fly » animé (battement d'ailes, pattes et antennes) près de la caméra et des ellipsoïdes au loin ; voir [le pipeline d'assets](asset-pipeline.md#moucheron-meshy-squelette-et-vol). Leur zone de tir est inchangée. Le scarabée (`brute`, anciennement « bourdon blindé ») utilise un modèle Meshy fourni par l'utilisateur, élytres fermées et ailes battantes, pattes pendantes ; voir [le pipeline d'assets](asset-pipeline.md#scarabée-meshy-vol-version-307). Sa zone de tir est une sphère parfaite (rayon 0,86 unité d'insecte, centrée sur le corps, de même volume que l'ancienne ellipsoïde) : le test de tir par sphère, sans matrice, est environ cinq fois plus rapide que celui par ellipsoïde. Le rat géant rejoue le clip de marche fourni avec son modèle Meshy « Low Poly Mouse » ; voir [le rat](asset-pipeline.md#rat-version-310). Le moustique utilise le modèle Meshy « Low Poly Mosquito » (battement rapide, longues pattes pendantes) ; voir [le moustique](asset-pipeline.md#moustique-version-311). L'abeille (`guard`, anciennement « carapace ») suit la même chaîne avec le modèle Meshy « Angry Low Poly Bee » (bourdonnement rapide, abdomen qui pompe) ; voir [l'abeille](asset-pipeline.md#abeille-version-309).

Les bébés utilisent le modèle Meshy « Grumpy Spider » dans la chaîne des marcheurs : un seul `InstancedMesh` animé (marche à pieds plantés, palpes avant qui tâtent le sol), des objets légers pour les impacts et une zone de tir proche de l'ancienne sphère ; voir [le bébé araignée](asset-pipeline.md#bébé-araignée-version-317). Les moustiques ont une oscillation erratique reproductible localement. Les gros rats rejouent le clip Meshy de leur modèle ; leur passage dans les couloirs de mobilier demande un contrôle en vrai jeu.

Les changements du roster sont diffusés via `rosterRevision`, y compris aux joueurs arrivant tard.

Le voltigeur (`dart`), petit volant rapide débloqué en vague 2, a été retiré du jeu en version 312 : plus de profil, de paquet, de vague ni d'apparition de débogage. `scripts/test-enemy-bestiary.mjs` vérifie qu'aucune vague ne le réintroduit.

## Puissance

Valeurs calculées avec les statistiques actuelles (voir
[équilibrage](enemy-power.md#unité-commune)) :

| Espèce            | Puissance                       |
| ----------------- | ------------------------------- |
| Moucheron         | 1,00                            |
| Fourmi            | 0,58                            |
| Moustique         | 2,06                            |
| Cafard            | 1,38                            |
| Abeille           | 4,03                            |
| Scarabée          | 6,93                            |
| Araignée pondeuse | 10,94 (2,64 + 100 bébés × 0,08) |
| Bébé araignée     | 0,08                            |
| Rat géant         | 24,47                           |

Tout ennemi tué (bébés araignées compris) devient une âme au purgatoire, où il apparaît sous son vrai modèle. Une âme libérée rapporte cette puissance en dollars et un ennemi qui atteint la
poubelle lui inflige autant de dégâts. Les cartes du mode debug l'affichent.

## Tailles en jeu

Hauteur au bureau, modèle au repos, ailes et pattes comprises (version 318) :
abeille 15 mm, scarabée 17 mm, moustique 12 mm. Elles se règlent par le facteur
d'espèce `ENEMY_SIZE_FACTORS` (`src/scale.ts`), qui agrandit d'un même rapport le
modèle, sa zone de tir (ellipsoïde dans le repère du modèle) et le rayon de
collision des armes lourdes côté serveur. `scripts/test-enemy-readability.mjs`
vérifie ces trois hauteurs et que la zone de tir suit le modèle.

## Vérification

`node scripts/test-enemy-bestiary.mjs` vérifie éclosions, identifiants, doublons, infestations et profils. Les contrôles Docker et la suite de tests Node sont complétés par un essai manuel WebGL/UDP, nécessaire pour l'animation, la fluidité et la navigation des gros animaux.

## Vitesse physique dans la pièce

Chaque profil possède `speedMps`, vitesse de progression en **mètres de la pièce par seconde**. Ce nombre ne dépend pas de la taille du modèle 3D, de l'effectif de la nuée, du numéro de vague, ni de la longueur d'un ancien parcours. Seul le multiplicateur « Vitesse ennemis » de la room le modifie. La durée se calcule sur le trajet effectivement emprunté : distance / vitesse.

| Espèce        | Vitesse m/s | Espèce            | Vitesse m/s |
| ------------- | ----------: | ----------------- | ----------: |
| Fourmi        |       0,085 | Cafard            |      0,0625 |
| Moucheron     |        0,11 | Abeille           |      0,0875 |
| Scarabée      |        0,07 | Moustique         |       0,115 |
| Rat géant     |     0,08075 | Araignée pondeuse |       0,055 |
| Bébé araignée |       0,075 |                   |             |

Les bébés araignées n'ont plus de multiplicateur caché ×1,8. Les moustiques restent imprévisibles mais leurs oscillations locales ont été ralenties. Les mouvements secondaires de groupe sont des petits écarts autour de la progression à vitesse fixe, pas une deuxième vitesse liée aux dimensions du modèle. `scripts/test-enemy-speeds.mjs` vérifie les valeurs, le chemin réel, les nuées de 10 à 5 000 ennemis, les bébés et le multiplicateur de room. Les sensations de jeu et les FPS WebGL nécessitent une validation en partie réelle.

## Ralentissement général (version 123)

La vitesse de progression de toutes les espèces, y compris les bébés araignées et les ennemis générés manuellement, est réduite de 50 % par rapport aux valeurs précédentes. Le multiplicateur « Vitesse ennemis » de la room continue de s'appliquer normalement aux nouvelles vitesses de base. Les durées des trajets sont recalculées sur la distance réelle.

## Rats plus rapides (version 125)

Les rats géants progressent désormais à 0,08075 m/s, soit 70 % plus vite que leur vitesse précédente de 0,0475 m/s. Les autres espèces sont inchangées. Le multiplicateur de vitesse de la room reste applicable aux rats comme aux autres ennemis.

## Fluidité des ennemis terrestres (version 161)

Le serveur conserve l'autorité sur les positions, le contournement, les attaques
et les arrêts sur colle ou sucre. Le navigateur recevait des positions de
`groundAgents` environ toutes les 100 ms à pied et 250 ms dans un véhicule,
puis les affectait directement aux modèles à chaque image : ceux-ci restaient
immobiles entre deux réponses avant de bondir à la suivante.

Le client affiche maintenant une interpolation linéaire sur 300 ms d'historique
horodaté de positions serveur, avec une mémoire bornée. En l'absence de nouvelle
réponse, la dernière position connue est conservée sans extrapolation : il n'y
a pas de traversée spéculative des barricades. Les nouvelles créatures sont
initialisées à leur vraie position, et l'historique est réinitialisé au changement
de vague, de monde ou de phase. Les routes aériennes ne sont pas modifiées.

`node scripts/test-ground-motion.mjs` simule des réponses espacées de 250 ms et
contrôle les sauts de position, l'immobilisation, les arrivées et les changements
de vague. Cette régression numérique ne remplace pas un essai WebGL/UDP réel,
notamment pour juger de la latence de présentation et des FPS sous forte charge.
