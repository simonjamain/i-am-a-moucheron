# Banque

La banque prête de l'argent à la caisse commune contre des échéances prélevées à chaque
fin de vague. Règles dans `src/bank.ts`, guichet dans `src/bank-ui.ts`, commande
`bank-sign` dans `server/game.js`. Monnaie et achats : [économie](economy.md) ;
revenus : [progression](progression.md).

## Offres

La banque expose toujours trois emplacements, chacun portant une offre ou un prêt signé.
Une offre est tirée au hasard parmi `LOAN_TERMS` :

| Capital | Taux fixe par vague | Nombre de vagues |
| ------: | ------------------: | ---------------: |
|    12 $ |                10 % |                4 |
|    18 $ |                12 % |                5 |
|    24 $ |                15 % |                6 |
|    30 $ |                18 % |                7 |
|    40 $ |                20 % |                8 |

Les calculs sont en centimes entiers (`amortization`) : échéance d'un prêt amortissable
à taux fixe arrondie au centime, chaque échéance séparant intérêts arrondis sur le
capital restant et remboursement de capital ; la dernière solde exactement le reste. Le
contrat garde le tableau complet, le coût total, les vagues et le capital restants.

## Signer

- Le bouton **Banquier · N** ou la touche N ouvre le guichet à tout moment, y compris à
  bord, sauf dans le ciel de Saint Pierre et pendant le dépôt d'un autre dossier. La
  consultation libère la souris et neutralise les commandes ; la partie continue. Échap
  ou la croix ferment le guichet.
- Le guichet est un **prospectus en papier** ([règles d'interface](ui-guidelines.md)) :
  les trois emplacements y sont imprimés comme des coupons. Cocher une offre affiche son
  texte et son tableau d'amortissement ; il faut cocher la **reconnaissance de dette**
  (`loanConsent`) avant de signer. Relâcher un trait valide envoie une seule commande ;
  le contrat reçoit le tampon « APPROUVÉ ». Une erreur affiche son message et permet de
  signer à nouveau ; une annulation du pointeur ne signe jamais.
- La commande porte le numéro d'emplacement et le numéro unique de l'offre (`serial`) :
  une offre périmée ne peut pas recréditer la caisse. Le serveur revérifie aussi l'epoch
  de la partie. Aucune image de signature n'est envoyée ni conservée.
- Aucun nouveau prêt n'est signé avec un solde négatif.

## Remboursement

Une signature crédite immédiatement le capital. `settleLoans` prélève une échéance par
prêt actif à chaque fin de vague, perdue comprise, sans double prélèvement. Le solde peut
devenir négatif et les échéances continuent. Il n'y a pas de remboursement anticipé. Un
contrat actif se consulte en cochant son coupon : capital et vagues restants, tampon
« PAYÉ » sur chaque échéance prélevée. Un prêt soldé est remplacé par une nouvelle offre
dans le même emplacement. Une remise à zéro efface prêts, offres et monnaie.

## Vérifier

- `npm test -- next-backlog` : amortissement, trois emplacements, prélèvements de fin de
  vague, solde négatif.
- `npm test -- hud-bank-ui` : signature, annulation, répétition, attente serveur, erreurs,
  documents périmés ou remis à zéro, soldes négatifs.
- `/ui-review.html` (généré par `scripts/assemble.mjs`, donc par `npm start`) montre le
  vrai guichet avec une caisse de démonstration jetable.
