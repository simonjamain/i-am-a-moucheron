# Progression des vagues et du magasin

Réglage du 29 octobre 2026. L’objectif est un achat utile presque à chaque vague
pour l’équipe, sans dépendre du délai de service des âmes. Les PV et dégâts des
armes restent ceux de [combat-worlds](combat-worlds.md).

## Départ et montée en difficulté

Le directeur Node tire la composition **dès l’annonce de la vague**. Chaque insecte consomme sa **puissance** (calculée, voir [équilibrage](room-balance.md#puissance-unité-commune)). Le budget est `32 × 1,5^(n−1) × N^0,9` pour `N` joueurs de la room (joueurs au purgatoire compris, compté à l'annonce de la vague), **sans plafond** et sans lien avec l'argent gagné. Pour un joueur, les vagues 1, 2, 5, 10 et 15 valent environ 32, 38, 66, 165 et 411 de puissance. Les puissances étant fractionnaires, le roster dépense le budget à moins de 0,6 près ; au-delà de la population technique de 900, le reliquat renforce (PV et puissance) le dernier paquet de l'espèce la plus forte. Depuis la version 274, la vague est composée de **paquets** compacts
(`PACKS` et `packSize` dans `server/wave-preparation.js`) : les insectes bon marché
arrivent en foules — fourmis de 8 à 200, moucherons de 20 à 400, moustiques de 6 à 60,
croissant avec le budget — et jamais presque seuls ; plus une espèce est grosse et
puissante, plus son paquet est petit (cafards 2 à 8, abeilles 1 à 4,
scarabées 1 à 2, araignées et rats seuls). Une première colonne de fourmis sort à 0 s,
la nuée de moucherons à 1–2 s ; le reste suit à intervalles courts (les ennemis isolés
arrivent par grappes). Les foules d'une même espèce partagent le plus souvent
entrée et parcours ; les espèces fortes ont chacune le leur. Le reliquat de budget
grossit un paquet existant au lieu de créer de petits groupes. Les membres d'un
paquet partent l'un après l'autre (`memberGap`) ; la prévision annonce un groupe par
paquet. Au sol, les créatures quittent l'entrée à intervalles courts, puis
suivent individuellement la navigation et évitent doucement leurs voisins ; voir
[navigation terrestre](gameplay.md#navigation-terrestre). Les positions réelles
remplacent les anciennes files d'affichage. Le tirage conserve les déblocages du bestiaire et borne à 900 la population avant le multiplicateur de room. La difficulté affichée (« MENACE ») additionne les puissances du roster réellement envoyé. La progression seule ne modifie ni les PV individuels ni les dégâts.

Le lancement initial dure 60 secondes par défaut et les pauses entre vagues 180 secondes (3 minutes). Le bandeau affiche la prochaine vague et sa frise (entrées, horaires, espèces). Tout joueur peut lancer la vague annoncée avant l’échéance ; à l’échéance, elle démarre seule.

Depuis la version 264, il n’y a **plus de vote ni de cartes de plans** entre les vagues, ni les améliorations d’équipe qui en découlaient (sucre parfumé, balles traversantes, renfort, colle renforcée). Les constructions du Castor (tourelle automatique, bunker LEGO, canon antichar) ne demandent plus de plan : leur prix en dollars suffit. Les commandes `wave-vote` et `wave-buy` n’existent plus. La caisse initiale vaut 0 $ par défaut. Dès la première préparation, l’équipe peut signer l’une des trois offres de la banque (12 à 40 $) pour financer ses premières constructions. Les échéances restent dues à chaque fin de vague. La remise à zéro efface les objets.

## Revenus et prix

Le directeur Node ne verse **aucune prime de vague** (`waveStipend` et l'affichage
`waveReward` sont supprimés). Les âmes libérées par Saint-Pierre ou par le pistolet
rapportent **la puissance de leur espèce** en dollars (multipliée par le réglage
`rewards`) ; tuer dans le bureau ne crédite rien directement. Une vague de puissance
W rapporte donc au plus W $. L'ancienne prime `min(20, 3 + n)` n'existe plus.

| Achat                              | Prix                                               |
| ---------------------------------- | -------------------------------------------------- |
| Chasseur biplan supplémentaire     | 5 $                                                |
| Bombardier biplan supplémentaire   | 5 $                                                |
| Char moyen supplémentaire          | 5 $                                                |
| Flak léger, exemplaires successifs | 5 $, 7 $, 9 $… +2 $ par installation, plafond 40 $ |
| Radar                              | 10 $, +2 $ par installation                        |
| Lit de réapparition                | 15 $, +2 $ par installation                        |
| Station de ravitaillement          | 20 $, +2 $ par installation                        |
| Castor                             | 15 $                                               |
| Anti-air mobile                    | 15 $                                               |
| Stuka                              | 25 $                                               |
| Flak lourd                         | 30 $                                               |
| Castor volant                      | 35 $                                               |
| Hélicoptère d’attaque au sol       | 50 $                                               |
| DCA haute cadence                  | 50 $                                               |
| Spitfire                           | 75 $                                               |

Il n’y a plus d’améliorations achetables (motorisation, munitions renforcées) :
la colonne du magasin, leurs prix et leur code ont disparu. Le chasseur, le
bombardier et le char moyen ont chacun une **réserve gratuite et infinie** au sol
à Alpha (voir [réserves](multiplayer-return.md#réserves-gratuites-et-achats-de-véhicules)).

Sans revenu d’âme, les primes ne financent plus rien : seules les âmes libérées
rapportent. La monnaie appartient à la salle.

`shopPrice` est partagé entre affichage et serveur. La transaction revalide le
niveau et le nombre d’installations posées ou prépayées avant de débiter : deux achats concurrents
ne peuvent pas obtenir le même ancien tarif. Un tarif affiché devenu obsolète
est refusé avant débit pour laisser le joueur confirmer le nouveau prix. Un retry conserve sa transaction
initiale. Le compteur sonore reste distinct du solde dépensable. Reset efface
tout l'état de la partie (en RAM, sans migration).

## Vérifications

`test-progression.mjs` exerce 40 tirages sur les douze premières vagues, les
plafonds d’élites, la durée initiale, un parcours d’achats sans revenus d’âmes,
les prix par palier,
une vague entièrement manquée, la défaite et le reset. Les tests d’économie
existants gardent leurs contrôles de placement et d’achats concurrents.
Le ressenti des trajectoires et du combat reste à confirmer en partie réelle.

Les portails restent à au moins trois mètres du décor de la corbeille ;
[retours de partie](party-feedback.md) précise les premières images et la connexion tardive.

Sur Node, les primes et commandes sont dédupliquées en RAM. Les noms de tables
et migrations mentionnés plus haut décrivent l'ancien modèle à base de données,
abandonné. La progression disparaît au redémarrage.

Installations Node : le [bon signé](clean-flight.md#prix-bon-signé-et-pose) débite
avant la pose ; annuler l’aperçu ne fait pas perdre l’objet payé.

Historique VAG-04/VAG-05 : [parcours et budget](multiplayer-return.md#parcours-et-fourmis-précoces),
budget initial 8, autrefois quatre fourmis en vague 1 ; le directeur historique garantissait
deux fourmis à toutes les vagues, avec coûts/PV inchangés.
Les achats de chasseur et bombardier supplémentaires coûtent 8 $ et 16 $.

Le H2 coûte 30 $, le camion D2 20 $, sans remplacement gratuit. Voir
[les véhicules d’appui](support-vehicles.md) pour les choix d’équilibrage.

Le [lot confort de jeu, version 37](comfort.md) précise réparation, zoom, jauges,
radar à pied, remise à zéro, fourmis et projectiles du pistolet courants.

Les [issues 15–17](issues-15-16-17.md) précisent la descente continue des colis,
le mapping Maj/Ctrl et tangage du H2, et la réduction supplémentaire des vitesses terrestres.
