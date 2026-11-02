# Bestiaire

| Ennemi            |    PV | Déblocage            | Particularité                             |
| ----------------- | ----: | -------------------- | ----------------------------------------- |
| Moustique         |    70 | vague 3              | zigzag rapide                             |
| Araignée pondeuse | 1 200 | vague 11             | 100 bébés sur mort                        |
| Rat géant         | 5 000 | vague 15             | très gros, lent, infestation 8            |
| Bébé araignée     |    20 | naissance uniquement | dispersion, vitesse élevée, infestation 1 |

La mort d'une pondeuse génère sur le serveur une naissance **exactement une fois**, aussi bien par arme légère que lourde. Cent nouveaux identifiants sont ajoutés au roster, avec départ légèrement échelonné, point d'origine correspondant au décès, navigation au sol et variation procédurale sans dépendance aux voisins. Les baby spiders n'ont pas d'âme au purgatoire ni de récompense, mais **chaque bébé qui atteint la poubelle ajoute 1 infestation**. Leur apparition est bornée techniquement par un roster de 20 000 entités : en cas de stress-test anormal au plafond, la naissance peut être partielle.

Les bébés utilisent un rendu InstancedMesh WebGL en trois lots et des objets légers pour les impacts. Les moustiques ont une oscillation erratique reproductible localement. Les gros rats ont des modèles procéduraux ; leur passage dans les couloirs de mobilier demande un contrôle en vrai jeu.

Le panneau d'équilibrage expose les trois espèces nouvelles, pas les bébés. Les changements du roster sont diffusés via `rosterRevision`, y compris aux joueurs arrivant tard.

## Vérification

`node scripts/test-enemy-bestiary.mjs` vérifie éclosions, identifiants, doublons, infestations et profils. Les contrôles Docker et la suite de tests Node sont complétés par un essai manuel WebGL/UDP, nécessaire pour l'animation, la fluidité et la navigation des gros animaux.

## Vitesse physique dans la pièce

Chaque profil possède `speedMps`, vitesse de progression en **mètres de la pièce par seconde**. Ce nombre ne dépend pas de la taille du modèle 3D, de l'effectif de la nuée, du numéro de vague, ni de la longueur d'un ancien parcours. Seul le multiplicateur « Vitesse ennemis » de la room le modifie. La durée se calcule sur le trajet effectivement emprunté : distance / vitesse.

| Espèce | Vitesse m/s | Espèce | Vitesse m/s |
| --- | ---: | --- | ---: |
| Fourmi | 0,170 | Cafard | 0,125 |
| Moucheron | 0,220 | Voltigeur | 0,260 |
| Carapace | 0,175 | Bourdon blindé | 0,140 |
| Moustique | 0,230 | Rat géant | 0,095 |
| Araignée pondeuse | 0,110 | Bébé araignée | 0,150 |

Les bébés araignées n'ont plus de multiplicateur caché ×1,8. Les moustiques restent imprévisibles mais leurs oscillations locales ont été ralenties. Les mouvements secondaires de groupe sont des petits écarts autour de la progression à vitesse fixe, pas une deuxième vitesse liée aux dimensions du modèle. `scripts/test-enemy-speeds.mjs` vérifie les valeurs, le chemin réel, les nuées de 10 à 5 000 ennemis, les bébés et le multiplicateur de room. Les sensations de jeu et les FPS WebGL nécessitent une validation en partie réelle.
