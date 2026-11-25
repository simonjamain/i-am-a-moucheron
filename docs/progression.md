# Vagues, puissance et magasin

Le directeur de vagues (`server/wave-preparation.js`) compose chaque vague à partir
d’un budget de **puissance** ; les âmes libérées rapportent cette même puissance en
dollars, que l’équipe dépense au magasin. PV et dégâts des espèces : voir le
[bestiaire](enemy-bestiary.md) ; garanties d’achat et services payants : voir
[économie](economy.md).

## Unité commune

La **puissance** mesure ennemis, vagues, récompenses et dégâts à la poubelle : un
joueur de puissance 1 élimine un ennemi de puissance 1 pendant une vague. Elle est
**calculée** par `computeEnemyPower` (`src/enemy-power.ts`), jamais saisie, et exposée
par `ENEMY_POWER` / `ENEMY_TYPES[type].power` (`src/waves.ts`).

```
puissance = PV/PV_réf × vitesse/vitesse_réf × √(taille_réf/taille)
          × (terrestre : 1/1,5) × powerFactor (1 par défaut)
          + descendance (count × puissance du petit)
```

L’étalon `POWER_REFERENCE` (PV 100, 0,11 m/s, taille 1, volant) est figé : la formule
ne lit jamais `ENEMY_TYPES.midge`. Pour rendre le jeu plus facile ou plus dur, agir
sur la progression ou l’économie, pas sur l’étalon.

| Usage           | Règle                                                                       |
| --------------- | --------------------------------------------------------------------------- |
| Budget de vague | `W(1) × g^(n−1) × N^e`, sans plafond                                        |
| Récompense      | puissance de l’espèce par âme libérée × réglage `rewards`                   |
| Dégâts poubelle | puissance de l’ennemi qui l’atteint ; défaite à 20 d’infestation            |
| Affichage       | puissance de la vague (frise), puissance par espèce (mode debug, bestiaire) |

## Budget de vague

`directorBudget` vaut `32 × 1,5^(n−1) × N^0,9` (`firstWavePower`, `waveGrowth`,
`playerExponent` de `DEFAULT_BALANCE`), sans plafond et sans lien avec l’argent gagné.
`N` compte tous les pilotes de la room, purgatoire compris, au moment où la vague est
préparée. Pour un joueur, les vagues 1, 2, 5, 10 et 15 valent environ 32, 48, 162,
1 230 et 9 340 de puissance.

Les règles d’une room sont fixes : `DEFAULT_BALANCE` (`src/balance.ts`) donne les
multiplicateurs (dégâts, vitesses, prix, récompenses, pauses, caisse initiale…) de
toutes les rooms ; aucune commande ne les modifie. Les tests composent un roster exact
avec `debugSwarmRoster` (`src/waves.ts`).

## Composition

`prepareRoster` tire la composition **dès l’annonce** de la vague, ce qui alimente la
frise (entrées, horaires, espèces) et la « MENACE », somme des puissances du roster
réellement envoyé.

- **Paquets.** La vague est faite de paquets compacts (`PACKS`, `packSize`) dont la
  taille croît avec le budget : moucherons de 20 à 400, fourmis de 8 à 200, moustiques
  de 6 à 60, cafards 2 à 8, abeilles 1 à 4, scarabées 1 à 2, araignées et rats seuls.
  Une colonne de fourmis sort à 0 s, une nuée de moucherons à 1–2 s ; le reste suit à
  intervalles courts, les ennemis isolés arrivant par grappes.
- **Aucun déblocage.** Toute espèce dont la puissance tient dans le budget restant peut
  être tirée dès la vague 1 ; les espèces fortes sont tirées plus souvent quand le budget
  grandit. Le directeur ne lit dans `ENEMY_UNLOCK_WAVE` que la liste et l’ordre des
  espèces ; ses numéros de vague ne servent qu’au repli `wavePlan`.
- **Parcours.** Les foules d’une même espèce partagent le plus souvent entrée et
  parcours ; les espèces fortes ont chacune le leur. Les membres d’un paquet partent l’un
  après l’autre (`memberGap`) ; la prévision annonce un groupe par paquet. Au sol, voir
  [navigation terrestre](gameplay.md#navigation-terrestre).
- **Reliquat.** Les puissances étant fractionnaires, le budget est dépensé à moins d’une
  espèce près. Un petit reliquat d’espèce de foule grossit un paquet existant. Au-delà
  de la population technique (`MAX_WAVE_POPULATION`, 900), le reste renforce PV et
  puissance du dernier paquet de l’espèce la plus forte (« colosse »).

## Calendrier

Le lancement initial dure 60 s et les pauses entre vagues 180 s (`initialDelay`,
`pause`). Tout joueur peut lancer la vague annoncée avant l’échéance ; à l’échéance,
elle démarre seule.

La caisse initiale vaut 0 $ (`startingMoney`). Dès la première préparation, l’équipe peut signer l’une des
offres de la banque (12 à 40 $, voir [banque](bank.md)) ; les échéances sont
dues à chaque fin de vague. Toute la partie vit en RAM : une remise à zéro ou un
redémarrage efface vague, caisse, achats et objets.

## Revenus et prix

Il n’y a **aucune prime de vague** : seules les âmes libérées rapportent la puissance
de leur espèce ([revenus](economy.md#revenus)). L’âme d’une araignée pondeuse paie sa
puissance descendance comprise, puis chaque âme de bébé paie la sienne ; l’âme d’un
colosse paie la puissance de base de son espèce. La monnaie appartient à la salle.

Les prix viennent de `SHOP` et `shopPrice` (`src/equipment.ts`), partagés par
l’affichage et le serveur ; la colonne du magasin est dans `src/shop-catalog.ts`.

| Achat                            | Prix                                   |
| -------------------------------- | -------------------------------------- |
| Chasseur biplan supplémentaire   | 5 $                                    |
| Bombardier biplan supplémentaire | 5 $                                    |
| Char moyen                       | 5 $                                    |
| Flak léger                       | 5 $, +2 $ par exemplaire, plafond 40 $ |
| Radar                            | 10 $, +2 $ par exemplaire              |
| Lit de réapparition              | 15 $, +2 $ par exemplaire              |
| Station de ravitaillement        | 20 $, +2 $ par exemplaire              |
| Chasseur léger, bombardier moyen | 15 $ chacun                            |
| Castor, anti-air mobile          | 15 $ chacun                            |
| Stuka d’attaque au sol           | 25 $                                   |
| Flak lourd                       | 30 $                                   |
| Castor volant                    | 35 $                                   |
| Hélicoptère d’attaque au sol     | 50 $                                   |
| DCA haute cadence                | 50 $                                   |
| Spitfire                         | 75 $                                   |

Les paliers comptent les exemplaires posés, les colis en cours et les bons payés non
posés (`purchaseCount`) ; la station gratuite d’Alpha ne compte pas. Le chasseur, le
bombardier biplan et le char ont aussi une **réserve gratuite** au sol à Alpha (voir
[engins](gameplay.md#engins)). Il n’y a
pas d’amélioration achetable. Les constructions du Castor ont leur propre tarif
(murs au tronçon, voir [économie](economy.md#constructions-au-tronçon)).

## Vérifier

- `scripts/test-enemy-power.mjs` : formule, étalon, descendance, budget, récompenses,
  dégâts à la poubelle.
- `scripts/test-wave-preparation.mjs` : prévision, budget, paquets, lancement anticipé
  par tout joueur ou à l’échéance, remise à zéro.
- `scripts/test-progression.mjs` : ancien tirage `wavePlan` (`src/waves.ts`), encore
  utilisé par `Game.plan` comme repli quand aucune vague n’a été préparée.
- `scripts/test-shop-catalog.mjs` : catalogue du magasin.

Le ressenti des vagues reste à confirmer en partie réelle.
