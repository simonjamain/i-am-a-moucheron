# Progression des vagues et du magasin

Réglage du 29 octobre 2026. L’objectif est un achat utile presque à chaque vague
pour l’équipe, sans dépendre du délai de service des âmes. Les PV et dégâts des
armes restent ceux de [combat-worlds](combat-worlds.md).

## Départ et montée en difficulté

Le directeur Node tire la composition **dès l’annonce de la vague**. Chaque insecte consomme son coût individuel du bestiaire. Le budget est `min(2400, round(32 × 1,5^(n−1)))` avant réglages de room. À population normale, les vagues 1, 2, 5 et 10 coûtent 32, 48, 162 et 1 230 points. Dès la première, une colonne de fourmis sort à 0 s et une nuée aérienne entre 2 et 5 s. Les groupes suivants peuvent arriver ensemble. Le tirage conserve les déblocages du bestiaire et borne à 900 la population avant le multiplicateur de room. La difficulté affichée additionne les coûts du roster réellement envoyé. La progression seule ne modifie ni les PV individuels ni les dégâts.

Le lancement et les pauses durent 60 secondes par défaut. Le bandeau affiche la prochaine vague et sa frise (entrées, horaires, espèces). Tout joueur peut lancer la vague annoncée avant l’échéance ; à l’échéance, elle démarre seule.

Depuis la version 264, il n’y a **plus de vote ni de cartes de plans** entre les vagues, ni les améliorations d’équipe qui en découlaient (sucre parfumé, balles traversantes, renfort, colle renforcée). Les constructions du Castor (tourelle automatique, bunker LEGO, canon antichar) ne demandent plus de plan : leur prix en dollars suffit. Les commandes `wave-vote` et `wave-buy` n’existent plus. La caisse initiale vaut 0 $ par défaut. Dès la première préparation, l’équipe peut signer l’une des trois offres de la banque (12 à 40 $) pour financer ses premières constructions. Les échéances restent dues à chaque fin de vague. La remise à zéro efface les objets.

## Revenus et prix

Chaque vague terminée sans défaite verse immédiatement `min(20, 3 + n)` dollars
communs, même si certains insectes ont atteint la poubelle. Leur infestation reste
comptabilisée. Une vague entraînant la défaite ne verse aucune prime. Les âmes
libérées par Saint-Pierre ou par le pistolet rapportent toujours un dollar chacune,
en supplément ; tuer dans le bureau ne crédite toujours rien directement.

| Achat                           | Prix                                                     |
| ------------------------------- | -------------------------------------------------------- |
| DCA successives                 | 4 $, 6 $, 8 $, 10 $… +2 $ par installation, plafond 40 $ |
| Motorisation, niveaux 1 / 2 / 3 | 4 $ / 9 $ / 16 $                                         |
| Munitions, niveaux 1 / 2 / 3    | 6 $ / 12 $ / 20 $                                        |
| Stuka, chaque exemplaire        | 12 $                                                     |
| Lit, exemplaires successifs     | 4 $, 6 $, 8 $…                                           |
| Spitfire, chaque exemplaire     | 24 $                                                     |
| Tank, chaque exemplaire         | 10 $                                                     |

Sans revenu d’âme, un exemple d’achats après les douze premières vagues est :
DCA, moteur 1, munitions 1, DCA, DCA, moteur 2, DCA, Stuka, DCA,
munitions 2, moteur 3, DCA. Les revenus d’âmes ouvrent davantage de choix.
C’est une possibilité vérifiée, pas une obligation d’achat ni une garantie par
joueur : la monnaie et les améliorations appartiennent à la salle.

`shopPrice` est partagé entre affichage et serveur. La transaction revalide le
niveau et le nombre d’installations posées ou prépayées avant de débiter : deux achats concurrents
ne peuvent pas obtenir le même ancien tarif. Un tarif affiché devenu obsolète
est refusé avant débit pour laisser le joueur confirmer le nouveau prix. Un retry conserve sa transaction
initiale. `wave_rewards` déduplique les primes ; leur somme est incluse dans le
compteur sonore, distinct du solde dépensable. Reset efface ce registre avec le
reste de la partie. La migration additive `0010_wave_rewards.sql` n’efface pas
les monnaies, installations ou niveaux déjà acquis.

## Vérifications

`test-progression.mjs` exerce 40 tirages sur les douze premières vagues, les
plafonds d’élites, la durée initiale, un parcours d’achats sans revenus d’âmes,
les routes HTTP des primes (concurrence et répétitions), les prix par palier,
une vague entièrement manquée, la défaite et le reset. Les tests d’économie
existants gardent leurs contrôles de placement et d’achats concurrents.
Le ressenti des trajectoires et du combat reste à confirmer en partie réelle.

Les portails restent à au moins trois mètres du décor de la corbeille ;
[retours de partie](party-feedback.md) précise les premières images et la connexion tardive.

Sur Node, les primes et commandes sont dédupliquées en RAM. Les noms de tables
et migrations mentionnés plus haut décrivent la compatibilité Worker historique.
La progression actuelle ne dépend pas de D1 et disparaît au redémarrage.

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
