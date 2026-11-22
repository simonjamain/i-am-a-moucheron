# Combat, mondes et contrats

## Dégâts absolus

| Cible             |  PV |
| ----------------- | --: |
| Moucheron, fourmi | 100 |
| Cafard            | 300 |
| Abeille           | 400 |
| Scarabée          | 800 |
| Joueur            | 100 |

Une mitrailleuse inflige 75 dégâts (l'ancienne amélioration de munitions est
retirée). Le pistolet n'existe qu'au purgatoire et inflige
toujours 10 dégâts, un tir par appui, sans délai entre deux appuis distincts.
Maintenir ne répète pas le tir. Le corps visible de l'âme porte le pistolet ; le
rayon vise le réticule. Au bureau, le personnage n'a pas d'arme à pied.
Le personnage est un modèle animé (repos, marche, course, assis, chute) ;
voir le [pipeline d'assets](asset-pipeline.md#personnage-joueur-meshy--mixamo).

Un obus de DCA au contact direct inflige 200 dégâts à sa seule cible et disparaît,
sans explosion. Sa fusée programmée, en l’absence d’impact précédent, explose :
80 dégâts au centre, décroissance linéaire à 20 au bord inclus, zéro au-delà.
Les obstacles masquent le souffle. Les contacts solides conservent la distance
minimale de sécurité. Un projectile supprimé ne déclenche aucun second impact.
`combat.ts` porte la classification d’impact et la courbe de souffle.

## Autorité et persistance

Les clients conservent leur autorité sur les mouvements et les impacts déclarés.
Le serveur Node valide les opérations en RAM. Les noms de tables et transactions
SQL cités ci-dessous sont l’ancien modèle de persistance, abandonné : le serveur garde ces registres en RAM. `health_hits` déduplique par tireur, cible,
tir et incarnation. Une transaction retire les PV une fois. Une transition de
mort est conditionnée par l’incarnation courante, puis l’incrémente ; les retries
ne peuvent pas réinitialiser le dossier d’une nouvelle vie. Les instantanés
exposent les PV et l’incarnation de chaque joueur. Les PV du véhicule restent
indépendants des PV personnels ; détruire le véhicule tue ses occupants.

Les corps des deux purgatoires sont dans deux arènes et révisions distinctes.
La file PNJ appartient uniquement au purgatoire classique. Le registre
`soul_rewards` arbitre entre service et tir : le premier libère l’âme et crédite
un dollar ; les autres demandes n’ajoutent rien. Les PV PNJ viennent de leur type,
et leurs dégâts ne sont pas remplacés par les rapports de mouvement du client.

## Sièges et sons

`seat_requests` mémorise la demande, les deux postes, les titulaires et l’ordre
des signatures. Le transfert vérifie encore les affectations originales dans
la transaction qui retire et réattribue les sièges. Les contraintes uniques
empêchent tout doublon. Les demandes expirent aussi après deux minutes. Le
client élu pour les appareils sans pilote ne peut relayer que leurs états,
jamais ceux d’un appareil dont le cockpit est occupé.

Le son de gain suit le compteur de récompenses, distinct du solde dépensable.
`RewardQueue` établit une base au chargement, ignore les répétitions et joue les
notes de machine à sous sans superposition, une sonnerie par dollar. Le volume,
le muet et les restrictions d’activation audio du navigateur restent applicables.

## Vérification

`test-backlog.mjs` couvre les PV, dégâts absolus, retries, mondes isolés, cinq
puis trois signatures, résurrections et libération définitive des âmes.
`test-seat-contracts.mjs` couvre les transferts, échanges, refus, concurrence,
déconnexion, variantes et séquence sonore. Les suites existantes continuent de
vérifier les vagues, la physique locale, le réseau, les signatures et les achats.
Le navigateur de contrôle utilise le rendu logiciel et refuse Pointer Lock :
le ressenti du tir, du pilotage et l’écoute multijoueur restent à confirmer sur
des appareils réels.

Chute et observation avant l'âme : [incarnation, chute et retour](walking-network.md#incarnation-chute-et-retour) ;
lits : [lits et réapparition](logistics-contracts.md#lits-et-réapparition). La récidive
super → super reste immédiate.

## Pistolet du purgatoire

Caméra à la troisième personne, cible à 1,55 m de référence au-dessus des pieds et
décalage d'épaule de 0,70 m, multipliés par le ratio du monde. Le bras droit suit la
visée ; la bouche est un nœud réel du modèle. Un premier rayon trouve le point sous
le réticule, un second part du canon vers ce point et revérifie cibles et obstacles
(mobilier, guichet et sol bloquent ; jamais de tir dans le dos). Portée 150 m de
référence, 10 dégâts, semi-automatique, 120 balles par incarnation sans recharge,
interdit en poste. Le traceur part devant la bouche (`makeShotTrace`). Code :
`personal-aim.ts` ; régression : `test-pistol-ammo.mjs`, `diagnose-rear-trace.mjs`.

Nouveaux PV : moustique 70, rat 5 000, araignée pondeuse 1 200, bébé araignée 20. Voir [bestiaire](enemy-bestiary.md) pour la naissance et les conséquences des 100 points potentiels d'infestation.
