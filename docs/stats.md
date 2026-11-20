# Statistiques de puissance pratique des équipements

Les équipements ont une puissance théorique, liée à leur prix. Cette page de référence
décrit comment le serveur mesure leur puissance **pratique** pendant les parties, et
comment lire le résultat. Les chiffres servent à recaler les prix et à repérer les
équipements trop avantageux ou inutiles ; ils ne changent rien au jeu.

## Consulter

- `/stats` : page de graphiques interprétés (efficacité par poste, alignement du prix,
  taux d'occupation, tableaux détaillés). Filtres : version du jeu, nombre de joueurs
  (1, 2-3, 4-6, 7 et plus), vagues (1-4, 5-9, 10 et plus). Elle se rafraîchit toute seule.
- `/stats.json` : les mêmes données consolidées, avec les paramètres `version`, `n` et
  `wave` (`n=2-3`, `wave=5-9`).

Aucun nom de joueur n'apparaît. Si `STATS_TOKEN` est défini, les deux routes exigent
`?token=…` ou l'en-tête `Authorization: Bearer …` (401 sinon). Sans jeton elles sont
publiques, comme `/healthz`.

## Persistance

Le serveur garde les parties en RAM, mais les statistiques doivent survivre aux
déploiements. Avec `STATS_FILE=/chemin/stats.json`, elles sont écrites toutes les 30 s
(au plus), à l'arrêt du serveur et rechargées au démarrage. Le conteneur est lancé en
lecture seule : monter un volume sur le dossier du fichier, par exemple
`-v moucheron-stats:/stats -e STATS_FILE=/stats/stats.json` (le dossier doit être
inscriptible par l'utilisateur `node`). Sans `STATS_FILE`, les mesures vivent jusqu'au
redémarrage. Le fichier regroupe les échantillons par version du jeu : un changement de
prix ne se mélange pas aux mesures précédentes.

## Ce qui est mesuré

**Puissance délivrée.** À chaque dégât infligé à un ennemi, le poste qui tire reçoit
`dégâts effectifs / PV de l'ennemi × puissance de l'ennemi` (unité de l'[issue 210](enemy-power.md#unité-commune)).
Pas de « dernier coup » : le crédit est proportionnel aux dégâts. Les dégâts au-delà des
PV restants ne comptent pas. La puissance est séparée par cible (volante ou terrestre) et par arme
(`mg`, `rapid`, `bomb`, `rocket`, `missile`…).

**Poste.** La clé est _type d'équipement + poste_, par exemple `medbomber|tail`. Les
tourelles fixes ont un poste `operator`, le pistolet (à pied) `pistol|foot`, la
tourelle automatique du Castor `sentry|auto` (sans joueur).

**Temps d'occupation.** Pendant une vague, chaque poste tenu par un pilote vivant
accumule des secondes. Un intervalle entre deux mises à jour ne compte jamais plus de
2 s. Le véhicule lui-même compte une fois, quel que soit le nombre d'occupants.

**Coût réel.** Prix d'achat (bon signé, achat direct, constructions du Castor) plus
dollars de service (réparation, carburant, munitions) payés à la station ; et le
nombre de pertes (coque détruite).

Le mode debug n'est jamais mesuré. Les compteurs d'une salle deviennent des échantillons
à la fin de chaque vague ; la vague en cours et les salles réinitialisées ne sont pas
comptées.

## Interpréter

- **Indice d'efficacité** : puissance par minute de joueur du poste, divisée par celle
  du chasseur biplan gratuit (étalon « joueur de base », 1,0). La comparaison se fait
  par minute de **joueur** : un bombardier à quatre postes mobilise quatre joueurs, un
  Spitfire un seul. Le trait fin du graphique va du 1er au 3e quartile des vagues.
- **Taux d'occupation** : postes tenus ÷ (postes × minutes d'usage). Un véhicule payé pour
  plusieurs postes mais piloté seul vaut moins que son prix.
- **Alignement du prix** : puissance par dollar dépensé de l'équipement, divisée par la
  médiane des équipements achetés. Au-dessus de 1 + 30 % : _sous-payé_ (il rapporte plus
  que son coût) ; en dessous de 1 − 30 % : _sur-payé_ ; entre les deux : _aligné_. Le _prix
  équitable_ est le prix actuel multiplié par ce rapport.
- **Garde-fous** : sous 10 minutes de joueur, la ligne est _insuffisante_ et n'est pas
  classée. Les équipements gratuits (jamais achetés) n'ont pas de prix équitable.
- **Pilote sans arme.** Le pilote d'un bombardier qui ne largue pas lui-même rend
  possible le travail de ses mitrailleurs sans être crédité : le bilan du véhicule
  (somme des postes) reste exact, la lecture par poste est celle de l'arme tenue.
- Les causes d'un écart ne sont pas toujours le prix : conception, rôle qui demande de
  la coordination, ou simple manque de données (regarder aussi le taux d'occupation et
  les minutes mesurées).

## Limites

- Les armes lourdes sont simulées chez le tireur, qui rapporte ses impacts : la mesure a
  la même fiabilité que le jeu (confiance coopérative).
- Le soutien (radar, station, lit, Castor) n'est pas converti en puissance ; seul son
  coût de service est compté.
- Les remboursements d'achats non posés ne sont pas déduits du coût.
- Un échantillon est une vague : peu de parties donnent de grandes dispersions.
- La mesure n'a pas été comparée à de vraies parties WebGL/UDP.

## Code

`server/stats.ts` (registre, rapport, persistance), `server/stats-page.ts` (page),
`server/game.js` (`statSeat`, `creditEnemy`, `sampleStats` et les points d'attribution),
`src/paid-service.js` (`spentBy`). Test : `scripts/test-stats.mjs`.
