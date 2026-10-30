# Backlog — i am a moucheron

Spécification validée par l’utilisateur le 29 octobre 2026.
Ce document décrit le travail demandé, pas les fonctionnalités déjà livrées.
Exécution autorisée le 29 octobre 2026. Le suivi ci-dessous distingue les tâches
implémentées, vérifiées et publiées. Aucune automatisation de développement.

## Suivi et reprise

Lire `AGENTS.md`, `README.md` et `docs/gameplay.md`, puis confronter chaque tâche
aux sources actuelles avant de commencer. Le dépôt reste la référence partagée.
Pour traiter un lot sans interruption et livrer des releases intermédiaires,
appliquer la section « Exécution du backlog » de `AGENTS.md`.

États : **prêt**, **à préciser**, **en cours**, **bloqué**, **terminé**. Les dépendances doivent
être terminées avant de commencer une tâche. L’ordre ci-dessous est un ordre
technique conseillé, pas une priorité métier supplémentaire.

L’agent chargé d’une tâche met à jour ce fichier dans la même livraison que son
travail : état, vérifications et limites, référence de livraison et prochaine
étape si elle reste incomplète. Ne marquer « terminé » qu’après vérification des
critères ; distinguer livraison du code et publication effective. Mettre aussi à
jour la documentation du comportement livré. Conserver les identifiants stables
et ne pas écraser le travail d’un autre agent. En cas de blocage, noter la cause.

| ID     | Tâche                                   | État    | Dépendances    |
| ------ | --------------------------------------- | ------- | -------------- |
| DEG-01 | PV ennemis et dégâts des mitrailleuses  | terminé | —              |
| DEG-02 | Impact direct et explosion de DCA       | terminé | DEG-01         |
| JOU-01 | PV joueurs et tirs alliés               | terminé | DEG-01         |
| ARM-01 | Pistolet personnel                      | terminé | DEG-01, JOU-01 |
| PUR-01 | Super purgatoire et résurrections       | terminé | JOU-01         |
| PUR-02 | Tir au purgatoire et libération des PNJ | terminé | ARM-01, PUR-01 |
| TXT-01 | Titre officiel et textes de lancement   | terminé | —              |
| TXT-02 | Contrats humoristiques et variantes     | terminé | —              |
| SON-01 | Son de machine à sous par dollar        | terminé | —              |
| SIE-01 | Changement vers un siège libre          | terminé | —              |
| SIE-02 | Échange contractuel de sièges occupés   | terminé | SIE-01         |

## Nouveau lot — retours de partie du 29 octobre 2026

Demandes enregistrées après la livraison 025, puis exécutées dans la livraison 027. Leur enregistrement initial était documentaire ; la livraison détaillée
figure en fin de fichier.
Les anciens états « terminé » restent l’historique de livraison ; les anomalies
observées en partie sont suivies séparément ci-dessous.

| ID     | Tâche                                                             | État    | Dépendances |
| ------ | ----------------------------------------------------------------- | ------- | ----------- |
| VIS-01 | Supprimer les noms flottants des joueurs et véhicules             | terminé | —           |
| VIS-02 | Agrandir légèrement les moucherons et montrer leurs PV blessés    | terminé | —           |
| BUG-01 | Supprimer le double effet de tampon                               | terminé | —           |
| BUG-02 | Fiabiliser la signature lors des embarquements à plusieurs        | terminé | —           |
| DIA-01 | Diagnostiquer le pistolet à pied dans le bureau, sans le corriger | terminé | —           |
| VIS-03 | Effets de fumée et de flammes selon les dégâts des insectes       | terminé | VIS-02      |
| SON-02 | Son de chute en perdition des insectes volants                    | terminé | —           |
| VAG-01 | Garantir des apparitions périphériques loin de la corbeille       | terminé | —           |

### VIS-01 — Supprimer les noms flottants

Observation : les noms au-dessus des avions et joueurs gênent la visibilité.
Supprimer leur affichage dans la scène, pour les véhicules et les personnages
joueurs, locaux comme distants. Appliquer aussi aux joueurs dans les deux
purgatoires. Il s’agit d’une suppression, pas d’un simple masquage à distance.
Conserver les identités utiles dans les menus, listes d’équipage et contrats.
Les panneaux de lieux et de guichets ne sont pas visés par cette demande.

Critères : aucun nom flottant au-dessus des joueurs ou véhicules après connexion,
embarquement, changement de siège, mort ou résurrection ; identification toujours
possible dans les interfaces. Ne pas supprimer les futures barres de PV ennemies.
Repères : créations de labels dans `src/client.js`, helper `src/graphics.js`.

### VIS-02 — Moucherons plus faciles à voir et PV après blessure

Observation : les moucherons sont très difficiles à toucher. Les agrandir
**légèrement**, sans perdre l’échelle miniature du jeu. Ajuster ensemble modèle
visible et géométrie réellement touchable : agrandir seulement un marqueur ou
créer une hitbox très éloignée de la silhouette ne répond pas au besoin.
Le facteur exact n’est pas imposé ; documenter la valeur choisie et la vérifier
en partie. La demande d’agrandissement vise les moucherons, pas automatiquement
tous les types d’ennemis ni les joueurs et appareils.

Afficher une barre de vie dès qu’un moucheron/insecte ennemi est blessé
(`0 < PV < PV maximum`). La masquer à pleine santé et après la mort. Elle reflète
les dégâts partagés et reste lisible sans recréer l’encombrement des noms.
Cette barre est conservée en complément des effets de VIS-03 pour ce lot.

Critères : comparaison avant/après de la taille et de la facilité de visée ;
un tir inflige les mêmes dégâts qu’avant. Barre absente avant blessure, correcte
après plusieurs impacts, identique entre clients et retirée au décès/nettoyage.
Les éléments d’interface ne participent pas aux collisions de projectiles.
Repères : `src/graphics.js`, `src/insect-hits.js`, `src/client.js`, `src/scale.js`.

### BUG-01 — Double animation de tampon

Signalement : le tampon de validation présente une animation « en double ».
Reproduire puis rendre la validation visuellement unique et cohérente, sans
doubler signature, archive, son ou requête serveur. Couvrir les formulaires
d’embarquement, DCA, mutation/échange et les deux purgatoires.

Premier examen statique : `submitPaper()` active simultanément la classe
`stamping`, `paperStamp` et `stampEcho` ; leurs animations sont définies dans
`src/index.html`. Cela constitue une piste, pas une cause reproduite et prouvée.

Critères : une seule séquence de tampon par signature, sur réponse rapide ou
lente ; pas de tampon résiduel sur le document suivant ; retour d’erreur clair
et nouvelle tentative possible sans duplication de validation.

### BUG-02 — Signature bloquée lors d’un embarquement à plusieurs

Signalement : lorsque plusieurs joueurs rejoignent un appareil, il faut parfois
**effacer le formulaire avant de pouvoir signer**. Le parcours doit fonctionner
dès le premier trait valide, sans action préalable sur « Effacer ».

Reproduire à au moins deux clients entrant dans le même appareil, sur des sièges
différents et en concurrence sur le même siège. Examiner les transitions de
document/contexte, le canvas et ses coordonnées, les captures de pointeur, les
drapeaux d’envoi et les snapshots réseau. Aucun diagnostic de cause n’est encore
confirmé. Repères : `clearSignature()`, `renderPaper()`, `submitPaper()` et
gestion des entrées/sièges dans `src/client.js` et `src/server.js`.

Critères : plusieurs embarquements et signatures consécutifs sans effacement
manuel, y compris après refus, erreur réseau, fermeture/réouverture et changement
de siège. Ni signature d’un document précédent ni validation doublée. Vérifier
souris et toucher, et la concurrence réelle à deux clients.

### DIA-01 — Diagnostic du pistolet dans le bureau, correction différée

Signalement : à pied sur le bureau, le pistolet fonctionne de manière incohérente
et n’est pas utilisable correctement. L’utilisateur autorise une analyse, mais
demande de **laisser son fonctionnement inchangé pour l’instant**. Cette tâche
livre un diagnostic, pas un correctif ni une modification de l’équilibrage.

Premier constat statique : `pistol()` utilise la position et l’orientation de la
caméra comme origine et direction du raycast et du traceur. Ce n’est pas un tir
partant de l’arme du personnage. Vérifier l’effet en caméra troisième personne,
les obstacles entre caméra/personnage/cible, les unités `MAP.ratio`, la portée,
le réticule et les chemins d’entrée souris/clavier/tactile/manette. Ces points
sont des hypothèses à examiner, pas des causes affirmées.

Critères : consigner scénarios de reproduction, comportement attendu/observé,
preuves et causes confirmées ou hypothèses restantes ; séparer défaut de visée,
affichage, détection d’impact et application réseau des dégâts. Proposer ensuite
une ou plusieurs corrections avec leurs effets, sans les appliquer. Si le
Pointer Lock ou le rendu de contrôle empêche la reproduction, noter cette limite
et conserver l’incertitude. Les règles d’ARM-01 restent inchangées.

### VIS-03 — État de dégâts visible sur les insectes

Ajouter des effets visuels attachés à l’insecte blessé : par exemple fumée puis
flammes lorsque les dégâts deviennent plus importants. L’intensité dépend de la
**proportion de PV restants**, pour conserver un sens commun aux différents types.
Le choix précis des seuils et effets est laissé à l’implémentation, à documenter.
Conserver aussi la barre de PV de VIS-02. Ces effets indiquent l’état de dégâts,
sans ajouter de dégâts continus ni modifier la résistance.

Critères : pas d’effet sur un ennemi intact, progression visible sur plusieurs
niveaux de blessure, attachement correct pendant le déplacement, cohérence entre
clients et nettoyage au décès/changement de vague. Effets bornés pour éviter une
accumulation de particules et une dégradation importante de la fluidité.

### SON-02 — Chute des insectes volants en perdition

Au décès d’un moucheron ou autre insecte **volant**, accompagner son animation de
chute d’un son évoquant un avion en perdition. Le son suit le corps et respecte
distance, volume et muet. Il ne doit pas se redéclencher à chaque snapshot.
Les insectes terrestres ne sont pas automatiquement concernés.

**Option évoquée, non exigée** : explosion visuelle/sonore à la fin de la chute.
Si elle est retenue, la traiter comme un effet de présentation sans dégâts de
zone ni récompense supplémentaire ; ne pas la présenter comme une exigence déjà
arrêtée. L’éventuelle fin de chute doit être distinguée d’une disparition par délai.

Critères : un son par mort visible, position mis à jour pendant la chute, arrêt
et nettoyage à la suppression du corps ; morts simultanées sans fuite de sons.
L’écoute subjective et le rendu final doivent être vérifiés en partie.
Repères : corps en chute dans `src/client.js`, `src/audio.js`.

### VAG-01 — Apparitions périphériques loin de la corbeille

Signalement en première vague : des moucherons semblent apparaître juste à côté
de la corbeille. Garantir pour **toutes les vagues et variantes de trajet** une
apparition suffisamment éloignée de la cible, depuis les limites extérieures de
la pièce : murs, sol ou plafond. Une entrée au sol/plafond ne doit pas permettre
une apparition à proximité immédiate de la corbeille.

Définir et documenter une distance minimale d’apparition à la corbeille, adaptée
aux dimensions actuelles de la pièce. Contrôler la position **effectivement visible
au premier affichage**, pas seulement le premier point théorique du trajet.
Préserver une première vague facile et courte selon ÉQU-01 sans raccourcir son
trajet par une apparition près de la cible.

Premier examen statique : `src/routes.js` définit déjà des portails périphériques,
avec des chemins spécifiques `intro`/`short`. Ce constat ne reproduit pas le bug.
Examiner aussi l’avancement initial du trajet, les horloges et la phase de vague,
la connexion tardive et les conditions de visibilité dans `src/waves.js` et
`src/client.js`, ainsi que la cohérence avec l’arrivée calculée côté serveur.
Ne pas attribuer automatiquement le problème à la seule liste des portails.

Critères : vérifier vague 1, vagues suivantes et plusieurs graines, routes aériennes
et terrestres ; tous les points d’apparition respectent périphérie et distance.
Distinguer un vrai spawn d’un ennemi déjà en route découvert lors d’une connexion
tardive. Pas de téléportation ni d’arrivée serveur anticipée après correction.

### Suivi de ce lot

- 29 octobre 2026 : huit tâches ajoutées à partir des retours de partie ; premiers
  repères statiques consignés. Aucun bug reproduit en navigateur dans cette mise
  à jour, aucune fonctionnalité développée et aucune nouvelle publication du jeu.

## DEG-01 — PV ennemis et dégâts des mitrailleuses

| Type d’ennemi  | PV maximum |
| -------------- | ---------: |
| Moucheron      |        100 |
| Fourmi         |        100 |
| Voltigeur      |        200 |
| Cafard         |        300 |
| Carapace       |        400 |
| Bourdon blindé |        800 |

Les dégâts sont absolus : une balle de mitrailleuse inflige **75 dégâts de base**,
quel que soit le maximum de PV de la cible. Conserver les proportions de
résistance actuelles. Adapter ensemble le calcul, le transport et la validation
serveur : l’ancien plafond de dégâts 1–8 ne doit pas tronquer la nouvelle échelle.
Ne pas supprimer les améliorations existantes ni inventer une nouvelle courbe
d’amélioration ; documenter leur adaptation à la nouvelle unité lors de la livraison.

Critères : sans amélioration, un moucheron survit à une balle avec 25 PV et meurt
à la deuxième ; dix dégâts retirent dix PV à tous les types. Les PV/décès sont
cohérents entre clients et serveur. Vérifier les vagues et cibles de chaque type.

## DEG-02 — Impact direct et explosion de DCA

Un obus touchant directement un ennemi inflige **200 dégâts**, disparaît au
premier impact et ne produit **aucune explosion ni dégâts de zone**.
Sinon, l’éclatement programmé reste une attaque de zone pouvant toucher plusieurs
ennemis : **80 dégâts au centre**, décroissance progressive jusqu’à **20 au bord**,
et **zéro au-delà du rayon**. Conserver le réglage de distance d’éclatement et
la prise en compte existante des obstacles. Aucun cumul impact/explosion.

Critères : tester impact direct sur cible résistante et fragile, voisin indemne
lors d’un impact direct, plusieurs cibles dans une explosion, centre/bord/hors
rayon et obstacle. Un obus ne peut ni traverser une cible ni infliger deux fois
ses dégâts après suppression.

## JOU-01 — PV joueurs et tirs alliés

Chaque joueur dispose de **100 PV maximum**. Les tirs des autres joueurs peuvent
le blesser dans le bureau, le purgatoire et le super purgatoire. Une mort dans le
bureau conduit au purgatoire. Les transitions supplémentaires relèvent de PUR-01.
Chaque résurrection restaure **la totalité des PV**, y compris le retour du super
purgatoire au purgatoire classique. Tuer un joueur ne rapporte aucun dollar.

Critères : dégâts et décès partagés entre joueurs, une seule transition par mort,
100 PV après résurrection et aucune récompense monétaire pour une mort de joueur.

## ARM-01 — Pistolet personnel

Le joueur possède un pistolet dès le départ, utilisable à pied dans le bureau et
les deux purgatoires. Il inflige **10 dégâts par balle**, aux ennemis comme aux
joueurs. Munitions infinies, **aucun rechargement** et aucune limite de chargeur.
Tir **semi-automatique** : un appui déclenche un tir, maintenir le bouton ne tire
pas en rafale. **Aucun délai minimum entre deux appuis**.

Les armes personnelles sont totalement inutilisables dans un équipement, quel
que soit le siège. Les améliorations d’armement actuelles n’affectent pas ce
pistolet : il reste à 10 dégâts dans tous les mondes. Les améliorations propres
au purgatoire sont hors de ce lot.

Critères : dix impacts tuent une cible à 100 PV ; appuis rapides tous pris en
compte, maintien sans répétition, aucun rechargement. Tir impossible dans tous
les équipements ; accès rétabli à pied. Ne pas tirer lors des interactions avec
les interfaces de signature.

## PUR-01 — Super purgatoire et résurrections

Un joueur tué au purgatoire rejoint un **super purgatoire**, avec **super
Saint-Pierre**. Cet espace est réservé aux joueurs : aucune file de PNJ ennemis.
Le retour impose **cinq contrats beaucoup plus verbeux** que ceux du purgatoire
classique. Après les cinq signatures, retour au purgatoire classique à 100 PV,
avec le dossier classique entièrement à refaire avant retour dans le bureau.
Conserver les trois documents du dossier classique.

On peut se tirer dessus au super purgatoire. Y mourir fait réapparaître **dans
ce même super purgatoire**, à 100 PV, avec les cinq contrats à recommencer.
Ne pas créer de niveau supplémentaire. Les textes suivent TXT-02 ; la mécanique
peut être développée indépendamment puis raccordée au catalogue de variantes.

Critères : parcours bureau → purgatoire → super purgatoire → purgatoire → bureau,
cinq signatures puis trois, PV restaurés à chaque résurrection, remise à zéro du
dossier approprié après une mort, aucune récursion de mondes ni PNJ au super
purgatoire. Vérifier la cohérence multijoueur et la séparation des espaces.

## PUR-02 — Tir au purgatoire et libération des PNJ

**Supprimer les anciennes mécaniques de combat à mains nues** : coups, garde,
esquive de combat et KO/récupération associés. Ne pas remplacer le tir par une
simple nouvelle animation de l’ancien KO. Conserver les déplacements, collisions
et la file physique nécessaires au fonctionnement du lieu.

Les PNJ gardent les PV correspondant à leur type dans DEG-01 ; ils ne meurent
pas automatiquement en une balle. Un PNJ tué au purgatoire est **définitivement
libéré**, exactement comme après son acceptation par Saint-Pierre, et rapporte
**un dollar commun une seule fois**. Le service normal de Saint-Pierre reste une
autre voie de libération. Les PNJ libérés ne rejoignent pas le super purgatoire.

Critères : tir et service simultanés ne doublent jamais le dollar ; un PNJ libéré
ne retourne ni dans la file ni dans un autre purgatoire. Résistance conforme au
type, disparition des anciennes actions de mêlée et de leurs commandes/aides.
Les morts d’ennemis dans le bureau ne rapportent toujours pas directement de dollar.

## TXT-01 — Titre officiel et textes de lancement

Le nom officiel est exactement **« i am a moucheron »**. Revoir les titres et
textes visibles au lancement, et remplacer les formulations provisoires peu
soignées par des textes français cohérents au ton humoristique. « Flight Lab »
reste un ancien repère technique, pas le titre officiel affiché au joueur.
Préserver l’identité technique, l’URL, les données et l’audience du Site.

Critères : nom officiel cohérent dans l’accueil et les métadonnées visibles,
textes relus, consignes compréhensibles et cohérentes avec les commandes réelles.

## TXT-02 — Contrats humoristiques et variantes

Humour **bureaucratique et absurde** : clauses et décharges ridicules, obligations
impossibles et rivalités entre services célestes. Les clauses restent liées à
l’action et aux responsabilités exactes du poste ; pas de corps de contrat
générique ne changeant que le nom du siège.

Préparer **au moins 10 variantes par document et par contexte**, notamment pilote,
chaque poste de mitrailleur effectivement implémenté, DCA, purgatoire et super
purgatoire. Le bombardier actuel possède des postes dorsal et de queue ; citer
le poste ventral dans les idées ne demande pas d’ajouter un nouveau siège.
Inclure les futurs dossiers de changement/échange de poste lors de leur livraison.

Textes **écrits à l’avance**, aucun appel à une IA pendant la partie. Éviter la
répétition immédiate du même texte pour un même joueur dans un même contexte.
Les **cinq** documents du super purgatoire sont beaucoup plus verbeux que les
documents classiques, tout en restant lisibles et intégralement consultables.

Critères : catalogue comptable par document/contexte, variantes réellement
distinctes et propres au poste, pas de répétition immédiate, stabilité du texte
pendant une signature et aucune régression du parcours de signature à la souris
ou au toucher. Le volume de texte ne modifie pas le nombre de contrats requis.

## SON-01 — Son de machine à sous par dollar

Chaque dollar crédité déclenche une courte sonnerie de machine à sous entendue
par **tous les joueurs de la salle**, dans le bureau et les deux purgatoires.
Pour plusieurs dollars reçus ensemble, enchaîner brièvement une sonnerie par
dollar, sans les superposer. Respecter les réglages existants de volume et muet.
La source sonore (synthèse ou fichier) n’est pas imposée par cette spécification.

Critères : un gain de N dollars produit N sonneries chez chaque joueur présent,
sans doublon lors des rafraîchissements réseau. Aucun son de gain pour un achat,
une remise à zéro ou le simple chargement d’un solde déjà acquis.

## SIE-01 — Changement vers un siège libre

Dans un même appareil à plusieurs places, rejoindre un siège libre **au sol comme
en vol**, sans sortir de l’appareil, après signature d’un contrat du nouveau poste.
Le joueur conserve son poste actuel jusqu’à la signature et au transfert effectif.
Revalider la disponibilité au transfert ; ne jamais attribuer un siège à deux joueurs.

Si le pilote laisse le cockpit vide, l’appareil poursuit son vol selon sa physique,
**sans ajout de pilote automatique**, jusqu’à reprise des commandes ou crash.
Les contrats suivent TXT-02 lorsqu’il est livré ; cette tâche n’ajoute pas de poste.

Critères : pilote → mitrailleur et retour, au sol et en vol ; poste inchangé avant
signature ou en cas d’échec, contrôle/armement du nouveau poste après transfert,
concurrence entre deux demandes sur le même siège et comportement sans pilote.

## SIE-02 — Échange contractuel de sièges occupés

Le demandeur choisit un autre occupant du même appareil et signe d’abord sa
demande. L’autre joueur reçoit un contrat : **sa signature accepte l’échange**,
son refus le rejette. Les deux joueurs conservent leurs postes jusqu’aux deux
signatures ; les places sont ensuite échangées **simultanément**.

Un refus, un départ ou une déconnexion annule la demande sans déplacer personne.
Vérifier que les deux joueurs occupent encore les sièges concernés au transfert ;
une demande devenue invalide ne doit ni déplacer un tiers ni reprendre un siège.
Les textes doivent correspondre aux postes échangés et respecter TXT-02.

Critères : ordre des deux signatures, refus sans conséquence, annulation sur
départ/déconnexion, demandes concurrentes et transfert atomique des droits de
pilotage/tir. Aucun instant où un siège a deux occupants.

## Hors de ce lot

- Améliorations spécifiques des dégâts des joueurs au purgatoire : idée conservée
  pour une spécification ultérieure, pas une tâche prête.
- Nouveaux postes d’appareil, nouveaux modèles 3D ou packs audio : non demandés ici.
- Développement automatique planifié : aucune nouvelle automatisation à créer
  dans le cadre de cette mise à jour documentaire.

## Livraisons

- 29 octobre 2026 : backlog entériné par l’utilisateur ; toutes les tâches restent
  à développer. Aucun changement de gameplay dans cette livraison.

### Exécution du 29 octobre 2026 — livraison publiée

Les onze tâches sont implémentées et vérifiées dans cette livraison. Aucune tâche
prête ne reste à développer ; la section « Hors de ce lot » reste hors périmètre.
La publication est confirmée ci-dessous séparément de la complétion du code.

| Tâches | Vérifications effectuées                                                                                                                                        |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEG-01 | PV des six types ; 75 + 75 tuent une cible à 100 PV ; dégâts absolus ; doublons réseau ; vagues variées.                                                        |
| DEG-02 | Contact direct 200 sans souffle ; sécurité et obstacle ; centre 80, bord 20, hors rayon 0 ; balayage et suppression des projectiles.                            |
| JOU-01 | 100 PV, dégâts partagés, registre par incarnation, mort unique, restauration complète et aucune récompense joueur.                                              |
| ARM-01 | 10 dégâts fixes, dix tirs mortels, déclenchement sur appui (souris, clavier, tactile, manette), exclusion des équipements et formulaires.                       |
| PUR-01 | Bureau → classique → super → classique → bureau ; cinq puis trois signatures ; récidive au super ; mondes séparés et sans PNJ au super.                         |
| PUR-02 | Suppression de la mêlée ; PV propres au type ; disparition définitive ; dernier tir concurrent au service : un seul dollar.                                     |
| TXT-01 | Titre officiel dans le HTML, l’accueil et les métadonnées du Site ; commandes et aide relues.                                                                   |
| TXT-02 | 25 documents/contextes × 10 variantes = 250 ; textes propres aux postes ; stabilité pendant la signature ; exclusion de la variante précédente.                 |
| SON-01 | Compteur de récompenses distinct du solde ; un son par dollar, espacés de 290 ms ; baseline au chargement et absence de doublons.                               |
| SIE-01 | Transfert libre et retour pilote ; appareil en vol conservé ; physique neutre sans pilote ; état relayé seulement pour un cockpit vide ; concurrence exclusive. |
| SIE-02 | Demandeur puis destinataire ; affectations atomiques ; refus ; invalidation sur départ/déconnexion ; demandes concurrentes.                                     |

Suite `npm test`, formatage, assemblage, build et validation ESM de l’archive :
réussis. La suite comprend les nouveaux tests `test-backlog.mjs` et
`test-seat-contracts.mjs`, ainsi que les régressions historiques adaptées aux
règles remplacées. Aucun ancien test de mêlée n’est présenté comme preuve du
nouveau combat à PV.

Navigateur local : contrats pilote (deux signatures), embarquement, mutation
pilote → dorsal après signature, transition au super purgatoire, dossier de
cinq contrats, texte long défilable et signature accessible. Les positions de
certains parcours ont été préparées par des fixtures SQLite locales, retirées
des sources avant livraison. Les contrôles de concurrence et des deux signatures
d’échange passent par les routes Worker et une base SQLite, pas par deux humains.

Limites : rendu logiciel, Pointer Lock refusé par le navigateur de contrôle.
Le ressenti du pilotage/tir, l’écoute subjective, les écrans tactiles réels et
la fluidité WAN restent à observer en partie. Ces limites ne sont pas présentées
comme des validations effectuées.

Publication confirmée : **version 024**, le 29 octobre 2026.
Commit du code publié : `852b5fd7f1a4e2beb6c9a2c9c05cd78bdd58c8b1`.
Déploiement : `appgdep_6ae2f9e8baf08191863b870212757df7` — réussi.
URL : https://moucheron-flight-lab.jamain-simon.chatgpt.site
Cette confirmation documentaire est poussée après le commit du code ; elle ne
modifie pas les fichiers jouables de la version 024.

Contrôle après déploiement 023 : l’entrée dans une salle a dépassé le délai client
de cinq secondes (requête annulée, sans erreur SQL signalée). Correctif publié en version 024 : budget de connexion de 20 s, autres appels 10 s, et omission
du calcul de l’arène supérieure lorsqu’elle ne contient aucun joueur actif.
Les déplacements restent locaux, indépendants de ces temps HTTP.

Vérification en production de la version 024 : accueil et titre chargés, connexion
réussie à la salle de contrôle `QA024`, joueur en ligne et interface à pied avec
pistolet affichée. Aucune donnée des salles existantes n’a été remise à zéro.

## ÉQU-01 — Progression des vagues et du magasin

Demandée le 29 octobre 2026 après la livraison 024. État : **terminé, publié en version 025**.
Départ à six moucherons en moins de 50 secondes, budgets et ennemis résistants
progressifs, primes de fin de vague immédiates, premiers équipements à 4 $ et
prix par paliers. Référence : [progression](docs/progression.md).
Tests de courbe, achats accessibles, primes sans doublons, échec/reset et
concurrence et prix affiché devenu obsolète : réussis. Suite complète réussie.
Contrôle navigateur local : magasin 4/12/4/6 $, prime initiale de 4 $, achat du
moteur et passage au prix de 9 $. La fin de vague de ce contrôle a été préparée
dans la base locale de la salle de test ; les routes HTTP sont vérifiées par
la suite automatique. Rendu logiciel, ressenti du combat non mesuré.
Publication confirmée : version **025**, commit
`7cbedc9cb4e99d63d7d1112b7eda460dfcdac69d`, déploiement
`appgdep_6ae319b946288191a84fa4e8872a3cd8` réussi.
URL : https://moucheron-flight-lab.jamain-simon.chatgpt.site/
Les soldes et équipements des salles existantes sont conservés ; une nouvelle
partie permet d’évaluer le départ complet depuis la vague 1.

Contrôle publié 025 : salle `QA025` rejointe, magasin affichant les nouveaux
tarifs et la description des primes. L’indicateur réseau a signalé une connexion
instable durant ce contrôle ; il ne valide pas la fluidité WAN. Aucun test de
combat humain n’est revendiqué pour ce réglage.

## Livraison des retours après 025 — publiée en version 027

Les huit tâches sont traitées. DIA-01 est terminé comme **diagnostic uniquement** :
le pistolet conserve son fonctionnement. Sa correction ne fait pas partie de ce lot.

| ID     | Livraison et preuves                                                                                                                                                                                                                                 |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VIS-01 | Créations de noms flottants retirées ; identités conservées dans les interfaces. Tests de source et deux clients sur le même avion.                                                                                                                  |
| VIS-02 | Modèle et hitbox midge ×1,35 ; rayons échantillonnés avant/après, dégâts inchangés. Barres de PV partagés sans collision, bureau et PNJ du purgatoire.                                                                                               |
| VIS-03 | Fumée dès blessure, flammes à ≤30 % des PV ; objets bornés et réutilisés, retrait au décès/nettoyage. Tests des états, métadonnées serveur et exclusions des raycasts.                                                                               |
| SON-02 | Un son fini de chute par mort aérienne visible, suit le corps et s’arrête à l’impact/retrait ; tests audio de duplication, déplacement, polyphonie et muet. Écoute subjective non validée.                                                           |
| BUG-01 | Un seul effet de tampon, sans marques concurrentes, effacé au changement de document ; le retour serveur ne rejoue plus sa propre sonnerie.                                                                                                          |
| BUG-02 | Régressions rouges sur l’ancien code pour trait sans événements intermédiaires et ancien dossier ouvert avant ACK. Tests verts sur le nouveau code et vraie concurrence à deux clients : pilote gagné/refusé, puis embarquement dorsal sans Effacer. |
| DIA-01 | Trois défauts géométriques reproduits avec la fonction réelle inchangée ; [diagnostic](docs/pistol-diagnosis.md), propositions différées, pas de panne réseau affirmée sans preuve.                                                                  |
| VAG-01 | Tous portails périphériques à ≥3 m du décor de la corbeille ; entrée visible tenue 2 s incluse dans la durée de vague. 50 graines × cinq paliers, sol et air, et découverte tardive distincte sans téléportation.                                    |

Détails et limites : [retours de partie](docs/party-feedback.md). Les tests ciblés
et la suite historique passent. Le navigateur utilise le rendu logiciel et refuse
Pointer Lock ; le ressenti WebGL, le tactile physique, la manette et la fluidité
WAN ne sont pas revendiqués. Les placements du parcours à deux ont été préparés
uniquement dans la base locale de test ; six signatures réelles, cinq documents
archivés, aucune utilisation du bouton Effacer. Les fixtures ne sont pas livrées.

Publication confirmée : **version 027**, commit
`024d7dc354ae1b951c7b10340d22b4cd90217fa6`, déploiement
`appgdep_6ae3301774108191bc8bf8f67bda6fb4` réussi, le 29 octobre 2026.
URL : https://moucheron-flight-lab.jamain-simon.chatgpt.site/
Accueil publié ouvert dans le navigateur ; aucune remise à zéro des salles
existantes. Cette confirmation documentaire suit le commit du code publié.

## Nouveau lot — identification, contrats malicieux et logistique

Décisions validées dans la conversation puis ajout autorisé le 29 octobre 2026,
après la fin du travail de l’autre agent. Le lot a été implémenté après son enregistrement documentaire ; les preuves de
vérification et la référence de publication sont consignées ci-dessous.
Conserver les tâches et preuves des livraisons précédentes.

| ID     | Tâche                                                           | État    | Dépendances |
| ------ | --------------------------------------------------------------- | ------- | ----------- |
| VEH-01 | Couleurs distinctes et pseudos inscrits sur les véhicules       | terminé | —           |
| CON-01 | Refuser un contrat en le déchirant                              | terminé | —           |
| CON-02 | Feuillet malicieux et effets contractuels                       | terminé | CON-01      |
| LOG-01 | Réserves de carburant et munitions des avions                   | terminé | —           |
| LOG-02 | Stations de ravitaillement et achat de stations supplémentaires | terminé | LOG-01      |
| RAD-01 | Radars achetables et couverture de la carte                     | terminé | —           |

### VEH-01 — Couleurs distinctes et inscriptions des occupants

Chaque véhicule reçoit une couleur différente lors de son apparition. Répartir
les teintes successives sur la roue des couleurs en utilisant l’**angle d’or**
(environ 137,5° entre deux teintes), avec saturation/luminosité assurant une
identification lisible. La couleur est liée au véhicule et reste stable pendant
toute sa vie, indépendamment des embarquements et changements de pilote.
Les clients doivent voir la même couleur ; une reconnexion ne la réattribue pas.

Inscrire le **pseudo de chaque occupant près de son poste sur la carrosserie**,
avec mise à jour après entrée, sortie et échange de sièges. Il ne s’agit pas
de réintroduire des noms flottants : préserver la suppression de VIS-01.

Critères : plusieurs véhicules successifs de même type ont des teintes distinctes
et stables ; rendu identique entre clients et après reconnexion. Inscriptions
conformes aux places réelles, actualisées après transfert et supprimées au départ
de l’occupant, sans accumulation de textures ni obstruction de la visée.

### CON-01 — Déchirer un contrat pour le refuser

Permettre de **refuser un contrat en le déchirant**, avec une action explicite et
un retour visuel de déchirure. Conserver l’usage souris/toucher des formulaires.
Déchirer un document normal fournit un nouvel exemplaire toujours obligatoire
à signer ; cela n’efface pas les autres documents déjà validés.

Pour un dossier d’accès à un équipement, l’accès attend le traitement de tous
les feuillets : documents normaux signés et éventuel feuillet malicieux signé
ou déchiré. Un document déjà signé ne peut pas être déchiré pour annuler ses
conséquences. Aucun achat/accès/échange ne doit être accordé par le seul refus
d’un document normal. Conserver les annulations de dossiers et refus d’échange
déjà existants ; distinguer ces actions du remplacement d’un feuillet obligatoire.

Critères : déchirure d’un document normal sans perte de progression, remplacement
signable, refus d’un malicieux sans signature de celui-ci, et accès seulement
quand le dossier est complet. Vérifier double clic, signature/déchirure en
concurrence, erreur réseau et réouverture sans doublon ni retour du tampon double.

### CON-02 — Feuillets malicieux et effets réels

**5 % des dossiers d’accès aux équipements** contiennent **au maximum un feuillet
malicieux supplémentaire**, glissé parmi les documents classiques. Les autres
dossiers restent normaux. Cette probabilité est **par dossier**, pas par document.
Le feuillet supplémentaire ne remplace aucune signature obligatoire.
Le tirage et les conditions sont fixés une fois pour ce dossier : fermer/réouvrir
ou remplacer un document normal ne doit pas permettre de relancer le tirage.

La clause décrit explicitement son effet dans le texte humoristique du contrat,
**sans avertissement extérieur révélant le piège**. Le joueur peut la déchirer,
même après avoir signé les autres documents, tant qu’il n’a pas signé ce feuillet.
S’il le signe, l’effet est accepté et s’applique **au signataire pendant son
occupation du poste**, puis disparaît quand il le quitte. Ne pas transmettre
l’effet au prochain occupant ni l’appliquer aux autres postes de l’équipage.

Catalogue initial validé, tiré uniquement parmi les clauses compatibles :

| Clause                           | Effet                                                               |
| -------------------------------- | ------------------------------------------------------------------- |
| Essai de commandes à contre-sens | Commandes de pilotage totalement inversées, pour un pilote.         |
| Tourelle contrariée              | Deux axes de visée inversés, pour un mitrailleur ou servant de DCA. |
| Économie expérimentale de poudre | Dégâts de l’arme du poste divisés par deux.                         |
| Protocole de tir contemplatif    | Cadence de l’arme du poste divisée par deux.                        |

Première version limitée aux équipements : pas de malice dans les dossiers de
résurrection classique ou supérieure. Respecter le contexte de chaque poste et
la variété rédactionnelle de TXT-02 ; textes préécrits, sans IA appelée en partie.

Critères : probabilité et unicité vérifiées sur plusieurs dossiers/graines,
contenu stable à la réouverture, clauses compatibles et traitement partagé entre
clients/serveur. Déchiré : aucun effet. Signé : effet réellement observable sur le
poste concerné, fin à la sortie, mort ou changement de poste. Les autres armes,
occupants et pistolets ne sont pas affectés. Régression des accès et échanges
avec tous les documents classiques requis.

### LOG-01 — Carburant et munitions limités dans les avions

Les avions apparaissent avec leurs réserves pleines :

- **Carburant : cinq minutes à plein régime** pour tous les avions au départ.
  Consommation proportionnée aux gaz, nulle moteur coupé. À zéro, le moteur cesse
  de propulser ; l’avion conserve sa physique et son pilotage et peut planer.
- **Munitions : une minute de tir continu par poste armé**, convertie en nombre
  de balles selon la cadence normale du poste. Les canons jumelés d’un même poste
  partagent sa réserve ; chaque poste a son propre compteur. Un tir consomme les
  projectiles effectivement émis. À zéro, ce poste ne tire plus jusqu’au ravitaillement.

Ces réserves appartiennent à l’appareil : quitter/réoccuper un siège ou échanger
de place ne les remet pas à neuf. Afficher clairement carburant et munitions
restantes pour permettre de décider de revenir à la base.
**DCA et pistolet personnel restent à munitions illimitées.** Ne pas ajouter de
rechargement au pistolet ni de ravitaillement obligatoire des installations DCA.

Critères : cinq minutes mesurées à plein régime, consommation réduite aux gaz
partiels et nulle moteur coupé ; panne sèche sans arrêt artificiel du vol.
Une minute de tir continu avec la cadence normale épuise chaque réserve, compte
juste pour canons jumelés et plusieurs tireurs, pas de valeurs négatives. Vérifier
persistance sur changement de siège, reconnexion et relais de simulation.
Les contrats malicieux changent l’effet/cadence, pas le stock par simple signature.

### LOG-02 — Ravitaillement et stations achetables

La base commence avec **une station de ravitaillement gratuite**. Un avion doit
être **posé et complètement arrêté** dans son rayon de service pour se ravitailler.
Remplissage **automatique, progressif, gratuit**, sans stock limité de station.
Plusieurs avions peuvent en bénéficier simultanément.

**Dix secondes** permettent de remplir de zéro à plein le carburant et toutes
les réserves de munitions **en parallèle**. Chaque réserve partielle se complète
proportionnellement plus vite. Repartir ou quitter la zone interrompt le service
et conserve les quantités déjà récupérées. Un survol ne ravitaille pas.

Le marchand vend des stations supplémentaires, partagées par toute l’équipe :
première à **4 $**, puis **+2 $ par exemplaire supplémentaire acheté de ce type**
(4, 6, 8, …). La station initiale gratuite ne compte pas dans cette progression.
Prévisualiser le placement sur un support solide, comme pour la DCA ; refuser
chevauchement avec obstacles ou équipements et prévoir une zone de service
dégagée pouvant accueillir un avion. Adapter le rayon au plus grand appareil.

Critères : station initiale disponible, prix successifs et achats concurrents
sans double dépense ; placement valide/refusé et partagé. Mesurer remplissage
complet/partiel, interruption, retour et plusieurs avions. Pas de ravitaillement
en vol, en mouvement ou hors zone ; aucune duplication par reconnexion ou
chevauchement des rayons de stations. Les réserves ne dépassent jamais leur maximum.

### RAD-01 — Radars et couverture des ennemis sur la carte

Ajouter le **radar** au marchand comme installation plaçable et partagée.
**Aucun radar n’est installé au démarrage.** Sans couverture, la carte affiche
toujours décor, alliés et installations, mais **aucun ennemi**.
Les ennemis restent naturellement visibles dans la scène 3D : aucun effet de
furtivité ni masquage du monde, des PV ou des dégâts visuels.

Chaque radar révèle à toute l’équipe les ennemis **volants et terrestres** dans
une **sphère de rayon un mètre réel**, en unités du décor, sans obstruction par
le mobilier pour cette première version. Les contacts quittant la couverture
disparaissent de la carte, sans dernière position conservée. Plusieurs radars
étendent la couverture par union de leurs sphères, sans multiplier les contacts.

Prix : premier radar **4 $**, puis **+2 $ par radar supplémentaire acheté**
(4, 6, 8, …), indépendamment du nombre de stations de ravitaillement.
Placement avec prévisualisation sur support solide, refus des chevauchements
avec obstacles ou autres installations, selon le principe existant de la DCA.

Critères : carte sans ennemis avant achat, alliés toujours visibles, prix et
placement partagés. Vérifier portée réelle de 1 m en trois dimensions, frontière
dedans/dehors, sol/air et mobilier non bloquant. Deux radars révèlent leur union
sans doublon ; sortie de couverture, mort et changement de vague nettoient les
contacts. Tous les joueurs voient la même détection, même après reconnexion.

### Suivi de cette volée

- 29 octobre 2026 : six tâches validées enregistrées, avec dépendances et critères
  de validation. Aucun développement lancé dans cette livraison documentaire.

### Livraison du lot identification, contrats et logistique

Les six tâches sont implémentées et vérifiées. Référence détaillée :
[logistique et contrats](docs/logistics-contracts.md). Migration additionnelle
`0011_logistics_contracts.sql`, sans remise à zéro des salles publiées.

| ID     | Réalisation et vérification                                                                                                                                          |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VEH-01 | Numéro persistant, angle d’or, peintures communes et plaques sur coque ; meshes et nettoyage des textures vérifiés                                                   |
| CON-01 | Déchirure animée, remplacement normal, maintien des signatures ; vrai gestionnaire testé avec double action et erreur, parcours navigateur exécuté                   |
| CON-02 | Jeton/tirage persistants, 5 % par dossier, clauses compatibles, choix atomique, effets limités au poste ; accès et transferts couverts                               |
| LOG-01 | Carburant 300 s, 1 000 balles chasseur et 667 par mitrailleur ; temps réel simulé sur routes Worker, débit idempotent, stocks indépendants, reconnexion et transfert |
| LOG-02 | Station gratuite, plein parallèle 10 s, critères de service, plusieurs appareils, achats et pose contrôlés                                                           |
| RAD-01 | Achat propre au type, absence de contacts sans radar, sphères 1 m en union, alliés et scène préservés                                                                |

La suite complète, le formatage, l’assemblage et la validation de l’artefact sont
exécutés avant publication. Les résultats de déploiement sont ajoutés après
confirmation native. Les tests historiques utilisent une fixture de dossiers
ordinaires ; la suite du nouveau lot exerce séparément la probabilité et les
clauses. Le diagnostic différé du pistolet reste inchangé.

Limites : rendu logiciel et Pointer Lock refusé dans le navigateur cloud ; WebGL,
commandes inversées en vol, toucher physique et ressenti WAN à vérifier en partie.
Chaque projectile d’avion attend son autorisation HTTP ; cela ajoute de la latence
et peut regrouper les apparitions sur une connexion lente. Les tests de cadence
portent sur les intervalles nominaux, pas sur un benchmark WAN.

### Reprise et publication confirmée — version 028

Le 29 octobre 2026, reprise demandée par l’utilisateur après l’arrêt apparent de
l’agent précédent. Le dépôt était propre : les six tâches étaient déjà
implémentées et poussées, mais aucune version de ce lot n’avait été enregistrée
ni publiée ; la dernière version jouable était 027.

Vérifications relancées sur le commit existant : `npm test`,
`npm run format:check`, `npm run build` et `node scripts/validate-artifact.mjs` :
réussies. Aucun nouveau changement de gameplay nécessaire pour cette reprise.
Les limites WebGL, Pointer Lock et latence des autorisations HTTP de tir décrites
ci-dessus restent applicables ; aucun nouveau contrôle navigateur ou benchmark
WAN n’est revendiqué lors de cette reprise.

Publication confirmée : **version 028**, commit du code
`51f915331ecca77deb638161db99e74f03baacdb`, déploiement
`appgdep_6ae352b3b8648191a0b5f6eb55811799` — réussi.
URL : https://moucheron-flight-lab.jamain-simon.chatgpt.site/
Cette confirmation documentaire est poussée après le commit publié et ne
nécessite pas une seconde publication. Recharger les clients pour utiliser les
nouvelles règles ensemble. Le pistolet reste inchangé conformément au périmètre
du diagnostic différé DIA-01.

## QUAL-01 — Refactoring ciblé et fiabilité des tirs/réserves

Demandé le 29 octobre 2026. État : **terminé, publié en version 029**.

- Extraction de `AircraftFire` dans `src/aircraft-fire.js` : limitation des requêtes
  en cours, identifiants de tirs et invalidation des réponses devenues obsolètes.
  Le client conserve la géométrie, la vitesse héritée et le calcul des impacts.
- Réponses HTTP tardives ignorées après mort, changement de vague ou de poste,
  sortie puis retour au même siège. Les erreurs libèrent la capacité d’envoi.
- Horodatage des réserves rendu monotone pour qu’une requête retardée ne fasse
  pas recompter un intervalle de carburant ou de ravitaillement.
- Aucun changement de prix, capacités, dégâts, cadence ou dossier. La correction
  du pistolet reste différée. L’aller-retour HTTP avant un projectile est conservé.

Les régressions du carburant et du tir après changement de vague ont été
reproduites sur l’ancien code. Les tests passent après correction, dont le vrai
point d’entrée de tir client avec des réponses différées, les erreurs, réponses
hors ordre, stocks révisés et invalidation d’une ancienne occupation. La suite
complète `npm test` a réussi. La livraison complète et ses limites sont confirmées
ci-dessous après les contrôles et la publication.

Contrôles complémentaires réussis : formatage, build, validation ESM de
l’artefact, et service du nouveau module dans le graphe d’assets versionnés.
Navigateur local : accueil puis connexion à la salle de test `QAREFACTOR`,
interface à pied et état « EN LIGNE » ; aucune erreur JavaScript du jeu observée.
Ce parcours vérifie le chargement du client, pas le ressenti des tirs en vol,
la fluidité WAN ou la qualité graphique WebGL. Les courses réseau sont exercées
par les réponses différées des tests, pas reproduites sur une connexion réelle.

Publication confirmée : **version 029**, commit du code
`aa1f0b4dcb8571ae82bfa27d4377c6205016d06f`, déploiement
`appgdep_6ae36338791c8191bcdf1f019dcb44a1` — réussi.
URL : https://moucheron-flight-lab.jamain-simon.chatgpt.site/
Cette confirmation documentaire suit le commit publié et ne modifie pas
l’artefact jouable. Aucun changement de schéma ni remise à zéro des salles.

## BUG-03 — Régression de latence des tirs depuis la version 028

Signalée le 29 octobre 2026. État : **terminé, publié en version 030**.
Cause reproduite dans le vrai point d’entrée client : création du projectile
uniquement après réponse HTTP. La version 029 sécurisait cette réponse tardive
mais conservait l’attente ; QUAL-01 ne corrigeait donc pas cette régression.

Correction : tir, son et trajectoire immédiats, consommation prédite localement,
débits serveur regroupés toutes les 250 ms en arrière-plan plutôt qu’une requête
bloquante par balle. Stocks par poste conservés, rapprochement par révision,
identifiants idempotents et reprise sur erreur réseau. Les confirmations tardives
ne créent plus aucun projectile. Les prix, capacités, dégâts et cadences nominales
restent inchangés, ainsi que le diagnostic différé du pistolet.

Le test `node scripts/test-aircraft-fire.mjs` échouait avant correction avec
« the projectile must appear before the HTTP response » (0 au lieu de 1).
Il passe après correction, y compris quatre tirs immédiats avant toute réponse,
un seul lot de quatre débits, tirs poursuivis pendant une réponse retenue,
épuisement local, file bornée, nouvelles tentatives avec les mêmes identifiants
et absence de tirs doublés après mort/changement de vague. Les tests Worker
vérifient les lots concurrents sans double débit et les rapports invalides.
La suite complète passe. Les effets réseau sont simulés de façon déterministe ;
aucun benchmark WAN ni validation du ressenti WebGL n’est revendiqué.

Simulation complémentaire : 1 000 tirs prédits consomment exactement 1 000 balles,
avec 250 rapports de quatre tirs plutôt que 1 000 requêtes unitaires ; le tir
suivant est refusé à stock nul. Formatage, build et validation ESM réussis.
Navigateur local : accueil et connexion à `QATIRS`, interface à pied en ligne,
aucune erreur JavaScript du jeu observée. La réactivité des tirs en vol est
vérifiée par le test client à réponses retenues, pas par le parcours navigateur.

Publication confirmée du correctif : **version 030**, commit du code
`fdf9d3ef14c6841818fd96847f40a7cbf9e4c635`, déploiement
`appgdep_6ae3678b199c8191a9f2c69a2eabacc3` — réussi.
URL : https://moucheron-flight-lab.jamain-simon.chatgpt.site/
Recharger tous les clients pour bénéficier du tir immédiat. Le serveur conserve
la compatibilité des rapports unitaires des anciens clients, qui restent soumis
à leur ancienne attente avant émission tant qu’ils ne sont pas rechargés.
Aucune migration ni remise à zéro. Cette confirmation documentaire suit le commit
publié sans modifier son artefact.

## NET-01 — Serveur en RAM et gameplay UDP obligatoire

**État : terminé pour le code ; déploiement VM restant.** Autorisé le 29 octobre 2026. Aucun Docker dans ce lot. Aucun serveur externe provisionné.

Nouveau runtime Node (`npm start` / `npm run dev`) avec `node-datachannel`,
connexions navigateur–serveur et état uniquement dans des Map/Set en mémoire.
Aucun SQLite ni adaptateur SQL. Redémarrer efface les parties. Le serveur Node
refuse les routes HTTP de gameplay ; HTTP sert les assets, la santé et le SDP.
Aucun WebSocket ni repli TCP/HTTP. Les clients sans UDP confirmé sont refusés.

Mouvements à 20 Hz non ordonnés sans retransmission ; commandes fiables avec
identifiant, résultat d'exécution, cache borné et refus des identifiants déjà
traités après éviction. La connexion fournit l'identité. Les positions sont
protégées par incarnation et génération d'occupation. Les tirs restent prédits
sans attendre le serveur. Les PNJ sans hôte progressent à chaque tick de salle.
Nettoyage des salles inactives, corps détruits et âmes libérées ; snapshots limités
aux 24 PNJ matérialisés. Guide : [serveur UDP](docs/udp-server.md).

Vérifications : tests domaine RAM (achats, signatures, sièges/échanges, dégâts,
réserves, mondes et reset), contrat navigateur avec pair simulé (refus TCP et
absence de repli HTTP), deux clients natifs réellement reliés sur UDP local,
confirmations/rejeu, positions désordonnées et négociations interrompues.
La suite complète historique + RAM/UDP passe. La revue a conduit à ajouter le
cloisonnement des anciennes positions après mutation, à corriger la libération
des négociations interrompues et à borner/nettoyer les registres.
Navigateur de prévisualisation : accueil chargé, tentative de connexion puis
refus UDP explicite sans repli. Le parcours de partie navigateur/VM reste à tester.

Le Site public continue à utiliser la version Worker/D1 historique jusqu'à la
bascule sur VM. Les sources de compatibilité et migrations D1 restent présentes ;
le serveur Node ne les charge pas. Les tests locaux ne constituent pas une
mesure de latence WAN ni une validation des NAT ou du dimensionnement VM.
Prochaine étape d'exploitation : déployer Node derrière HTTPS, ouvrir les ports
UDP configurés et tester deux navigateurs sur des réseaux distincts.

## DEP-01 — Image Docker pour VM

**État : terminé pour l’archive et les sources ; installation Docker/WAN à vérifier.**
Autorisé le 29 octobre 2026 après NET-01. Image Linux AMD64
`i-am-a-moucheron:2026.10.29-udp.1`, archive Docker importable, Compose minimal,
variables d’environnement et override Traefik pour le réseau externe existant.
Dockerfile reproductible sur base officielle Node 24 Bookworm Slim épinglée par
digest. Aucun volume ni base de données ; l’état de jeu reste en RAM.

Vérifications : empreintes de toutes les couches/configuration de l’archive,
syntaxe YAML, chargement du runtime natif et test WebRTC réel à deux clients avec
le Node et les fichiers extraits de l’image. UDP confirmé ; HTTP gameplay refusé.
Pas de daemon Docker dans l’environnement : import Docker, démarrage Compose,
healthcheck en conteneur et accès WAN restent à vérifier sur la VM. Aucun registry
externe publié. Installation et récupération : [guide Docker](docs/docker.md).
Le Site public historique n’est pas modifié.

## Nouveau lot — pilotage, véhicules et banque (29 octobre 2026)

Décisions validées après NET-01 et DEP-01. Implémentation des mécaniques côté Node et vérification des sources effectuées ;
les interfaces définitives ont été validées et intégrées (voir le suivi ci-dessous). Préserver les livraisons
précédentes et confronter ces demandes aux sources avant développement. Les
valeurs d’équilibrage non fixées ci-dessous sont à choisir et documenter lors de
l’implémentation. La confirmation des écrans est acquise ; aucune nouvelle
validation utilisateur ne conditionne l’exécution de ce lot.

| ID     | Tâche                                              | État    | Dépendances                    |
| ------ | -------------------------------------------------- | ------- | ------------------------------ |
| PIL-01 | Zoom temporaire au clic droit                      | terminé | —                              |
| DCA-01 | Distance de tir et affichage près du viseur        | terminé | —                              |
| VAG-02 | Allonger les parcours ennemis                      | terminé | VAG-01                         |
| VEH-02 | Cycle des véhicules de départ et achetés           | terminé | —                              |
| VEH-03 | Stuka et bombes pilotées                           | terminé | VEH-02, LOG-02                 |
| VEH-04 | Tank à trois postes indépendants                   | terminé | VEH-02, LOG-02                 |
| SIE-03 | Cercles d’accès par poste                          | terminé | SIE-01, BUG-02                 |
| VIS-04 | Animation de crash                                 | terminé | VEH-02                         |
| ECO-01 | Banquier et trois contrats amortissables           | terminé | —                              |
| HUD-01 | Repères latéraux contextuels et annonces discrètes | terminé | DCA-01, VEH-03, VEH-04, ECO-01 |

### PIL-01 — Zoom temporaire

Maintenir le clic droit zoome dans tous les postes pilotables : avion, tourelle
d’avion, DCA et nouveaux équipements compatibles. Relâcher restaure la vue.
Critères : zoom sans tir parasite ni menu contextuel ; sortie, mort ou changement
de poste nettoient l’état ; comportement cohérent avec la capture du pointeur.

### DCA-01 — Distance et viseur

Shift augmente la distance d’explosion, Ctrl la diminue. Afficher près du curseur
de tir la distance en **mètres réels du décor** et une petite jauge entre portée
minimale et maximale. Éviter de devoir regarder un coin de l’écran pour régler
la distance. Ces touches sont contextuelles : elles sélectionnent les obus dans
le tank, sans modifier une distance de DCA.
Critères : limites respectées, conversion d’unités correcte, jauge et valeur
synchronisées avec la distance réellement utilisée pour l’explosion.

### VAG-02 — Circuler dans la pièce avant l’approche

Conserver les apparitions périphériques validées et la vitesse actuelle, notamment
celle des moucherons. Allonger les trajets de **tous** les ennemis par des détours,
virages et variations d’altitude adaptées aux ennemis aériens ; parcours adaptés
au sol pour les terrestres. Éviter une approche directe laissant trop peu de temps
pour intervenir. Préserver une première vague facile et raisonnablement courte.
Critères : trajets praticables sans traverser le mobilier, temps d’intervention
accru à vitesse comparable, cohérence de l’arrivée et des dégâts entre clients
et serveur, connexion tardive et plusieurs vagues/graines vérifiées.

### VEH-02 — Véhicules illimités et exemplaires achetés

Les véhicules de départ restent renouvelables sans limite après destruction.
Les équipements/véhicules supplémentaires achetés ou débloqués apparaissent une
fois par achat : destruction définitive de cet exemplaire, sans réapparition
automatique. Un nouvel achat peut fournir un nouvel exemplaire. Quitter un
véhicule ne le détruit pas : il reste sur place et peut être réoccupé avec ses
réserves conservées. Appliquer cette distinction aux avions et au tank.
Critères : pas de duplication, réinitialisation des stocks par siège ou achat
concurrent ; règles visibles et partagées, y compris après reconnexion.

### VEH-03 — Stuka spécialisé dans l’attaque au sol

Différencier réellement l’avion supplémentaire de l’avion initial : silhouette de
Stuka, plus lent et moins maniable, rôle d’attaque au sol complémentaire au combat
aérien du premier avion. Le pilote peut larguer des bombes dès la prise du poste,
y compris dans le bombardier actuellement dépourvu de cette action. Largage
possible à plat, mais le piqué améliore nettement précision ou efficacité.
Stock de bombes limité et délai entre deux largages ; capacités, délai et bonus
à équilibrer/documenter. Les stations classiques LOG-02 rechargent les bombes
comme toutes les munitions : aucun achat de recharge spécifique ni restriction
aux intervagues. Conserver leurs conditions de service et leurs durées.
Critères : commande pilote utilisable, trajectoire/impact/dégâts partagés sans
doublon, stock persistant dans l’appareil, refus à vide, délai et ravitaillement
corrects ; différence de rôle observable contre les ennemis au sol.

### VEH-04 — Tank, trois postes indépendants

Aucun poste n’est obligatoire : sans pilote les tireurs peuvent tirer ; seul,
le pilote peut conduire et tirer. Postes :

- Pilote : conduite et mitrailleuse légère vers l’avant.
- Tireur principal : canon à obus explosifs ou perforants et mitrailleuse coaxiale.
- Mitrailleur supérieur : mitrailleuse à 360°, plus puissante que celle du pilote,
  comparable à celle de l’avion monoplace initial.

Toutes les munitions sont limitées et attachées au véhicule. Chaque mitrailleuse
possède sa réserve, dimensionnée pour environ **1 min 30 s** de tir continu.
Le canon possède **deux réserves distinctes**, chacune dimensionnée pour environ
**une minute** de tir continu à cadence normale : explosifs et perforants.
Shift sélectionne les explosifs, Ctrl les perforants. À épuisement du type actif,
basculer automatiquement sur l’autre s’il en reste ; sinon interdire le tir.
Afficher type actif et stocks. Les stations habituelles rechargent toutes les
réserves. Équilibrer et documenter les effets distincts des deux types d’obus.
Critères : trois postes utilisables indépendamment et simultanément, déplacements
et visée partagés, stocks indépendants sans valeurs négatives, sélection et
bascule fiables, persistance après sortie/échange/reconnexion et recharge complète.

### SIE-03 — Cercles au sol par place libre

Pour chaque place disponible d’un véhicule ou équipement, afficher un cercle
accessible au sol avec une icône de rôle. Approcher le cercle du poste choisi,
signer le dossier et embarquer directement, sans passer en mode clic pour choisir
un rôle dans une liste. Plusieurs joueurs peuvent rejoindre des postes différents
en parallèle. Adapter notamment bombardier et tank ; conserver les contrats.
Critères : place occupée indisponible, attribution atomique en concurrence,
cercles lisibles et accessibles autour des appareils, signatures sans effacement
préalable, sortie/changement de siège et libération des places cohérents.

### VIS-04 — Crash visible

Remplacer la disparition peu marquante par une vraie séquence : chute visible,
impact, son, fumée et débris. Conserver le parcours de mort/purgatoire du joueur,
et appliquer VEH-02 pour la disponibilité de l’appareil après destruction.
Critères : une seule séquence partagée par destruction, aucun dégât/récompense
supplémentaire créé par les effets, nettoyage borné des corps/particules/sons,
caméra et commandes correctement libérées pour tous les occupants.

### ECO-01 — Trois emplacements de contrats au banquier

Banquier accessible **à tout moment**. Il présente toujours trois emplacements,
chacun contenant soit une offre vierge à signer, soit le contrat signé en cours.
Signer démarre le prêt et crédite son montant. Maximum trois prêts simultanés.
Une offre non signée reste identique aux visites suivantes. Un contrat entièrement
remboursé est remplacé par une nouvelle offre potentiellement différente.

Chaque offre indique montant, taux fixe, durée en **nombre de vagues**, échéance
constante et coût total. Prêt amortissable classique : chaque échéance de fin de
vague comprend intérêts sur le capital restant dû et remboursement de capital.
Permettre le remboursement anticipé. Choisir/documenter montants, taux et durées.
Les prélèvements peuvent faire passer le solde en négatif et continuent dans ce
cas ; **aucun nouvel emprunt n’est possible avec un solde négatif**. La dette
complique les futurs achats, sans empêcher les prélèvements prévus.

Critères : tableau d’amortissement correct, arrondis et dernière échéance soldant
le capital, une seule échéance par fin de vague, pas de double crédit/signature,
maximum trois contrats même en concurrence, offres stables, remplacement après
remboursement normal ou anticipé, solde négatif partagé et emprunt refusé.
Présenter dans le dossier signé le capital restant et les vagues restantes.

### HUD-01 — Interface adaptée au poste et moins invasive

Annonces centrales actuelles trop encombrantes : état de vague discret pendant
le combat et notifications brèves lors des changements importants.
Direction validée : **repères latéraux contextuels**, sous forme de rails fins,
semi-transparents et compacts, dont les détails se déploient brièvement lors d’un
réglage, changement d’arme ou événement. Adapter le contenu au poste occupé.
Pour le pilote : vol/carburant à gauche, armes/munitions à droite ; pour une
tourelle : réglages/portée d’un côté, armement de l’autre. Garder distance, jauge
de portée et informations essentielles de visée près du curseur sans saturer le
centre. Les écrans et variantes ont été confirmés (voir le suivi) ; les
évolutions conformes à cette direction sont réalisées et vérifiées par l’agent.
Critères : lisibilité en combat, aucune grande bannière persistante « attaque en
cours », informations utiles accessibles sans masquer la cible, variantes avion,
bombardier, DCA et trois postes du tank ; stocks et changements automatiques
correctement reflétés, absence de régressions des menus et contrats.

### Suivi du nouveau lot

29 octobre 2026 : cadrage validé puis ajout au backlog autorisé explicitement.
Aucun développement ni publication de ces fonctionnalités dans cette livraison.
Validation documentaire : cohérence des décisions, identifiants et dépendances ;
les valeurs d’équilibrage non fixées restent à régler lors des tâches concernées.

### Livraison des mécaniques et validation des écrans

Le 29 octobre 2026 : mécaniques PIL-01, VAG-02, VEH-02/03/04, SIE-03 et VIS-04
implémentées sur Node RAM/UDP. Les changements partagés de physique/catalogue
sont couverts par les tests historiques et les nouveaux tests métier ; les
nouvelles routes d’armes lourdes et de banque ciblent Node, pas le Worker D1.

DCA-01 : touches contextuelles et valeur en mètres réels livrées ; jauge au
curseur en attente de HUD-01. ECO-01 : domaine, offres stables, crédit, débits,
remboursement et API terminés ; guichet joueur/signature graphique en attente de
validation de l’écran. HUD-01 : maquette interactive comprenant chasseur, Stuka,
bombardier, tourelle, DCA, trois postes du tank et banque :
[écrans à valider](docs/ui-review.html). Le HUD définitif n’est pas remplacé.

Cette attente applique l’instruction du présent backlog : « Proposer les écrans
et variantes pour confirmation avant leur réalisation. » La prochaine étape
nécessitant l’utilisateur est cette confirmation ; aucune autre mécanique n’est
volontairement laissée à implémenter dans les sept tâches indiquées terminées.
Les valeurs et règles livrées sont décrites dans [véhicules et banque](docs/vehicles-bank.md).

Vérifications : suite complète passée, tests métier additionnels pour les
centimes et amortissements, la dette, les débits uniques, achats et destruction,
réserves, bascules, clauses malicieuses, bombes/obus, accès de rôle, conduite,
parcours de plusieurs graines et crashs horodatés/nettoyés. Deux clients natifs
confirment UDP, y compris un largage de bombe réel sur la route serveur.
Revue : clés de coaxiale, teintes du tank, physique sans pilote, clauses et
crashs de connexion tardive corrigés ; collisions lourdes optimisées par présélection.

Navigateur : maquettes et variantes consultées ; la partie WebGL/UDP sur VM reste
à tester. Aucun déploiement public sur le backend historique. Le Dockerfile sait
construire le nouveau code, mais le paquet `2026.10.29-udp.1` remis précédemment
reste inchangé. Une nouvelle archive complète suivra la validation et le
raccordement des écrans, afin de ne pas présenter la banque comme déjà jouable.

### Intégration des écrans validés

29 octobre 2026 : validation explicite des écrans par le propriétaire, puis
intégration de DCA-01, ECO-01 et HUD-01. Le lot de dix tâches est terminé. Les
notes d’attente ci-dessus décrivent l’étape précédente et sont levées.

HUD : rails par poste avec détails temporaires et consultation au survol/focus,
jauge DCA en mètres du décor au viseur, annonces compactes. Banque : bouton/N
dans tous les mondes/postes, trois emplacements, lecture, tableau complet,
signature manuscrite et remboursement anticipé, archivage après confirmation.
Les commandes sont neutralisées pendant les menus. Documents périmés par un
reset ou une échéance refusés côté interface et serveur ; pas de double crédit.

Tests : suite complète, nouveaux tests des vrais gestionnaires UI, compilation
et validation ESM ; signature d’une offre dans le composant navigateur de
démonstration. Rendu WebGL et partie WAN restent à vérifier sur la VM.
Sources poussées ; Site public Worker historique inchangé. Livraison VM via
le nouveau paquet Docker `2026.10.29-udp.2`, suivant le guide Docker.

## Nouveau lot — retours terrain, chutes et réapparition (29 octobre 2026)

Cadrage validé puis intégration au backlog explicitement autorisée. Les tâches
ci-dessous sont **prêtes**, non implémentées dans cette livraison documentaire.
Les lots précédents et leurs validations sont conservés. **BUG-04 est prioritaire.**
Cette demande autorise désormais la correction du pistolet auparavant différée
par DIA-01. Les nouvelles valeurs remplacent les anciennes uniquement une fois
les tâches correspondantes livrées ; la documentation actuelle décrit encore le
comportement existant. Pas de nouvelle image Docker demandée : livrer les sources.

| ID     | Tâche                                                    | État    | Dépendances |
| ------ | -------------------------------------------------------- | ------- | ----------- |
| BUG-04 | Embarquement fiable dans tous les postes — priorité      | terminé | —           |
| ARM-02 | Corriger le pistolet et la visée à la troisième personne | terminé | —           |
| BUG-05 | Diagnostiquer et réduire le délai après E                | terminé | —           |
| HUD-02 | Supprimer le chevauchement en haut à gauche              | terminé | —           |
| CHU-01 | Chute réaliste, dégâts et parachute progressif           | terminé | —           |
| RES-01 | Réapparition par défaut au départ après purgatoire       | terminé | —           |
| LIT-01 | Lits achetables et contrats personnels de réapparition   | terminé | RES-01      |
| VAG-03 | Préparation d’une minute, passage anticipé conservé      | terminé | —           |
| CAM-01 | Lunette du tank et observation temporaire avec C         | terminé | —           |
| VIS-05 | Affiner le Stuka et la bombe                             | terminé | —           |
| ECO-02 | Taux de prêt de 10 à 20 % par vague                      | terminé | —           |

### BUG-04 — Accès aux postes autres que pilote

Observation : sur les véhicules à plusieurs emplacements, seul le poste pilote
semble réellement fonctionner. Les autres proposent la validation mais l’accès
est peu fiable. Reproduire avant de conclure sur la cause ; revoir le parcours
cercle → rôle → contrat → validation → attribution/occupation effective.
Critères : pilote et chaque poste de bombardier/tank accessibles dès la première
signature ; plusieurs joueurs sur des places différentes et concurrence sur une
même place sans duplication ni blocage. Vérifier refus, nouvelle tentative,
sortie/retour, échange et reconnexion. Documenter cause confirmée, correction et
limites des vérifications. Ne pas considérer l’affichage du bouton comme preuve
que l’embarquement a réussi.

### ARM-02 — Pistolet cohérent avec le personnage et le viseur

Observations : tirs dans le dos, pistolet désaligné du bras, corps masquant le
viseur. Corriger effectivement ces défauts ; DIA-01 n’est plus limité au diagnostic.
Conserver une **caméra à la troisième personne**, légèrement au-dessus de l’épaule.
Arme/bras alignés, réticule dégagé ; viser le point sous le réticule mais faire
partir le projectile du canon. Un obstacle entre arme et cible bloque le tir,
même si la caméra voit derrière. Ne pas tirer à travers le corps ou le mobilier.
Critères : orientations et distances variées, caméra près des murs, cibles proches,
obstacles caméra/personnage/cible, animation du bras et trajectoire cohérentes ;
dégâts partagés sans double impact. Vérifier les mondes où le pistolet est permis.

### BUG-05 — Délai entre E et apparition de l’empreinte

Observation : latence parfois importante après l’appui sur E avant l’apparition
de l’empreinte. L’utilisateur demande d’en connaître la cause ; ne pas attribuer
sans preuve ce délai au serveur. Mesurer les étapes d’entrée, interaction,
préparation de document/empreinte, échanges réseau et premier affichage. Expliquer
les échanges réellement nécessaires, supprimer attentes/allers-retours évitables
et assurer un retour visuel rapide sans valider localement un droit non accordé.
Critères : mesures avant/après sur le parcours concerné, réponse rapide/lente,
échec et répétition de E ; pas de double document, signature ou attribution.
Consigner cause confirmée, résultat mesuré et incertitudes WAN restantes.

### HUD-02 — Encombrement en haut à gauche

Corriger la superposition monnaie, clé d’équipement et accès au banquier.
Préserver les repères contextuels validés. Critères : éléments distincts et
utilisables dans les différents postes/mondes, avec grands montants, textes
variables et tailles d’écran différentes ; menus et compte à rebours non masqués.

### CHU-01 — Chute, impact et parachute

Rendre la vitesse de chute plus réaliste ; les dégâts dépendent de la **vitesse
verticale à l’impact**, avec petites chutes sans dégâts et impacts rapides mortels.
Le parachute freine progressivement : une ouverture trop tardive ne garantit pas
la survie. On peut ouvrir et refermer plusieurs fois pendant la même chute pour
doser sa descente. Fixer/documenter accélération, vitesse limite, freinage et
seuils de dégâts en cohérence avec les mètres du décor.
Critères : chutes de hauteurs variées, parachute fermé/ouvert/tardif et plusieurs
cycles ; absence de dégâts multiples sur un impact, cohérence entre clients,
mort vers le purgatoire et nettoyage après résurrection/embarquement.

### RES-01 — Destination après le purgatoire

Après le purgatoire, réapparaître systématiquement dans la **zone de départ**
par défaut, et non au lieu de mort. LIT-01 permet une exception contractuelle.
Critères : parcours des deux purgatoires, positions de mort variées et clients
reconnectés ; destination sûre, état de chute et caméra réinitialisés correctement.

### LIT-01 — Lit et contrat de point de réapparition

Installation achetée avec l’argent commun : premier lit **4 $**, puis **+2 $**
par lit supplémentaire de ce type. Poser sur tout support solide suffisamment
dégagé, y compris un meuble en hauteur ; réserver l’espace pour une résurrection
sans collision. Un même lit peut servir à plusieurs joueurs ayant chacun signé.

Activer le lit et signer un contrat personnel en fait le point de réapparition
après purgatoire. **Un seul contrat de lit actif par joueur** : un nouveau remplace
l’ancien. Au lit actif, pouvoir résilier pour rétablir la zone de départ comme
point par défaut ; cela ne téléporte pas immédiatement le joueur. Si le lit a
été supprimé ou est impraticable, réapparaître au départ et expliquer le repli
par un message. Conserver la cohérence avec RES-01.
Critères : achats concurrents et prix, pose sûre, contrats propres à chaque joueur,
plusieurs signataires d’un lit, remplacement/résiliation, reconnexion et retour
après purgatoire ; aucun personnage coincé ou double spawn, repli sûr si nécessaire.

### VAG-03 — Une minute de préparation

Porter à **60 secondes** le délai de préparation entre les vagues. Conserver le
mécanisme actuel pour lancer la suivante immédiatement si les joueurs le veulent.
Compte à rebours visible et discret. Critères : minute complète sans passage
anticipé, déclenchement volontaire sans double vague, clients synchronisés et
échéance de prêt prélevée une seule fois par fin de vague.

### CAM-01 — Canon du tank et coaxiale

Vue principale du tireur du canon en première personne **depuis une lunette de
tir alignée avec le canon** ; positionnement de caméra correct, sans géométrie
masquant la vue. La mitrailleuse coaxiale est physiquement légèrement décalée du
canon : son origine de tir et sa trajectoire reflètent ce décalage.
Maintenir **C** passe à une caméra d’observation à la troisième personne autour
du tank ; rotation libre **sans déplacer canon ni tourelle**, et tir suspendu.
Relâcher C ramène à la lunette. Critères : orientations/élévations variées,
parallaxe à courte distance, obstacles, maintien/relâchement et changement de
poste/mort/menu pendant C sans caméra ni tir bloqués.

### VIS-05 — Stuka et bombe

Le modèle général convient, mais revoir les éléments dépassant sous les ailes
jugés incorrects ; affiner également l’apparence de la bombe. Examiner le modèle
actuel et vérifier le résultat avec des vues comparables avant/après, jointes
à la livraison lorsque disponibles ; ce contrôle incombe à l’agent et ne
requiert pas une confirmation utilisateur. Préserver
l’identité du Stuka, la lisibilité miniature, les points de largage et les règles
de dégâts ; pas de changement d’équilibrage implicite par cette retouche visuelle.

### ECO-02 — Intérêts plus élevés

Les offres sont trop avantageuses. Proposer des taux fixes entre **10 et 20 %
par vague**, appliqués au capital restant dû dans le prêt amortissable existant.
Afficher avant signature taux/période, échéance et total à rembourser. Préserver
les trois emplacements, échéances capital/intérêts, solde négatif et interdiction
d’un nouvel emprunt à découvert. Conserver les conditions des contrats déjà
signés ; les nouveaux taux concernent les nouvelles offres.
Critères : calculs et arrondis à 10 et 20 %, amortissement intégral à terme,
échéances uniques, offres stables et montant total cohérent avec les prélèvements.

### Suivi de ce lot

29 octobre 2026 : décisions du grill enregistrées après autorisation explicite.
Validation documentaire uniquement : identifiants, dépendances, cohérence des
règles et format. Aucun correctif ni nouvelle fonctionnalité revendiqué ici.

### Exécution autonome — 29 octobre 2026

L’utilisateur autorise le traitement continu des tâches prêtes, leur découpage
et les releases intermédiaires avec ZIP des sources. Les confirmations visuelles
des anciens lots sont acquises ; VIS-05 prévoit une vérification par l’agent.
Les comptes rendus intermédiaires ne suspendent pas les tâches restantes.
Règles de référence : `AGENTS.md`, section « Exécution du backlog ».

### Livraison du lot retours terrain

29 octobre 2026 : onze tâches implémentées sur Node RAM/UDP, sources livrées en
ZIP. Aucun nouveau binaire Docker ni déploiement du client sur le Worker public.
Les notes « prêt/non implémenté » du cadrage ci-dessus décrivent l’étape documentaire
initiale ; les états du tableau et le présent suivi décrivent la livraison.

BUG-04 : reproduction rouge sur l’éligibilité réelle du dossier dorsal, puis
correction de `selectedSeat` dans le contrôle client ; six rôles et équipages
complets vérifiés avec les commandes serveur. BUG-05 : un aller-retour nécessaire
pour le jeton et les clauses, mais feedback désormais immédiat et sélection
concurrente bloquée. Retard injecté de 250 ms : retour DOM ~251 ms avant, ~0,8 ms
après ; feuille confirmée ~251 ms. Aucune conclusion de latence WAN ou de lenteur
serveur sans mesure. Traces locales bornées disponibles pour diagnostic.

ARM-02 : caméra à l’épaule, bras/main alignés, double rayon réticule puis bouche
physique, obstacles du bureau et des purgatoires. CHU-01 : gravité en mètres du
décor, gonflage progressif, dégâts verticaux dédupliqués et contact en sous-pas.
RES/LIT-01 : corps recréé au départ ou côté libre d’un lit signé, résiliation
personnelle, achats 4 $ puis +2 $, repli avec message et reprise du contrat par
secret de session non publié. Les tests couvrent les deux purgatoires.

VAG-03 : pauses Node de 60 s, premier départ toujours à 10 s, lancement anticipé
unique conservé. CAM-01 : lunette alignée, coaxiale physiquement décalée, C observe
sans tourner la tourelle ni tirer. VIS-05 : train/freins de Stuka affinés, bombe
avec empennage ; [vues comparables](docs/models-before-after.png). ECO-02 : nouvelles
offres 10–20 % par vague, tableaux signés conservés. HUD-02 : statistiques puis
monnaie/atelier/banquier en mise en page fluide ; grand montant vérifié au navigateur.

Validation : suite complète, tests additionnels `test-field-backlog.mjs` et
`test-bed-ui.mjs`, deux clients natifs UDP, build et ESM. Navigateur : contrat de
lit signé puis résiliation proposée, composants réels sur données de démonstration.
WebGL et partie WAN ne sont pas validés dans cet environnement.

Revue finale : inventaire de tous les Markdown, liens locaux et informations
courantes contrôlés ; références erronées corrigées ou archivées. Liste et
limites : [revue documentaire archivée](docs/archive/reference-audit-2026-10-29.md).
Les nouvelles consignes
de `AGENTS.md` imposent ce contrôle à chaque fin de lot. Règles et mesures
détaillées : [retours terrain](docs/field-update.md).

## Nouveau lot — lisibilité, commandes, nettoyage et Spitfire (29 octobre 2026)

Cadrage du grill validé, puis intégration explicitement autorisée par l’utilisateur.
Cadrage initial : tâches prêtes avant implémentation. Le suivi de livraison
ci-dessous et les états du tableau décrivent maintenant les tâches terminées. Les règles
ci-dessous remplacent les anciennes lors de leur livraison. Traiter le lot selon
`AGENTS.md`, sans nouvelle validation utilisateur ; choisir et documenter les
paramètres non fixés. ZIP intermédiaires autorisés, puis poursuite du lot.

| ID     | Tâche                                                         | État    | Dépendances    |
| ------ | ------------------------------------------------------------- | ------- | -------------- |
| ECO-03 | Prix affichés conformes aux transactions                      | terminé | —              |
| INT-01 | Placement direct avec E après signature                       | terminé | ECO-03         |
| SIE-04 | Raccourcis physiques de changement de poste et équipage       | terminé | —              |
| ARM-03 | Commandes du canon/coaxiale et des bombes                     | terminé | —              |
| BOM-01 | Bombardier 50 bombes et largage continu                       | terminé | ARM-03         |
| VIS-06 | Projectiles visibles, cohérents et aux couleurs des véhicules | terminé | —              |
| CAM-02 | Mire graduée selon la balistique des obus                     | terminé | —              |
| COL-01 | Dégâts uniques de collision avec un insecte                   | terminé | —              |
| NET-02 | Salissure partagée et nettoyage au jet                        | terminé | ARM-03, COL-01 |
| SON-03 | Son de piqué exclusivement pour le Stuka                      | terminé | —              |
| VEH-05 | Spitfire monoplace à six mitrailleuses                        | terminé | VIS-06, SON-03 |

### ECO-03 — Vérifier tous les prix présentés au joueur

Auditer les informations tarifaires affichées et les confronter au calcul réel
serveur : magasin, contrats, aperçu, boutons de pose et messages. Corriger notamment
le bouton annonçant à tort 30 $ lors d’une pose. Utiliser la même règle de prix
que la transaction ; distinguer achat déjà payé et éventuel coût encore dû.
Critères : prix cohérents pour chaque objet et achat successif, concurrence et
solde insuffisant ; aucun prix codé en dur divergent ni double débit à la pose.

### INT-01 — Poser directement avec E

Après achat et signature, entrer directement en mode placement avec aperçu.
E pose sur un emplacement valide ; Échap annule le placement. Ne plus obliger à
sortir par Échap puis cliquer sur un bouton, ni demander une seconde signature.
Un emplacement invalide empêche la pose et explique brièvement pourquoi.
Conserver les garanties existantes d’annulation et de propriété de l’achat ;
consigner le traitement de l’objet acheté lors d’une annulation.
Critères : parcours clavier complet, E maintenu sans pose multiple, pose invalide,
annulation/reprise, menus/signatures ne déclenchant pas involontairement la pose.

### SIE-04 — Touches physiques et parcours contractuel inchangé

Dans tous les véhicules à plusieurs postes, utiliser les positions physiques de
la rangée supérieure 1 à 7 (`Digit1` à `Digit7`), indépendamment de Shift et de la
disposition AZERTY/QWERTY. Afficher les raccourcis à côté des noms des postes en
haut à droite et mettre en évidence le poste du joueur, notamment dans le tank.
Les touches déclenchent **exactement le même parcours que le clic** : signatures
pour les places libres, demande et acceptation contractuelles pour les échanges
avec un occupant. Elles ne permettent aucun transfert direct contournant le contrat.
Critères : tous les postes, AZERTY sans Shift, place libre/occupée, refus,
concurrence, menus et saisie neutralisant les raccourcis, occupation atomique.

### ARM-03 — Commandes contextuelles

Tireur principal du tank : clic gauche pour le canon, Espace pour la coaxiale.
Sur tous les avions équipés de bombes : Espace largue, supprimer B ; si Espace
servait au tir principal, le tir principal reste au clic gauche. À pied, Espace
ne tire plus le pistolet : il commande le jet de NET-02 ; pistolet au clic gauche.
Mettre à jour aides, HUD et documentation des contrôles, sans déclenchements
croisés. Préserver l’interdiction de tirer durant l’observation C du tank.
Critères : chaque rôle et monde, pressions/maintiens/relâchements, menus, perte de
focus et changement de poste sans action persistante ou simultanée indésirable.

### BOM-01 — Réserves et largage continu

Bombardier initial à trois places : capacité **50 bombes**. Tous les avions
bombardiers, Stuka compris : intervalle **0,5 seconde**, maintien d’Espace pour
larguer en continu jusqu’au relâchement ; appui bref = une bombe. Les autres
avions conservent leur capacité. Recharge aux stations habituelles.
Critères : cadence bornée, aucun stock négatif ni bombe gratuite, épuisement,
recharge, relâchement/menu/sortie stoppant le largage et synchronisation réseau.

### VIS-06 — Projectiles lisibles et identification de leur provenance

Rapprocher l’apparence des projectiles du pistolet à pied de celle des traceurs
classiques des mitrailleuses. Rendre les obus du tank nettement visibles, avec
une forme distincte des balles ; différencier aussi explosifs et perforants.
Les projectiles de toutes les armes de véhicule, bombes comprises, portent sa
teinte persistante pour reconnaître leur provenance. Préserver des teintes
distinctes entre véhicules ; différencier les types par la forme également.
Critères : visibilité locale et distante, pluie de tirs lisible, cohérence des
origines/couleurs après changement de poste et reconnexion ; particules bornées,
sans modifier dégâts ou collisions pour obtenir seulement un effet visuel.

### CAM-02 — Lunette et estimation de chute des obus

Améliorer la mire du tank avec graduations en mètres correspondant à la trajectoire
réelle du type d’obus sélectionné. Adapter les repères lors du changement de
munition ; pas de correction automatique de la visée. Préserver C et la coaxiale.
Critères : comparer repères et impacts à plusieurs distances et types d’obus,
garder le centre lisible, prendre en compte les unités du décor et la gravité.

### COL-01 — Une règle unique de dégâts à l’impact

À chaque impact véhicule/insecte, retirer au véhicule **5 % des PV restants de
l’insecte au moment de l’impact**. Remplacer les éventuels dégâts précédemment
appliqués à cette collision, sans cumul avec l’ancienne règle. Appliquer une seule
fois par impact ; un contact persistant ne crée pas un impact à chaque image.
Critères : insecte sain/blessé, contact prolongé, nouvel impact après séparation,
plusieurs clients, destruction ; pas de double application ni changement implicite
des autres catégories de collision. La salissure de NET-02 s’ajoute à ces dégâts.

### NET-02 — Salissure du véhicule et jet de nettoyage

Les collisions avec les ennemis accumulent une salissure propre au véhicule,
persistante entre occupants et visible extérieurement. Elle ternit la vision de
**tous les occupants**, pas seulement du pilote, sans modifier les performances.
Limiter l’opacité pour toujours permettre une manœuvre de retour/atterrissage.
Au-delà d’un seuil, afficher discrètement : « Attention, nettoyez votre véhicule
en urinant dessus. » Éviter une grande annonce centrale persistante.

À pied, maintenir Espace fait uriner le personnage : jet de particules orienté
par la visée, réserve illimitée, portée courte d’environ **2 mètres du décor**.
Le jet nettoie progressivement uniquement s’il atteint le véhicule ; plusieurs
joueurs accélèrent le nettoyage. Environ **10 secondes** de jet d’un joueur pour
un véhicule entièrement sale. Il faut sortir pour nettoyer ; l’écran redevient
dégagé à pied, sans effacer l’état du véhicule. Au passage sale → entièrement
propre, produire des étoiles scintillantes autour du véhicule, une seule fois.

Critères : accumulation plafonnée, tous postes et clients concernés, sortie et
retour, jet hors portée/obstacle/mauvaise cible sans nettoyage, coopération,
arrêt au relâchement/menu, transition propre unique, nettoyage après destruction
et reset. État partagé cohérent avec l’autorité réseau existante ; ne pas
multiplier les commandes fiables pour chaque particule décorative.

### SON-03 — Identité sonore du Stuka

Réserver exclusivement au Stuka le son supplémentaire de piqué à vitesse élevée.
Les autres avions, Spitfire compris, ne l’émettent pas. Préserver leurs autres sons.
Critères : comparaison des types en piqué, transitions et arrêt de boucle après
sortie/destruction ; perception cohérente pour les joueurs distants.

### VEH-05 — Spitfire

Ajouter un chasseur **monoplace**, sans bombes, acheté au prix de **deux Stuka**.
Équipement supplémentaire perdu définitivement à sa destruction, recharge aux
stations habituelles. Vitesse maximale **+75 %** et capacité de rotation **+45 %**
par rapport à l’avion de départ. Modèle procédural identifiable comme Spitfire.

Trois mitrailleuses par aile, soit six, tirent simultanément au clic gauche,
avec origines physiques distinctes et puissance par arme comparable à celle du
chasseur initial. Réserves limitées pour environ **45 secondes de tir continu**
aux six armes ; consommation simultanée, sans réserve illimitée implicite.
Conserver la teinte propre et ses projectiles, contrats et accès, HUD des stocks,
ravitaillement, physique partagée et nettoyage. Aucun son de piqué du Stuka.
Critères : prix affiché/débité, achat concurrent, poste exclusif, vitesses et
rotation mesurées contre la référence, six origines et dégâts sans doublons,
autonomie/cadence, recharge, destruction/reset et observation à plusieurs clients.

### Suivi du lot lisibilité, commandes, nettoyage et Spitfire

29 octobre 2026 : décisions consolidées après grill, ajout au backlog autorisé.
Les corrections finales de l’utilisateur prévalent : parcours contractuel pour
les raccourcis, salissure pour tous les occupants, dégâts uniques remplaçant les
anciens, autonomie Spitfire 45 s et multiplicateurs 1,75 / 1,45.
Validation de cette livraison : identifiants uniques, dépendances, couverture des
notes et décisions, liens locaux et format Markdown. Aucun code ni déploiement
modifié ; les documents de gameplay actuel seront mis à jour avec l’implémentation.

### Livraison de ce lot — Node RAM/UDP

Les onze tâches sont terminées. [Référence détaillée](docs/clean-flight.md) :
prix communs, bons prépayés et pose E sans nouveau débit, conservation/reprise
et remboursement à expiration, commandes physiques de siège avec mêmes contrats,
canon/coaxiale contextuels, 50 bombes et cadence 0,5 s, projectiles par teinte,
mire partagée avec la balistique, impacts uniques et salissure commune, jet
coopératif, sirène Stuka exclusive, Spitfire six MG / 45 s / 1,75 / 1,45.

L’ID NET-01 du nettoyage doublonnait le serveur UDP historique ; cette tâche est
renommée NET-02, sans changement de périmètre. Les nombres et choix non fixés
(opacité, quantité de salissure, remboursement des objets non posés) sont consignés
dans la référence. Le retrait SQL reste hors de cette volée ; aucun changement
de stack ni déploiement du client sur le Worker historique.

Contrôles : domaine, vrais gestionnaires clavier/signature/tir, intégration
balistique, deux pairs natifs UDP et régressions complètes. Bon signé dans le
navigateur sur données jetables, aides/HUD inspectés. La revue des Markdown est
consignée dans [l’audit](docs/reference-audit.md). ZIP des sources livré ; WebGL,
écoute, tactile physique, charge et WAN restent à vérifier sur VM. Les armes
lourdes conservent leur confirmation unique en cours : en réseau lent, leur
cadence effective peut être inférieure à la cadence nominale.

## Nouveau lot — retours multijoueurs, HUD et déploiement au sol (29 octobre 2026)

Toutes les recommandations du grill ont été validées, puis leur intégration
explicitement autorisée. Cadrage initial : tâches prêtes. Les états du tableau et le suivi final décrivent maintenant leur livraison.
Suivre l’exécution autonome de `AGENTS.md`, sans nouvelle confirmation ; livraisons
intermédiaires en ZIP autorisées. Les règles ci-dessous remplacent les précédentes
lors de leur implémentation ; préserver les suivis des lots déjà livrés.

| ID      | Tâche                                                       | État | Dépendances |
| ------- | ----------------------------------------------------------- | ---- | ----------- |
| MORT-01 | Observation après mort avant accès volontaire au purgatoire | terminé | —           |
| HUD-03  | Statistiques des avions près du viseur                      | terminé | —           |
| HUD-04  | Aide permanente des commandes en bas à gauche               | terminé | HUD-03      |
| VEH-06  | Réserve gratuite renouvelée au décollage                    | terminé | —           |
| INT-02  | Achat et placement de tous les véhicules                    | terminé | —           |
| ARM-04  | Spitfire : 1 000 balles, décalage et performances           | terminé | —           |
| VAG-04  | Parcours étendus dans toute la pièce                        | terminé | —           |
| VAG-05  | Fourmis faciles dès la première vague                       | terminé | VAG-04      |
| CHU-02  | Chute à la gravité mise à l’échelle du personnage           | terminé | —           |
| ARM-05  | Corriger les tirs arrière et élargir le regard vertical     | terminé | —           |
| BOM-02  | Doubler le rayon des bombes du gros bombardier              | terminé | —           |
| VIS-07  | Moucherons agrandis et tolérance de hitbox                  | terminé | —           |
| VIS-08  | Couleurs personnelles et initiales sur les personnages      | terminé | —           |
| RAD-02  | Radar cylindrique de 2 m, carte et parabole animée          | terminé | —           |

### MORT-01 — Observer après la mort

Au décès, conserver une caméra fixe au lieu de mort et le rendu vivant de la
partie, sans limite de temps. Petite fenêtre et bouton « Accéder au purgatoire » :
le clic déclenche le passage, pas le décès seul. Le mort ne peut plus agir et
libère immédiatement son poste. Même attente avant le super purgatoire ; mourir
au super purgatoire conserve sa règle actuelle de réapparition.
Critères : décès à pied/à bord, commandes neutralisées, siège disponible, scène
synchronisée, clic unique et répété, reset/reconnexion sans duplication de mort
ou résurrection. Ne pas garder un corps actif pour permettre l’observation.

### HUD-03 — Informations au curseur des avions

Afficher en permanence près du curseur vitesse de l’appareil, PV du véhicule et
balles restantes du poste occupé, dans tous les postes d’avion. Petites valeurs,
barres et couleurs synthétiques, sans masquer la cible, sur le principe DCA.
Ajouter les bombes pour les pilotes concernés. Ne pas confondre PV joueur et
véhicule. Critères : tous les modèles/postes, réserves vides, dégâts, recharge,
zoom et tailles d’écran ; valeurs actuelles sans dépendre d’un survol.

### HUD-04 — Commandes toujours disponibles

Remplacer les panneaux repliables par une aide permanente en bas à gauche :
texte blanc discret avec légère ombre, sans fond ou fond extrêmement léger.
Adapter les touches au poste, à la marche et au parachute ; aucun survol requis.
Les statistiques essentielles restent près du viseur. Critères : aides complètes
et conformes aux commandes réelles, changements de contexte immédiats, aucun
chevauchement avec monnaie/banque et lisibilité pendant le combat.

### VEH-06 — Avions initiaux réellement illimités

Maintenir à la station un exemplaire disponible de chacun des deux modèles
initiaux. Dès que cet exemplaire décolle, fournir son remplaçant gratuit, sans
attendre sa destruction ni supprimer les avions utilisés. Un seul exemplaire de
réserve par modèle ; pas de génération continue à chaque mise à jour.
Critères : décollages successifs et concurrents, appareils encore vivants,
retour/atterrissage, destruction et reset sans doublons de remplacement.

### INT-02 — Placement de tous les achats de véhicules

Ajouter aussi les deux modèles de départ au marchand, en supplément de leur
réserve gratuite. Tous les achats de véhicules/avions passent par achat et
signature, aperçu puis E pour poser sur support solide suffisamment dégagé,
comme les installations. Achat à pied ; aucun spawn automatique à la station.
Permet notamment de descendre en parachute puis acheter/poser un tank au sol.
Choisir et documenter les prix non fixés selon l’économie existante.
Critères : tous les modèles, sol et mobilier, encombrement, annulation/reprise,
concurrence et prix affichés/débités cohérents, ni double débit ni pose multiple.

### ARM-04 — Réserve et salves du Spitfire

Remplacer l’autonomie de 45 secondes par **1 000 balles au total**, partagées entre
les six mitrailleuses : chaque projectile consomme une balle. Très léger décalage
des six départs de chaque salve, globalement synchronisés, sans réduire la cadence
individuelle. Améliorer ainsi rendu et artefacts audio. Mesurer et rechercher
également la cause des ralentissements locaux/distants en tir soutenu ; la baisse
de stock seule ne constitue pas une correction de performance.
Critères : stock exact et fin de réserve partielle, recharge, six origines,
cadence conservée, sons sans accumulation, mesures avant/après et charge multijoueur.
Conserver les caractéristiques de pilotage déjà livrées.

### VAG-04 — Exploiter toute la pièce avant la corbeille

Allonger nettement les parcours globaux aériens et terrestres : traverser plusieurs
zones éloignées avant l’approche finale. Conserver les vitesses et les mouvements
individuels/de groupe appréciés. Utiliser les hauteurs en vol et des supports
accessibles au sol ; éviter les chemins directs vers la poubelle. Intégrer leur
durée au rythme des vagues et aux arrivées serveur, sans attente désynchronisée.
Critères : plusieurs graines/types, visualiser les chemins et mesurer leur
étendue/durée avant/après, pas de traversée du mobilier ni ennemi bloqué.

### VAG-05 — Ennemis terrestres précoces

Ajouter dès la première vague un petit groupe de fourmis faciles en supplément
des moucherons, puis une présence régulière dans les suivantes. Pas d’ennemis
terrestres résistants immédiatement. Choisir/documenter le nombre et l’équilibrage.
Critères : première vague mixte reproductible, trajets terrestres étendus,
progression jouable et arrivée/récompense/fin de vague cohérentes.

### CHU-02 — Remplacer la gravité non mise à l’échelle

Appliquer la gravité humaine de référence multipliée par le ratio du personnage :
**9,81 × 0,003 = 0,02943 m/s²** dans le décor du bureau. Remplace explicitement le
choix précédent des mètres directs du décor. Adapter ensemble vitesse limite,
freinage du parachute et seuils de dégâts ; centraliser les conversions et
respecter les autres mondes. Critères : durée/vitesse mesurées à plusieurs hauteurs,
parachute tardif et cycles, impact unique, sorties d’avion et cohérence réseau.

### ARM-05 — Pistolet encore défectueux et regard vertical

Reproduire le tir partant derrière le joueur avant de conclure sur sa cause ;
corriger effectivement le défaut malgré les validations précédentes. Conserver
la caméra à l’épaule, permettre de regarder/viser presque verticalement sans
retournement. Projectile depuis l’arme vers le point visé ; obstacles bloquants.
Critères : toutes orientations et angles verticaux, cibles proches/lointaines,
obstacles et mondes autorisés, observation distante, origine/direction/dégâts
cohérents ; documenter cause prouvée et limites de reproduction.

### BOM-02 — Rayon du bombardier initial

Doubler le rayon de dégâts **et l’effet visuel** des bombes du gros bombardier à
trois places. Dégâts centraux inchangés ; Stuka inchangé. Critères : centre,
bord et hors rayon, visibilité de l’explosion, dégâts uniques et cohérence clients.

### VIS-07 — Taille et compensation des moucherons

Augmenter les dimensions linéaires du modèle de **50 % par rapport à l’état actuel**,
puis élargir la hitbox de **20 % supplémentaires** par rapport au nouveau modèle.
Seulement les moucherons ; PV inchangés. Critères : comparaison avant/après,
tirs au centre/bord/hors tolérance, géométrie cohérente entre clients.

### VIS-08 — Identification sur le corps

Grandes initiales du pseudo sur l’avant et le dos, couleur personnelle distincte
et stable pendant la partie, y compris aux purgatoires. Contraste lisible ; ne
pas réintroduire les noms flottants. Critères : pseudos variés/initiales identiques,
connexion tardive, mort/retour et distinction des joueurs en partie.

### RAD-02 — Couverture et modèle du radar

Passer à **2 mètres de rayon du décor**, en cylindre vertical du sol au plafond,
plutôt qu’en sphère : détecter au plafond et au sol même depuis un bureau.
Afficher la couverture circulaire sur la carte avec balayage léger. Améliorer le
modèle et animer la rotation de la parabole. Critères : limites horizontales,
altitudes extrêmes, radars superposés, suppression/reset et rendu distant ; le
balayage décoratif ne change pas implicitement la cadence réelle de détection.

### Suivi de cette vague

29 octobre 2026 : toutes les recommandations validées puis ajout autorisé.
Livraison documentaire seulement ; états courants conservés dans leurs références
jusqu’à implémentation. Vérifier liens, format, identifiants et dépendances. Les
paramètres non imposés sont à choisir et documenter par l’agent sans interruption.


### Livraison du lot retours multijoueurs

Les 14 tâches sont terminées sur Node/RAM/UDP. [Référence courante](docs/multiplayer-return.md),
mesures brutes et limites incluses. RAD-02 remplace l’identifiant RAD-01 doublonné
avec l’ancien lot radar ; le périmètre reste celui validé. Les prix non fixés sont
8 $ pour le chasseur supplémentaire et 16 $ pour le bombardier supplémentaire.

Cause reproduite du tir arrière : traînée immobile derrière la bouche, corrigée
sans inverser le rayon de dégâts. Optimisation mesurée : filtrage large avant
matrices/intersections, suppression des Maps par segment, pool de traceurs, sons
regroupés et départs décalés. Mesures CPU et comparaison de 90 chemins jointes ;
ni FPS WebGL ni charge WAN revendiqués. Les attentes historiques des tests ont
été adaptées aux nouvelles décisions explicites (stock, budget, chute et décès).

Contrôles : suite complète, vrais gestionnaires et commandes, chaque type acheté
et posé au sol, observation et accès idempotent, deux pairs UDP natifs, HUD/aide
et bouton d’observation dans la démonstration navigateur. Les 31 Markdown sont
revus, détails dans [audit](docs/reference-audit.md). ZIP des sources livré ;
Site public historique inchangé. WebGL, écoute, tactile physique et partie sur
Internet restent à vérifier sur VM.
