# Progression des vagues et du magasin

Réglage du 29 octobre 2026. L’objectif est un achat utile presque à chaque vague
pour l’équipe, sans dépendre du délai de service des âmes. Les PV et dégâts des
armes restent ceux de [combat-worlds](combat-worlds.md).

## Départ et montée en difficulté

| Vague | Budget | Prime commune immédiate | Nouveauté autorisée             |
| ----- | -----: | ----------------------: | ------------------------------- |
| 1     |      6 |                     4 $ | 6 moucherons seulement          |
| 2     |      8 |                     5 $ | Même famille                    |
| 3     |     12 |                     6 $ | Fourmis                         |
| 4     |     16 |                     7 $ | Premier voltigeur possible      |
| 5     |     22 |                     8 $ | Consolidation                   |
| 6     |     28 |                     9 $ | Premier cafard possible         |
| 8     |     44 |                    11 $ | Première carapace possible      |
| 12    |     88 |                    15 $ | Premier bourdon blindé possible |

Le budget est `6 + 2 × (n−1) + floor((n−1)² / 2)`, plafonné à 2400.
Les ennemis coûtant plus d’un point occupent au maximum 40 % du budget et sont
limités par type à un exemplaire lors du déblocage, puis un supplémentaire toutes
les trois vagues. Le tirage est déterministe pour une salle et un départ donnés.
Un budget n’est pas un nombre d’ennemis : les plus résistants coûtent davantage.

Les trajets comportent désormais des détours avant l’approche de la poubelle,
avec navigation statique autour du mobilier. La vitesse effective précédente est
conservée et la durée découle de la longueur, sans l’ancien plafond de 145 secondes.
La première vague dure environ une minute sans interception sur la graine de
contrôle, et se termine plus tôt si tous les ennemis sont abattus. Le lancement initial de dix secondes et les pauses entre vagues de soixante
secondes restent séparés. Voir [trajets et crashs](vehicles-bank.md#trajets-et-crashs)
pour la calibration et les limites de navigation.

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
