# Mode debug par room

Le bouton **Debug : OFF / Debug : ON** (en haut à droite) est un **interrupteur direct**
disponible dans chaque room : un clic l’active pour **toute la room**, le clic suivant le
désactive, sans menu ni confirmation. L’état est visible sur le bouton (« Debug : ON »,
fond clair, `aria-pressed`) pour tous les membres ; les autres rooms restent normales. Le
code garde le nom `lab` (commande serveur `lab`, `src/lab-ui.ts`).

## Effets du mode actif

- L’activation ouvre la préparation de la première vague si la mission n’a pas commencé.
- **Caisse illimitée** : la caisse est remise à 1 milliard de dollars (`LAB_FUNDS`) à
  chaque traitement serveur ; le HUD indique « ∞ ». Achats, poses, réparations et
  services restent soumis à leurs signatures, validations et limites physiques.
- **Aucun dégât de chute** : les impacts au sol (`fall-impact`) sont ignorés.
- **Défaite impossible** : la poubelle compte toujours ses dégâts (`infestation`), mais la
  fin de vague ouvre toujours la préparation suivante ; le HUD affiche les PV restants de
  la poubelle, même négatifs.
- **Pas de statistiques** : rien n’est mesuré ([statistiques](stats.md)).
- **Volumes de collision** : chaque boîte de collision de la pièce (murs, sol, meubles,
  ventilateurs, constructions posées) est dessinée en fil de fer cyan sur des faces
  teintées à 12 % d’opacité (`showColliders`, `src/debug-tools.ts`) ; les triangles de
  collision des objets du décor s’y ajoutent en fil de fer jaune
  ([collisions en triangles](collisions.md)). L’affichage se refait quand elles changent.
- Toujours visibles : la **hitbox** de chaque ennemi en fil de fer rose (l’ellipsoïde ou
  la sphère que les tirs testent, `src/insect-hits.ts`, tolérance comprise) ; la
  **portée des tourelles automatiques**, bulle orange de 42 cm de rayon centrée 2,5 cm
  au-dessus du support, avec un cercle à sa base ; le **rayon d’attraction du sucre**,
  cercle jaune au sol.

## Poser des ennemis

Pendant une **vague**, le marchand (**P**) affiche deux colonnes supplémentaires, avec
une carte par espèce (bébé araignée compris, `DEBUG_ENEMY_TYPES`) :

- **Mannequins** : l’ennemi se pose au point visé — sur le sol ou le meuble visé pour un
  marcheur, en vol stationnaire à 10 cm devant la caméra (ou plus près d’une surface)
  pour un volant. Il reste immobile, tourné vers celui qui l’a posé, et s’anime sur
  place. Il est **invulnérable** (`DUMMY_HP`, 10⁹ PV) et ne heurte pas les véhicules :
  armes, explosions et tourelles comptent leurs dégâts sans le tuer. Au-dessus de lui
  s’affichent le **dernier dégât reçu** et le **total des 3 dernières secondes**
  (`DAMAGE_WINDOW_S`) ; avant le premier coup, son nom.
- **Ennemis réels** : mêmes PV et vitesse qu’en vague. Un marcheur part du **sol sous le
  point visé** et suit la navigation terrestre jusqu’à la poubelle. Un volant va en ligne
  droite vers le **point le plus proche d’un couloir aérien** (en passant au-dessus d’un
  meuble gênant), puis finit ce couloir. Un moucheron posé est seul.

Après le choix d’une carte, le marchand se ferme : un repère montre le point visé,
**clic gauche** pose **un** ennemi (on peut en poser d’autres), **Échap** quitte. Le
serveur ramène dans la pièce un point visé à moins de 10 cm du sol ou des bords
praticables (`DEBUG_SLACK`). **Retirer les mannequins** les enlève tous, sans âme envoyée
au purgatoire. Aucune limite de nombre (utile pour tester la charge). Tant qu’un
mannequin est debout, la vague ne se termine pas. Les ennemis posés sont partagés par la
room et ajoutés au roster de la vague comme une ponte (`src/debug-enemies.ts`).

## Commande et sortie

La commande fiable `lab` n’accepte que `enable`, `exit`, `place` (`kind` : `dummy` ou
`live`, `type`, `p`, `dir`) et `clear-dummies`, exige l’epoch courante de la room, et
`place`/`clear-dummies` seulement en mode debug pendant une vague ; toute autre action
est refusée. **Désactiver le mode réinitialise intégralement la partie** (vague, caisse,
joueurs au départ) pour qu’aucune progression de test ne pollue la partie normale. La
remise à zéro habituelle conserve le mode actif. Les limites de placement, populations
maximales, collisions, contrats et physiques ne sont pas contournées. L’équilibrage
d’une room n’est pas réglable ([progression](progression.md#budget-de-vague)).

## Vérifier

`scripts/test-laboratory.mjs`, `scripts/test-debug-mode.mjs`,
`scripts/test-debug-enemies.mjs`. À la main : deux navigateurs dans une room et un
troisième dans une autre room (activation, effets, désactivation et réinitialisation).
