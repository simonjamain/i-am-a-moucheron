# Mode debug par room

Le bouton **Debug : OFF / Debug : ON** (en haut à droite) est disponible dans chaque salle connectée au runtime Node/UDP. C'est un **interrupteur direct** ([issue #135](https://github.com/simonjamain/i-am-a-moucheron/issues/135)) : un clic l'active pour **toute la room**, le clic suivant le désactive, sans menu, panneau ni confirmation. L'état actif est visible sur le bouton (« Debug : ON », fond clair, `aria-pressed`) pour tous les membres. Les autres rooms restent normales. Le code interne garde le nom `lab` (commande serveur, `lab-ui.js`).

## Effets du mode actif

- L'activation ouvre la préparation de la première vague si la mission n'a pas commencé, et débloque tous les plans de construction et d'amélioration du conseil, y compris les constructions du Castor.
- **Caisse illimitée** : la caisse est réapprovisionnée à 1 milliard de dollars à chaque traitement serveur ; le HUD indique « ∞ ». Achats, poses, réparations et services restent soumis à leurs signatures, validations et limites physiques.
- **Aucun dégât de chute** : les impacts au sol (`fall-impact`) sont ignorés.
- **Défaite impossible** : la poubelle continue de compter ses dégâts (`infestation`), mais la fin de vague ouvre toujours la préparation suivante. Le HUD affiche les PV restants de la poubelle, même négatifs.

Les anciens outils de laboratoire (ajout manuel de niveaux de carte, choix, lancement et achèvement forcé de vagues, scénarios enregistrés) ont été **retirés** avec leur interface et leurs commandes serveur. L'équilibrage par room reste retiré ([historique](room-balance.md)).

## Sortie et sécurité

La commande fiable UDP `lab` n'accepte que `enable` et `exit`, exige une session rattachée à la room et l'epoch courante ; toute autre action est refusée. **Désactiver le mode réinitialise intégralement la partie** (vague, plans, caisse, joueurs au départ), comme avant, afin qu'aucune progression de test ne pollue la partie normale. La remise à zéro habituelle conserve le mode actif. Les limites de placement, populations maximales, collisions, contrats et physiques ne sont pas contournées.

## Vérifier

`node scripts/test-laboratory.mjs`, `node scripts/test-debug-mode.mjs` et `npm test`. Tester manuellement avec deux navigateurs connectés dans une room, puis un troisième dans une room différente : activation, effets, désactivation et réinitialisation. Le réseau WAN WebRTC et le rendu nécessitent un essai sur la VM réelle.
