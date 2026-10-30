# Visibilité des ennemis — correctif du 30 octobre 2026

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
agrandissements côté client. Les autres insectes conservent leurs dimensions.

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
