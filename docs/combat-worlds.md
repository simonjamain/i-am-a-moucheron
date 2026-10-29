# Combat, mondes et contrats

## Dégâts absolus

| Cible             |  PV |
| ----------------- | --: |
| Moucheron, fourmi | 100 |
| Voltigeur         | 200 |
| Cafard            | 300 |
| Carapace          | 400 |
| Bourdon blindé    | 800 |
| Joueur            | 100 |

Une mitrailleuse inflige 75 dégâts de base. L’amélioration existante conserve
son multiplicateur relatif : 75 × (1 + niveau), jusqu’au niveau 3 ; elle ne
s’applique pas au pistolet. Celui-ci inflige toujours 10 dégâts à pied, un tir
par appui, sans délai entre deux appuis distincts. Maintenir ne répète pas le tir.
Le corps visible du personnage porte le pistolet ; le rayon vise le réticule.

Un obus de DCA au contact direct inflige 200 dégâts à sa seule cible et disparaît,
sans explosion. Sa fusée programmée, en l’absence d’impact précédent, explose :
80 dégâts au centre, décroissance linéaire à 20 au bord inclus, zéro au-delà.
Les obstacles masquent le souffle. Les contacts solides conservent la distance
minimale de sécurité. Un projectile supprimé ne déclenche aucun second impact.
`combat.js` porte la classification d’impact et la courbe de souffle.

## Autorité et persistance

Les clients conservent leur autorité sur les mouvements et les impacts déclarés.
D1 valide les opérations persistantes. `health_hits` déduplique par tireur, cible,
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
La migration additive `0009_player_worlds.sql` conserve les données existantes.

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
