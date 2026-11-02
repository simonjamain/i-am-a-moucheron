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

Depuis l'uniformisation ultérieure de la génération des vagues, la première vague
n'impose plus les anciennes quantités 20 + 4 : deux fourmis restent garanties,
les autres sources sont tirées au sort avec le budget 8, puis les moucherons sont
multipliés par cinq. Les groupes suivent la même cadence à toutes les vagues.
Voir [progression](progression.md) ; les nombres ci-dessus décrivent la version 38.

## Nuées procédurales indépendantes — première version intégrée

L'issue #39 décrit l'objectif de montée à **1 000, 5 000 puis 10 000 moucherons
actifs**, sans promettre des FPS mesurés sur le navigateur ou le VPS.

- `swarmFrame()` conserve le trajet initial des sources, mais la position de
  chaque moucheron ajoute un décalage mathématique issu de son ID stable et de
  `routeSeed`, avec une phase dépendant du temps et une enveloppe décroissant
  aux extrémités du trajet. Les moucherons ne dépendent plus du voisinage des
  autres insectes. Supprimer un individu ne décale aucun survivant.
- Les autres espèces gardent leur steering de voisinage sur grille, entre
  elles uniquement. Le mouvement est reproductible à temps et roster donnés
  et ne nécessite pas d'état par frame ni d'envoi de positions réseau.
- Les moucherons ont une sphère de collision commune, en coordonnées locales
  de modèle (rayon `MIDGE_SPHERE_RADIUS` dans `scale.js`). Les tirs légers et
  la présélection `InsectIndex` utilisent l'intersection rayon–sphère exacte.
  Les projectiles lourds serveur utilisent le même rayon et écartent les
  candidats impossibles avec une boîte englobante balayée.
- Sur WebGL, `MidgeBatch` rassemble le corps, la tête et les deux ailes dans
  **trois meshes instanciés** pour tous les moucherons vivants. Chaque ennemi
  conserve un objet léger avec son identifiant, sa position, son mouvement,
  ses PV et ses effets ; seuls les corps tombants (plafond 80) recréent un
  modèle complet. Le moteur de secours 2D conserve les modèles ordinaires.
- Les réponses fiables UDP envoient le roster complet à la première
  synchronisation, après changement de vague ou de révision d'équilibrage.
  Les réponses `sync` intermédiaires l'omettent et le navigateur réutilise
  le roster du snapshot précédent. Les morts, dégâts, achats et autres états
  partagés restent transmis normalement.

### Contrôles et limites

`node scripts/test-dense-swarms.mjs` compare le voisinage restant à son
parcours exhaustif, vérifie l'invariance des positions après suppression
d'un moucheron et exécute des échantillons CPU de 1k/5k/10k.

`node scripts/test-midge-batch.mjs` couvre les instances 10k, leurs matrices,
les collisions et suppressions. `node scripts/test-roster-sync.mjs` vérifie
l'omission des rosters inchangés et la resynchronisation après révision/vague.
La suite `npm test` couvre aussi les dégâts, les projectiles, l'équilibrage
de room et les deux clients UDP natifs.

**Ne pas confondre benchmark CPU et débit réellement jouable** : avec 10 000
ennemis, la taille du premier snapshot, les effets des blessures, la charge
du navigateur, le débit des armes lourdes, la réception et le rendu GPU
demandent encore des mesures en conditions réelles et plusieurs joueurs.
Le comportement de pilotage et des tourelles multijoueurs ne change pas dans
ce chantier. Il n'y a pas de nouveau plafond imposé au réglage de population.

## Nuée manuelle unique et vitesse indépendante de l'effectif

Lorsqu'un joueur envoie des insectes avec le panneau d'équilibrage, il
obtient **une seule nuée par environnement de déplacement**, même pour
une commande de 5 000 individus. Les espèces volantes partagent une seule
graine de trajet, entrée et branche ; les espèces terrestres, si présentes
dans le même envoi, empruntent leur propre chemin au sol. Une nouvelle
commande est indépendante de la précédente. Les vagues automatiques restent
constituées de plusieurs groupes de tailles variées.

L'étendue des groupes grandit selon la racine carrée de leur population
initiale, jusqu'à un rayon de référence ×20 dans les airs et ×8 au sol.
Cette population est calculée lors de la création du roster (y compris
après multiplication de la population d'une vague ordinaire) et demeure
fixe lorsque des ennemis meurent.

**Correctif de vitesse :** auparavant l'oscillation angulaire était
multipliée par le rayon de formation, de sorte que la vitesse linéaire
augmentait mécaniquement avec l'effectif. Maintenant la dispersion
initiale est une position stable autour du trajet ; une petite oscillation
de fréquence et d'amplitude fixes apporte du mouvement sans amplification
liée à l'effectif. La formation s'ouvre et se referme avec un fondu dont
la durée est proportionnelle à son rayon, afin de limiter aussi sa vitesse
aux entrées et sorties. La vitesse de parcours déterminée par l'espèce
et le réglage de la room ne dépend pas du nombre d'individus. Les
insectes terrestres ne prennent pas de décalage vertical.

Le calcul procédural indépendant s'applique aussi aux autres espèces
des nuées de debug, sans voisinage quadratique. Les autres insectes
des vagues automatiques conservent leur steering spatial. Les contrôles
dans `scripts/test-dense-swarms.mjs` comparent petites et grandes
nuées, effectifs jusqu'à 5 000, entrées communes, vitesse de
parcours, vitesse d'oscillation et formation mixte. Une validation
humaine WebGL et des mesures GPU/UDP réelles restent nécessaires.
