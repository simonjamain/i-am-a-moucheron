# Nuées de moucherons — version 38

Demande du 30 octobre 2026 : cinq fois plus de moucherons, toujours regroupés.
Le directeur compose sa vague initiale selon le budget et les déblocages habituels,
puis chaque moucheron devient un groupe de cinq. Les fourmis et les autres espèces
ne sont pas multipliées. La première vague contient donc **20 moucherons et
4 fourmis**, au lieu de 4 + 4 ; sa prime commune reste 4 $.

`MIDGE_SWARM_MULTIPLIER` dans `src/waves.js` centralise le facteur. Les cinq membres
conservent trajet, branche, vitesse, durée, taille, PV et dégâts du moucheron source.
Leurs phases de mouvement sont réparties et leurs départs décalés de 0 à 0,28 s :
ils restent sur le même parcours de nuée, sans étaler la vague cinq fois plus
longtemps. Chaque membre possède un identifiant distinct, peut être blessé ou tué
indépendamment et compte pour la fin de vague. Un arrivant coûte toujours un point
d'infestation, une âme libérée rapporte toujours un dollar ; le changement augmente
donc aussi la menace et les revenus potentiels, sans modifier ces règles.
Une première vague complètement ignorée peut désormais entraîner la défaite.

Le budget affiché reste le budget du directeur **avant densification** ; la somme
des coûts des insectes finaux est supérieure. Le plafond du directeur reste 180
sources (avec consolidation du reliquat en bourdon), ce qui borne la population
finale à 900. Ce plafond est une limite de données, pas une promesse de FPS à 900.
Les plafonds de corps tombants (80), d'âmes visibles au purgatoire (24 PNJ), de
sons et d'armes lourdes restent actifs.

## Calcul et contrôles

`swarmFrame()` utilise une grille spatiale de cellules égales au rayon de voisinage,
avec les 27 cellules adjacentes et le même filtrage de distance exact. Les voisins
sont additionnés dans l'ordre des identifiants : résultat identique à la recherche
exhaustive, déterministe entre clients et lors d'une connexion tardive. Il n'y a
ni sous-échantillonnage ni limite supprimant des moucherons à l'affichage.
Une concentration extrême dans une cellule reste un cas quadratique local.

`test-dense-swarms.mjs` contrôle les groupes ×5 sur plusieurs graines et vagues,
les espèces inchangées, les identifiants, budgets sources, trajets et durées,
la parité exacte des positions avec le calcul exhaustif, les dégâts après
l'ancien indice 180, le dernier ennemi, la prime unique et le découpage réseau.
Il imprime une mesure CPU comparative, sans la confondre avec WebGL ou le WAN.
Les tests de visibilité conservent les contrôles du mobilier, des aérations et
des pieds au sol sur la population densifiée. La suite conserve aussi deux pairs
UDP natifs. Le confort de tir et les FPS restent à observer en partie sur la VM.

Livraison Node/RAM/UDP en ZIP ; aucune publication du client sur le Worker
historique. Installer les sources, redémarrer le serveur puis recharger les
navigateurs, comme décrit dans [l'exploitation](operations.md).
