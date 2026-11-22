# Pilotage, véhicules, armement et banque

La composition de vague décrite dans ce lot a ensuite été densifiée : voir
[les nuées de version 38](dense-swarms.md), 20 moucherons et 4 fourmis au départ.

État du lot du 29 octobre 2026, pour le **serveur Node RAM/UDP**.
Les écrans HUD et banquier ont été validés puis intégrés au jeu. L’aperçu
`/ui-review.html`, généré depuis le HTML et les modules réellement servis, permet
de les essayer avec une caisse de démonstration indépendante et temporaire.

## Pilotage et accès

Maintenir le clic droit en poste, pointeur capturé, passe le champ de vue de 62°
à 28°. Relâcher, perdre le focus, quitter le poste, mourir ou changer d’occupation
réinitialise le zoom. Aucun tir ne part du clic droit ; le menu contextuel est
désactivé sur le décor. À pied et au purgatoire, la vue ordinaire est conservée.

La DCA utilise Shift pour augmenter la fusée de 25 mètres de référence par
pression et Ctrl pour la diminuer. Molette et boutons existants restent disponibles.
Les limites demeurent 100–1 200 m de référence, soit **0,300–3,600 m du décor**.
La valeur existante affiche désormais les mètres réels. La jauge près du viseur affiche la même valeur, entre les bornes réelles
de 0,300 et 3,600 m. Elle suit le viseur et disparaît hors DCA.
Dans un tank, Shift sélectionne HE et Ctrl AP ; ces touches ne changent aucune
fusée de DCA. La conduite utilise Z/S ou flèches pour avancer/reculer, Q/D pour
tourner. Au tireur canon, clic gauche tire HE/AP et Espace la coaxiale ; les autres postes gardent clic/Espace pour la MG. En avion, Espace maintient le largage des bombes. B ne tire plus.

On monte en visant le poste lui-même (verrière, trappe, tourelle), de n’importe quel
côté ; clic ou E ouvre directement le bon dossier
([règles d’interface](ui-guidelines.md#monter-dans-un-engin--viser-le-poste)). Le serveur
contrôle la proximité de l’engin et l’exclusivité du siège à la seconde signature. Les mutations et échanges à bord conservent leurs contrats.
Les trois postes du tank ont des contrats adaptés, ajoutant 150 variantes au
catalogue de 250 documents. Les traits de signature restent soumis à leurs
protections existantes ; aucun effacement préalable n’est nécessaire.

## Cycle des véhicules

Le chasseur initial et le bombardier initial ont l’origine `starter`. Il n’y a
qu’un exemplaire prêt de chaque origine/type : son décollage ou sa destruction
fournit un nouveau prêt, sans supprimer les coques utilisées. Un retour ne recrée pas de réserve supplémentaire. Les exemplaires achetés
ont l’origine `purchase`, sont posés une fois après bon signé et achat idempotent et ne sont
pas remplacés gratuitement. Acheter à nouveau est permis.

Quitter un poste libère seulement ce siège. L’appareil, son équipage et ses stocks
restent présents ; un départ en vol ne supprime plus le véhicule et ne force plus
les autres occupants à sortir. Sans pilote, l’hôte désigné poursuit la physique
neutre de l’avion. Le tank ralentit sans conducteur et continue de tomber s’il
a quitté un support. Un choc vertical au-delà de 20 m/s de référence le détruit.
Les changements de siège ne recréent aucune réserve.

## Stocks et équilibre initial

| Équipement / arme            | Réserve | Cadence nominale | Dégâts                    |
| ---------------------------- | ------- | ---------------- | ------------------------- |
| Stuka, mitrailleuses         | 1 000   | 0,06 s           | 75                        |
| Stuka, bombes                | 6       | 0,5 s            | 240 au centre, 60 au bord |
| Bombardier, bombes du pilote | 50      | 0,5 s            | mêmes bombes              |
| Tank, MG du pilote           | 1 000   | 0,09 s           | 33                        |
| Tank, MG coaxiale            | 1 500   | 0,06 s           | 50                        |
| Tank, MG supérieure          | 1 500   | 0,06 s           | 75                        |
| Tank, obus HE                | 30      | 2 s              | 320 au centre, 30 à 20 m  |
| Tank, obus AP                | 30      | 2 s              | 800, −20 % par ennemi     |

Chaque MG du tank a 90 s de tir nominal ; chaque réserve d’obus a 60 s.
HE et AP partagent le même délai de canon, empêchant de contourner ce délai en
changeant de type. Une réserve vide bascule automatiquement vers l’autre si elle
contient au moins un obus entier. Aucun pilote n’est requis pour utiliser les
deux postes tireurs. Les réserves de MG sont complètement indépendantes.

Le Stuka est une silhouette à ailes en mouette, carénages de train et bombes
externes. Sa vitesse maximale de référence est 54 m/s et son facteur de virage
0,65, contre 70 et 1 pour le chasseur initial. Il coûte 25 $ par exemplaire,
le tank 5 $. Le bombardier conserve ses deux postes de mitrailleurs.

Les bombes héritent de la vitesse de l’avion et subissent la gravité. Un piqué
dont la direction avant descend de plus de 0,65 applique un facteur **1,35** aux
dégâts, soit 324 au centre : il permet notamment d’abattre un cafard de 300 PV
avec une bombe bien placée. Le rayon d’une bombe Stuka est de 20 m de référence
(0,060 m du décor), celui du gros bombardier de 40 m (0,120 m), celui d’un HE de 20 m (0,060 m). Les AP sont des projectiles
perforants sans dégâts de zone : ils traversent les ennemis, appliquent leurs dégâts au contact (800, puis
×0,8 à chaque ennemi : 800, 640, 512…, une fois par ennemi) et ne s’arrêtent que sur le décor, un appareil ou un joueur. Le décor bloque trajectoires et explosions.

Les stations habituelles rechargent toutes les réserves en dix secondes selon
les mêmes conditions d’arrêt et d’appui au sol. Les niveaux fractionnaires sont
conservés ; tirer exige au moins une munition complète. Carburant : cinq minutes
à plein régime. Aucune recharge achetée ni restriction aux intervagues.
Aucune clause ne modifie plus commandes, visée, cadence ou dégâts (annexes
malicieuses retirées en version 264).

Les MG restent prédites localement puis débitées par lots idempotents. Les rapports
sont regroupés pendant 50 ms (32 tirs maximum par lot), avec jusqu'à huit lots
simultanément en attente de réponse. Une file bornée à 512 tirs protège la
mémoire en cas de connexion durablement saturée ; les identifiants sont repris
à l'identique après une confirmation perdue. Le tir normal ne s'arrête donc
plus à cause de l'ancien délai fixe entre confirmations.
Une rupture réseau durable peut encore remplir la file et interrompre le tir.
Les armes lourdes (roquettes, missiles, bombes, obus HE/AP, obus à fusée,
canon lourd) suivent la même règle que les MG : **le tireur calcule ses tirs et
leurs collisions**. Son navigateur crée le projectile dès l'appui, depuis la
bouche affichée, le fait voler et le confronte à ce qu'il voit
(`src/heavy-sim.js` : balistique, guidage, fusée de proximité, impact direct et
souffle, alliés compris), puis envoie `heavy-impact` avec les dégâts. Une fin
sans explosion (contact inerte, fin de vie, hélicoptère détruit) est signalée
par `fizzle`. Le serveur ne simule plus rien : `heavy-fire` (ou
`antitank-fire`) débite le stock, applique la cadence (avec 100 ms de tolérance
pour les irrégularités du réseau, le tireur n'attendant pas la réponse) et
enregistre le départ ; `heavy-impact` n'est accepté que du tireur, une seule
fois, et ses montants sont plafonnés par la puissance enregistrée du départ.
Seul un obus perforant tue net. Les autres joueurs simulent la trajectoire
depuis le départ enregistré ; un missile guidé est dessiné à la position
relayée dans le mouvement du tireur. Un départ sans rapport est oublié 3 s après
sa fin de vie ; un obus encore en vol à la mort de son tireur garde son effet.

## Trajets et crashs

Les nouveaux trajets gardent la vitesse **effective** des anciennes vagues,
y compris celle résultant de leur ancien plafonnement temporel. `route-speed.js`
conserve uniquement ce calcul de calibration ; ces anciens chemins ne sont pas
suivis. La durée actuelle est le temps d’entrée plus longueur du nouveau trajet
divisée par cette vitesse. Les longues routes ne sont plus accélérées pour
rentrer dans un délai artificiel. Les apparitions restent périphériques.

Les terrestres suivent une grille A\* puis une simplification avec visibilité
libre ; les aériens font des détours en altitude avant la descente vers la poubelle.
Les obstacles de navigation sont générés depuis les colliders du bureau.
Les grilles d’aération décoratives sont les points de sortie, pas des obstacles
fermant leur propre apparition. Les éléments achetés en cours de partie ne
modifient pas cette navigation statique. La première vague garde quatre moucherons ;
sur la graine de contrôle DOC, sa dernière arrivée passe autour de 58 s.

Une destruction publie un seul événement de crash avec la pose, la vitesse et
son horodatage. Les clients montrent chute, impact sonore, fumée et débris.
Une connexion tardive reconstruit la phase déjà atteinte sans rejouer les sons
passés. Limites : douze corps visuels, dix débris par corps et disparition quatre
secondes après l’impact ; chute bornée à seize secondes. Les effets n’appartiennent
pas aux surfaces de collision. Tous les occupants sont libérés côté serveur et passent au purgatoire, même
si le dernier mouvement signale la destruction sans commande de mort ultérieure.

## Banque et documents signés

L’API expose toujours trois emplacements, contenant une offre stable ou un prêt
signé. Une signature porte le numéro de l’emplacement et le numéro unique de
l’offre ; une ancienne offre ne peut pas recréditer la caisse.
Ces opérations sont accessibles à tout moment par le domaine serveur.
Le bouton Banquier ou N ouvre le guichet à tout moment, y compris embarqué ou
au purgatoire. La consultation libère la souris et neutralise les commandes ;
la partie continue. Échap ou la croix ferment le panneau. Il ne s’ouvre pas
pendant le dépôt d’un autre dossier. La navigation clavier reste dans le panneau.

Le guichet est un **prospectus en papier** ([règles d’interface](ui-guidelines.md)) :
les trois emplacements y sont imprimés comme des coupons. Cocher une offre affiche
son texte humoristique et son tableau d’amortissement ; il faut ensuite cocher la
**reconnaissance de dette** (`loanConsent`, une seule case : « cet emprunt plombe mon
équipe pendant les N vagues à venir ») avant de signer. La banque ne demande aucun
motif. Relâcher un trait valide transmet une seule
commande fiable ; le contrat reçoit le tampon « APPROUVÉ ». Une erreur affiche son
message et permet de signer à nouveau. Une annulation du pointeur ne signe jamais.
Un contrat actif se consulte en cochant son coupon : capital restant, vagues
restantes, et un tampon « PAYÉ » sur chaque échéance prélevée. Il n’y a pas de
remboursement anticipé : un prêt se rembourse par ses échéances. Un reset pendant
la lecture, ou la disparition de l’offre, invalide le document ; le serveur
revérifie aussi son epoch. L’image de la signature n’est ni conservée ni envoyée
au serveur.

| Capital proposé | Taux fixe par vague | Nombre de vagues |
| --------------- | ------------------- | ---------------- |
| 12 $            | 10 %                | 4                |
| 18 $            | 12 %                | 5                |
| 24 $            | 15 %                | 6                |
| 30 $            | 18 %                | 7                |
| 40 $            | 20 %                | 8                |

Les calculs utilisent des centimes entiers. L’échéance théorique est celle d’un
prêt amortissable à taux fixe, arrondie au centime ; chaque échéance sépare intérêts
arrondis sur capital restant et remboursement de capital. La dernière solde
exactement le reste. Le tableau complet, le coût total, les vagues restantes et
le capital restant sont conservés dans le contrat signé.

Une signature crédite immédiatement le capital. Une seule échéance est prélevée
par prêt à chaque fin de vague, y compris une vague perdue, sans double prélèvement
sur les polls suivants. Le solde peut devenir négatif et les échéances continuent.
Aucun nouveau prêt n’est signé avec un solde négatif. Le prêt terminé
est remplacé par une nouvelle offre vierge dans le même emplacement. Un reset
efface prêts, offres et monnaie avec le reste de la partie.

## Vérifications

`npm run test:next` (`test-next-backlog.mjs`) couvre l'amortissement, les trois
emplacements de prêts, les débits de fin de vague et le solde négatif, les stocks,
les impacts au sol, les accès de rôle, la conduite sur support, les trajets et les
effets de crash bornés ; `test-hud-bank-ui.mjs` exerce les vrais gestionnaires de
signature de la banque. Captures de référence : [DCA](ui-review-dca.jpg),
[banquier](ui-review-bank.jpg).

## Tank : lunette et observation

Le tireur canon vise par une lunette alignée sur la bouche ; son propre tank y est
masqué. La coaxiale a son propre nœud de bouche, rayon parallèle au canon (sans
correction de parallaxe). Les obus partent du canon du modèle, simulés par le tireur.
La mire (`tank-reticle.js`, `ballisticMarks`) réutilise `integrateOrdnance` à pas de
1/120 s comme le serveur, avec la vitesse de l'obus choisi, gravité, traînée et vitesse
héritée ; repères `TANK_MARKS` de 15 cm à 9 m du décor, masqués hors écran ou trop
serrés. **C** maintenu passe en observation à la troisième personne : la souris ne
tourne plus la tourelle, MG et canon sont suspendus, la mire masquée ; relâcher C,
changer de siège, ouvrir un menu ou mourir en sort.

## Spitfire

Achat à 75 $, monoplace sans bombes, six mitrailleuses (trois par aile, six bouches
distinctes). Par rapport au chasseur léger (`src/fleet.ts`) : vitesse maximale ×1,75,
rotation ×1,45, poussée 70. Stock de **1 000 balles communes** (`src/logistics.ts`) ;
chaque arme tire toutes les 0,06 s avec de petits décalages dans la salve
(`salvos.ts`, file bornée et annulée au changement de poste, menu, perte de focus ou
décès) et la dernière salve peut être partielle. Perdu définitivement à sa destruction.
Seul le Stuka occupé a la sirène de piqué.

## Salissure et nettoyage

Le serveur balaie le déplacement de chaque coque contre les insectes : un contact
retire à la coque **5 % des PV restants de l'insecte**, une fois par paire coque–ennemi
jusqu'à séparation (tank et coques vacantes compris). Chaque impact ajoute 0,18 de
salissure (plafond 1, `WASH` dans `src/vehicle-care.js`) : la peinture brunit et un
voile couvre la vue des occupants (opacité au plus 0,42) ; le conseil de nettoyage
apparaît à 0,55. La salissure ne change aucune performance et reste sur la coque.
À pied au sol, Espace maintenu projette un jet de 2 m qui nettoie la première coque
visée en 10 s environ, plus vite à plusieurs ; impossible depuis un siège ou au
purgatoire. La coque redevenue propre déclenche un seul événement partagé.

Projectiles, MG, obus et bombes portent la teinte persistante de leur coque.
