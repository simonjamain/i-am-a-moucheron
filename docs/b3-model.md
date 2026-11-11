> **Remplacé en version 275** par le [chasseur et bombardier biplans](biplane-models.md) : ce document décrit l'ancien modèle, désormais supprimé.

# Bombardier B3 : quatre places et camouflage

Le B3 accueille un pilote, un mitrailleur dorsal, un mitrailleur de queue et un
mitrailleur ventral. Les touches **1 / 2 / 3 / 4** demandent le poste correspondant
avec les contrats habituels. Le cercle **V** permet de rejoindre le poste ventral
à pied. Le quatrième poste possède son propre stock de 667 balles et sa signature ;
sortir ou échanger sa place ne libère pas les autres occupants.

La visée ventrale couvre le dessous de l’appareil : élévation entre −1,5 et −0,05
radian, rotation horizontale libre. Sa caméra reste sous la coque ; les commandes
souris et manette appliquent les mêmes limites. Le pilote conserve les
bombes et l’autorité sur le vol. Les trois mitrailleurs publient leur direction et
leurs tirs indépendamment, avec le protocole existant.

## Modèle et textures

Depuis la version 263, le B3 utilise le modèle refait par l'utilisateur (5 797
triangles, tourelles dorsale, de queue et ventrale articulées) : voir
[le remodelage de la flotte](meshy-fleet.md#remodelage-de-la-flotte-version-263).
L'historique ci-dessous décrit la version précédente.

Le modèle est issu de la tâche Meshy `01a1a87e-d709-73c8-b5d8-3fe935a944b8`, depuis
une image dédiée créée à partir de la planche validée « Bombardier B3, tourelle
ventrale.png ». La référence montre un seul avion entier sur fond neutre, sans
texte ni montage. La [référence dédiée](b3-reference.jpg) en conserve une copie. Voir les [conseils officiels Image-to-3D](https://help.meshy.ai/en/articles/9996860-how-to-use-meshy-image-to-3d).

Le GLB source comporte 29 766 triangles ; sa somme SHA-256 est
`8afb8b5e60ab03282a4dbaed35ca05be728a5e278d8299c622f3deccf3cfe6d9`.
La conversion reproductible est `python3 scripts/import-meshy-b3.py modèle.glb`.
Le rendu final compte 27 573 triangles : coque, ailes, trois tourelles, deux hélices
et six canons articulés. Les anciens canons statiques sont retirés.

Les UV d’origine sont conservés : aucune couleur aléatoire ne remplace le
camouflage. L’atlas de couleur est redimensionné à 1 024 pixels et compressé en
JPEG (299 142 octets). Les cartes PBR supplémentaires ne sont pas chargées ; le
matériau utilise une rugosité uniforme. Ce compromis conserve les couleurs et la
texture visible, sans prétendre reproduire tous les matériaux du GLB original.

Les attributs indexés sont compactés en entiers 16 bits, avec une précision locale
de 0,0005 unité pour les positions, puis embarqués dans le module distribué par
l’assembleur. Géométries, matériau et atlas sont partagés entre les B3 ; articulations
et identification sont propres à chaque appareil. Aucun chargement Meshy ou CDN
n’est nécessaire en jeu. La réduction géométrique sans contraintes UV a été écartée
car elle altérait le camouflage ; ce modèle reste plus détaillé que M1 et H2.

Comme sur les autres véhicules Meshy, le disque au-dessus du bombardier porte
la teinte d’identification actuelle,
reste face à la caméra et respecte l’occlusion du décor. Il ne participe pas aux
collisions des tirs. Les noms des occupants restent inscrits sur la coque.

## Vérifier

`scripts/test-b3-crew.mjs` teste le serveur Node : quatre embarquements signés,
exclusivité, stock indépendant, déduplication des tirs, échange signé et sortie.
`scripts/test-b3-model.mjs` contrôle les UV, le partage de ressources, les trois
tourelles, le canon ventral, sa caméra, le disque et l’appui des roues.

Une [projection CPU de la géométrie texturée](b3-model-review.png) a servi à vérifier le camouflage.
Ces contrôles ne prouvent pas une partie WebGL/UDP ni la fluidité avec plusieurs
bombardiers : vérifier à quatre joueurs les vues, les tirs, les échanges et la
lisibilité du repère lors du test en jeu.

Pour une variante de GLB B3, suivre le [pipeline d’optimisation Meshy](asset-pipeline.md), puis revérifier les quatre postes, les pivots et le camouflage avant tout remplacement.
