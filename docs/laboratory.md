# Mode debug par room

Le bouton **Debug : OFF / Debug : ON** (en haut à droite) est disponible dans chaque salle connectée au runtime Node/UDP. C'est un **interrupteur direct** ([issue #135](https://github.com/simonjamain/i-am-a-moucheron/issues/135)) : un clic l'active pour **toute la room**, le clic suivant le désactive, sans menu, panneau ni confirmation. L'état actif est visible sur le bouton (« Debug : ON », fond clair, `aria-pressed`) pour tous les membres. Les autres rooms restent normales. Le code interne garde le nom `lab` (commande serveur, `lab-ui.ts`).

## Effets du mode actif

- L'activation ouvre la préparation de la première vague si la mission n'a pas commencé. Il n'y a plus de plans à débloquer : toutes les constructions sont déjà accessibles à leur prix.
- **Caisse illimitée** : la caisse est réapprovisionnée à 1 milliard de dollars à chaque traitement serveur ; le HUD indique « ∞ ». Achats, poses, réparations et services restent soumis à leurs signatures, validations et limites physiques.
- **Aucun dégât de chute** : les impacts au sol (`fall-impact`) sont ignorés.
- **Défaite impossible** : la poubelle continue de compter ses dégâts (`infestation`), mais la fin de vague ouvre toujours la préparation suivante. Le HUD affiche les PV restants de la poubelle, même négatifs.

## Tester les ennemis (version 320)

Pendant une **vague** en mode debug, le marchand (**P**) affiche deux colonnes
supplémentaires, avec une carte par espèce (les neuf, bébé araignée compris) :

- **Mannequins** : l'ennemi se pose au point visé — sur le sol ou le meuble visé pour
  un marcheur, en vol stationnaire à 10 cm devant la caméra (ou plus près d'une
  surface) pour un volant. Il reste immobile, tourné vers celui qui l'a posé, et fait
  son animation sur place (marche ou battement d'ailes). Il est **invulnérable** :
  armes, explosions et **tourelles** le touchent et comptent leurs dégâts, sans jamais
  le tuer. Au-dessus de lui s'affiche en gros le **dernier dégât reçu** (« −38 ») et,
  dessous, le **total des 3 dernières secondes** (une explosion ou une rafale touche
  souvent plusieurs fois). Avant le premier coup, l'étiquette donne son nom.
- **Ennemis réels** : mêmes PV et vitesse qu'en vague. Un marcheur part
  du **sol sous le point visé** et suit la navigation terrestre jusqu'à la poubelle.
  Un volant va en ligne droite vers le **point le plus proche d'un couloir aérien
  habituel** (en passant au-dessus d'un meuble gênant), puis finit le parcours normal
  de ce couloir : il teste les défenses dans les conditions d'une vraie vague.
  Un moucheron posé est seul (pas de nuée ×5).

Après le choix d'une carte, le marchand se ferme : un repère montre le point visé,
**clic gauche ou E** pose **un** ennemi (on peut en poser d'autres), **Échap** quitte.
Le serveur ramène dans la pièce un point visé à moins de 10 cm du sol ou des bords
praticables (arrondi d'un tir au sol juste sous y = 0, visée au pied d'un mur).
Le bouton **Retirer les mannequins** les enlève tous, sans âme envoyée au purgatoire.
Il n'y a pas de limite de nombre (utile pour tester la charge). Tant qu'un mannequin
est debout, la vague ne se termine pas. Les ennemis posés sont partagés par la room
et disparaissent avec la réinitialisation qui suit la sortie du mode debug.

Toujours visibles en mode debug, sans réglage :

- **hitbox** de chaque ennemi en fil de fer rose : l'ellipsoïde ou la sphère que les
  tirs testent réellement (`insect-hits.ts`, tolérance comprise) ;
- **portée des tourelles automatiques** : bulle orange translucide de 42 cm de rayon,
  centrée comme le serveur la mesure (2,5 cm au-dessus du support), et cercle net à sa
  base ;
- **rayon d'attraction du sucre** : cercle jaune au sol.

Côté serveur, la commande `lab` accepte `place` (`kind` : `dummy` ou `live`, `type`,
`p`, `dir`) et `clear-dummies`, en mode debug et pendant une vague seulement ; les
ennemis sont ajoutés au roster de la vague comme une ponte (`src/debug-enemies.ts`).
Un mannequin a 10⁹ PV et ne heurte pas les véhicules. Le client est dans
`src/debug-tools.ts`.

Les anciens outils de laboratoire (ajout manuel de niveaux de carte, choix, lancement et achèvement forcé de vagues, scénarios enregistrés) ont été **retirés** avec leur interface et leurs commandes serveur. L'équilibrage par room reste retiré ([historique](enemy-power.md)).

## Sortie et sécurité

La commande fiable UDP `lab` n'accepte que `enable`, `exit`, `place` et `clear-dummies`, exige une session rattachée à la room et l'epoch courante ; toute autre action est refusée. **Désactiver le mode réinitialise intégralement la partie** (vague, plans, caisse, joueurs au départ), comme avant, afin qu'aucune progression de test ne pollue la partie normale. La remise à zéro habituelle conserve le mode actif. Les limites de placement, populations maximales, collisions, contrats et physiques ne sont pas contournées.

## Vérifier

`node scripts/test-laboratory.mjs`, `node scripts/test-debug-mode.mjs`, `node scripts/test-debug-enemies.mjs` et `npm test`. Tester manuellement avec deux navigateurs connectés dans une room, puis un troisième dans une room différente : activation, effets, désactivation et réinitialisation. Le réseau WAN WebRTC et le rendu nécessitent un essai sur la VM réelle.
