# Puissance des ennemis et budget des vagues

Les règles d’une room sont fixes : `DEFAULT_BALANCE` (`src/balance.js`) donne les
multiplicateurs (dégâts, vitesses, prix, pauses, caisse initiale…) appliqués à toutes
les rooms. Le panneau de réglage par room, `balance` et `debug-spawn` n’existent plus ;
les tests composent un roster exact avec `debugSwarmRoster` (`src/waves.ts`).

## Unité commune

Issue #210. La **puissance** mesure ennemis, vagues, récompenses et dégâts à la
poubelle : un joueur de puissance 1 élimine un ennemi de puissance 1 pendant une
vague. Elle est **calculée** par `computeEnemyPower` (`src/enemy-power.ts`), jamais
saisie, et exposée par `ENEMY_POWER` / `ENEMY_TYPES[type].power` (`src/waves.ts`).

```
puissance = PV/PV_réf × vitesse/vitesse_réf × √(taille_réf/taille)
          × (terrestre : 1/1,5) × powerFactor (1 par défaut)
          + descendance (count × puissance du petit)
```

L'étalon `POWER_REFERENCE` (PV 100, 0,11 m/s, taille 1, volant) est figé : la formule
ne lit jamais `ENEMY_TYPES.midge`. Pour rendre le jeu plus facile ou plus dur, agir
sur la progression ou l'économie, pas sur l'étalon. Les champs `cost` et `leak` des
espèces n'existent plus.

| Règle           | Valeur                                                                      |
| --------------- | --------------------------------------------------------------------------- |
| Budget de vague | `W(1) × g^(n−1) × N^e`, sans plafond (défauts 32, 1,5, 0,9)                 |
| Joueurs `N`     | pilotes de la room, purgatoire compris, relevés au tirage de la vague       |
| Récompense      | puissance de l'espèce par âme libérée × réglage `rewards` ; plus de prime   |
| Dégâts poubelle | puissance de l'ennemi qui l'atteint ; défaite à 20 d'infestation            |
| Affichage       | puissance de la vague (frise), puissance par espèce (mode debug, bestiaire) |

Réglages de `BALANCE_FIELDS` ajoutés, validés par `validateBalance` (pas de plafond) :
`waveGrowth` (g, min 1, pas 0,05), `firstWavePower` (W(1), min 1, pas 1) et
`playerExponent` (e, min 0, pas 0,05). Avec g = 1,5, le plafond technique de 900 ennemis est atteint vers la vague 9 ; au-delà, la puissance restante va au colosse, sans plafond de puissance. `scripts/test-enemy-power.mjs` couvre formule,
étalon, descendance, budget, récompenses et dégâts.

Pour tester sans contraintes de jeu, utiliser l’interrupteur direct du
[mode debug](laboratory.md) (Debug : ON / OFF, sans panneau d’outils depuis l’issue #135). `scripts/test-debug-mode.mjs` vérifie que les deux
commandes retirées sont refusées par le serveur.
