# Laboratoire de test par room

Le bouton **Laboratoire** est disponible dans chaque salle connectée au runtime Node/UDP. Un joueur connecté peut activer ce mode pour **toute la room** ; aucun accès administratif extérieur n'est prévu. Le mode est visible par tous les membres. Les autres rooms restent normales.

## Ce que permet le mode

- L'activation ouvre la préparation de la première vague si la mission n'a pas commencé, et débloque une fois tous les plans de construction et d'amélioration du conseil, y compris la tourelle du Castor.
- Le bouton **Ajouter un niveau** permet d'obtenir n'importe quelle carte précise sans attendre un tirage au sort ; il augmente le niveau du plan pour la room.
- La caisse est réapprovisionnée à 1 milliard de dollars lors de chaque traitement serveur. Le HUD indique « ∞ » : les achats, poses, réparations et services restent soumis à leurs signatures, à leurs validations et aux limites physiques/techniques, mais l'argent ne constitue pas un obstacle.
- **Préparer** choisit une vague entre 1 et 100, sans lancer de chronomètre. **Lancer immédiatement** démarre cette vague. **Terminer** marque tous ses ennemis vaincus pour tester la suite sans infestation.
- Le panneau existant **Équilibrage et nuées** continue de gérer les multiplicateurs et les apparitions manuelles. Il n'est pas dupliqué.

## Scénarios

**Enregistrer l'état** capture le numéro de vague, son tirage de roster disponible, l'équilibrage, les plans, les améliorations, les installations placées, les véhicules et les défenses au sol. **Recharger** réinitialise les joueurs au départ, restaure les équipements et revient à la **préparation** de la vague capturée : en combat, cette même composition peut être relancée depuis son début. Les places d'équipage, les tirs en cours, les morts, les dégâts et positions des ennemis en cours de combat ne sont pas restaurés. Les achats non posés ne sont pas mémorisés. Cela permet de reproduire une configuration, pas d'enregistrer une frame exacte de la simulation.

Maximum **5 scénarios par room** (le plus ancien est remplacé au sixième). Les scénarios sont **temporaires et non exportés** : un redémarrage Node, la suppression de la room ou la sortie du laboratoire les effacent. Ils ne sont envoyés aux clients que sous forme de résumés (nom, numéro et phase).

## Sécurité et isolation

La commande fiable UDP `lab` exige une session rattachée à la room et une epoch courante ; toutes les mutations ont lieu exclusivement sur le serveur. Toute action de laboratoire autre que l'activation exige le mode actif. Une sortie désactive le mode **et réinitialise intégralement la partie** afin qu'aucune progression de test ne pollue la partie normale. La commande habituelle de remise à zéro conserve le mode actif et ses scénarios. Les limites de placement, populations maximales, collisions, contrats et physiques ne sont pas contournées.

## Vérifier

`node scripts/test-laboratory.mjs` et `npm test`. Tester manuellement avec deux navigateurs connectés dans une room, puis un troisième dans une room différente. Contrôler les achats, les poses, les cartes, l'interruption/reprise de vague et le rechargement d'un scénario avec véhicules et barricades. Le réseau WAN WebRTC, le rendu WebGL et les sensations de placement nécessitent un essai sur la VM réelle.
