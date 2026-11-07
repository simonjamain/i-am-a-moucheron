# Équilibrage par room (retiré)

Le panneau **Équilibrage et nuées**, la commande `balance` (multiplicateurs par room)
et la commande `debug-spawn` (génération manuelle de nuées par espèce) ont été
retirés en version 231 ([issue #100](https://github.com/simonjamain/i-am-a-moucheron/issues/100)).

Les règles d’une room sont désormais fixes : `DEFAULT_BALANCE` dans `src/balance.js`
reste la référence des multiplicateurs (dégâts, vitesses, prix, pauses, caisse
initiale…), appliqués à toutes les rooms. Les tests se servent directement de
`debugSwarmRoster` (`src/waves.js`) pour composer un roster exact.

Pour tester sans contraintes de jeu, utiliser l’interrupteur unique du
[mode debug](laboratory.md). `scripts/test-debug-mode.mjs` vérifie que les deux
commandes retirées sont refusées par le serveur.
