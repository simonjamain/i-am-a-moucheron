# Visibilité des ennemis — correctif du 30 octobre 2026

La composition de vague décrite dans ce lot a ensuite été densifiée : voir
[les nuées de version 38](dense-swarms.md), 20 moucherons et 4 fourmis au départ.

Le correctif cible le runtime Node/UDP et se livre en sources. Le Site public
Worker historique n'est pas redéployé avec ce client.

## Défauts reproduits

`node scripts/test-enemy-visibility.mjs` a d'abord échoué sur des positions
vivantes situées dans le panneau plein des aérations. Le point théorique de
spawn correspondait au centre du panneau décoratif ; les deux secondes d'attente
d'entrée s'y déroulaient, avec un corps masqué par la géométrie. L'échantillon
sur les vagues 1, 2, 4, 6, 8 et 12 contenait 93 positions de moucherons, sept de
voltigeurs, une de carapace et une de bourdon dans ces panneaux, avant correction.
Aucun ensevelissement intérieur supplémentaire n'a été trouvé dans cet échantillon.
Ce relevé explique des invisibilités temporaires, sans prouver que c'était
l'unique cause de toutes les observations en partie.

Les points décoratifs restent inchangés. `portalExit()` décale le premier point
vivant de **4 cm du décor vers l'intérieur** : insectes visibles dès leur attente
d'entrée, toujours périphériques et à plus de trois mètres de la corbeille.
Le trajet et son temps d'arrivée sont recalculés par les mêmes modules partagés
côté client et serveur. Le décor conserve son occultation normale.

Le même test exécute le vrai `enemies()` du client avec deux vagues successives,
sans rendu de la préparation intermédiaire. Avant correction, un ID réutilisé
pour une fourmi conservait le modèle volant précédent. Le modèle est maintenant
rattaché à sa vague et à son espèce ; un changement libère l'ancienne géométrie
et crée le bon insecte. Cela couvre notamment les clients en arrière-plan ou
recevant tardivement une transition. Les six types sont vérifiés dans ce parcours.

## Taille et terrestres

Les dimensions linéaires des **moucherons seulement** sont multipliées par **3
par rapport à la livraison précédente** : facteur total 6,075 par rapport au
modèle initial, soit un volume théorique multiplié par 27 à forme constante.
Les PV et dégâts restent inchangés. `MIDGE_SIZE_FACTOR` dans `scale.js` est
partagé par le modèle, les effets de blessure et les volumes de collision serveur.
La tolérance de visée supplémentaire de 20 % est conservée, sans empiler deux
agrandissements côté client. Dans ce premier correctif, les autres insectes conservaient leurs dimensions ;
la reprise ci-dessous remplace cette règle.

La vague 1 comporte maintenant **quatre fourmis et quatre moucherons**, au lieu
de deux fourmis et six moucherons. Son budget reste 8 et sa prime reste 4 $.
Les suivantes gardent au moins deux fourmis et leur progression existante ;
les cafards ne sont pas avancés à la première vague. Les corps des terrestres
utilisent des teintes ocre et des têtes claires pour mieux se distinguer du sol.
Leurs géométries sont contrôlées au-dessus du plancher. Aucun marqueur visible
à travers les meubles ni nom flottant n'est ajouté.

## Contrôles et limites

Le test vérifie présence des meshes dans la scène, positions finies, six types,
première vague mixte, absence de corps enfouis dans les boîtes échantillonnées,
transition directe de vague avec changement d'espèce, taille réelle ×3 sur
les trois axes et corps terrestres au-dessus du sol. Les tests de visée et
serveur continuent à couvrir dégâts, impacts et cohérence de l'échelle ; la suite
complète, les deux pairs UDP natifs, l'assemblage, le build et les liens documentaires
sont exécutés pour la livraison.

Ce contrôle de scène et de géométrie n'est pas une partie WebGL sur Internet.
Un ennemi peut naturellement être derrière un meuble ou hors du champ de caméra ;
aucune promesse de visibilité permanente à travers le décor n'est faite. La
lisibilité subjective au sol et en vol reste à confirmer en partie sur la VM.
Redémarrer le serveur et recharger les navigateurs après remplacement des sources.

## Reprise après persistance du signalement : taille apparente des six espèces

Le premier contrôle vérifiait l'existence et le placement des objets, mais pas
leur lisibilité en pixels. Cela ne suffisait pas : sur une vue frontale à deux
mètres du décor, champ vertical 62° et écran 1920×1080, la fourmi mesurait
0,93×0,36 pixel et le cafard 1,39×0,46 pixel. Voltigeur, carapace et bourdon
mesuraient respectivement 2,32×0,54, 3,83×0,88 et 5,19×1,20 pixels.
`node scripts/test-enemy-readability.mjs` reproduit cet échec en projetant les
bornes des vrais meshes Three.js, sans agrandir artificiellement un marqueur.

| Espèce    | Facteur courant par rapport au modèle initial | Dimensions du décor L×H×P (mm) | Projection frontale à 2 m (pixels) |
| --------- | --------------------------------------------: | ------------------------------ | ---------------------------------- |
| Fourmi    |                                             6 | 12,40×5,37×15,46               | 5,60×2,42                          |
| Cafard    |                                             8 | 24,81×9,93×29,54               | 11,23×4,49                         |
| Moucheron | 6,075, inchangé depuis le correctif précédent | 36,91×8,51×15,89               | 16,65×3,84                         |
| Voltigeur |                                             4 | 20,66×4,76×11,19               | 9,31×2,15                          |
| Carapace  |                                             3 | 25,52×5,88×11,38               | 11,50×2,65                         |
| Bourdon   |                                             3 | 34,63×7,98×15,45               | 15,62×3,60                         |

Ces dimensions incluent ailes ou pattes et le profil de taille de l'espèce. Ce
sont des choix de lisibilité du jeu, pas des proportions biologiques. Le seuil
contrôlé est de 6×2 pixels, avec exception fourmi à 5×1,7 pixels après la demande
VAG-07 de demi-taille. Voir [confort](comfort.md) pour ce changement validé.
L'agrandissement n'est pas dépendant de la caméra : la géométrie visible, les
tirs et les contacts conservent la même taille à plusieurs joueurs.
`ENEMY_SIZE_FACTORS` et `enemySizeFactor()` dans `scale.js` centralisent les six
facteurs. PV, dégâts, composition et primes restent inchangés ; VAG-07 divise
ensuite par deux la vitesse effective des seules fourmis. Les cinq espèces autres que le moucheron ne conservent donc **plus**
leurs anciennes dimensions : cette reprise remplace la règle du premier correctif.

Un agrandissement seul fait échouer le contrôle du sol : les meshes terrestres
s'étendent sous leur origine. `swarmFrame()` relève maintenant les deux points
utilisés pour position et tangente selon la profondeur réelle des pattes, multipliée par l'échelle
réelle de l'espèce. Les pattes sont abaissées pour que leurs extrémités, plutôt
que l'abdomen, forment le point bas du corps. `GROUND_LEGS` et
`GROUND_FOOT_DEPTH` partagent ces dimensions entre géométrie et placement. Ainsi le corps et les pattes dégagent le plancher, y compris
ses joints décoratifs hauts de 0,4 mm, sans déplacer la géométrie du décor.
L'écart est identique côté client et serveur ; la tangente reste horizontale sur
le sol plat. La marge de navigation terrestre passe à 25 mm (aériens : 18 mm),
pour tenir compte des corps élargis et de leur léger mouvement de groupe.
La montée finale vers la corbeille conserve sa mécanique guidée.

Le nouveau test vérifie les six dimensions et leurs projections, puis les vrais
modèles terrestres sur les positions de `swarmFrame()` en vagues 1, 2, 6 et 12 :
apparition, parcours et montée finale, pattes au-dessus du sol et tangente correcte.
Le test de visibilité existant conserve les contrôles d'aérations, de modèles
entre vagues et d'absence de centre enfoui dans le mobilier. La suite complète
inclut les tests de dégâts et les deux pairs UDP natifs.

La projection géométrique n'est pas une observation du confort WebGL : à une
distance plus grande, dans une autre orientation ou derrière un meuble, la taille
apparente et l'occultation changent. Aucun affichage à travers les obstacles ni
marqueur de remplacement n'est introduit. Le Site historique n'est pas redéployé ;
le ZIP des sources Node/UDP doit être installé, puis serveur et clients relancés.
