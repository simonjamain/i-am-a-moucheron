# Équilibrage par room

Le bouton **Équilibrage et nuées**, près du code de room, ouvre un panneau
accessible à **tous les joueurs**, y compris en observation ou au purgatoire.
Chaque joueur de la room peut appliquer des modifications à tout moment ; il
n'existe plus de privilège de réglage réservé au créateur. La validation des
révisions protège les modifications concurrentes.

Les valeurs appartiennent uniquement à cette room, restent en mémoire et sont
incluses dans les snapshots fiables UDP, y compris pour les nouveaux arrivants.
La remise à zéro conserve les réglages ; la suppression de la room ou le redémarrage
du serveur les efface. **Valeurs par défaut** prépare
les valeurs ; **Appliquer à la room** les enregistre. La partie continue pendant
l’édition. Un changement concurrent ou une remise à zéro impose de recharger
les valeurs avant envoi ; les champs saisis ne sont pas écrasés par le polling.

| Réglage                              | Application                                                                                                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Quantité (×0,25 et plus)             | Prochaine vague, sans plafond de population                                                                                 |
| Progression (×0,25 et plus)          | Prochaine vague ; modifie le numéro de difficulté utilisé par le directeur, déblocages compris                              |
| PV ennemis (×0,25 et plus)           | Ennemis du bureau, immédiatement ; dégâts accumulés et PV sont multipliés ensemble, morts conservés                         |
| Vitesse ennemis (×0,25 et plus)      | Immédiatement ; âge et durée de trajet recalés ensemble, sans changer la position ; futurs départs conservés                |
| Dégâts (×0,25 et plus)               | Prochain impact déclaré pour armes légères/pistolet/DCA, prochain lancement pour armes lourdes ; tirs alliés compris        |
| Cadence (×0,25 et plus)              | Prochain intervalle de tir automatique/lourd ; pistolet semi-automatique inchangé                                           |
| Munitions, carburant (×0,25 et plus) | Capacité et stock multipliés proportionnellement ; consommation unitaire inchangée ; ravitaillement toujours en 10 secondes |
| Prix (×0,25 et plus)                 | Prochain achat ; un bon déjà payé garde son prix et son remboursement                                                       |
| Récompenses (×0,25 et plus)          | Prochaine prime de vague ou libération d’âme ; arrondi au centime, caisse actuelle et prêts signés inchangés                |
| Argent initial (0 $ et plus)         | Prochaine remise à zéro, sans crédit immédiat                                                                               |
| Délai initial (5 s et plus)          | Prochain lancement ou compte à rebours initial en cours                                                                     |
| Pause (5 s et plus)                  | Prochaine pause ou pause en cours                                                                                           |

Les délais en cours sont ajustés de la différence entre ancienne et nouvelle
durée, avec au moins cinq secondes restantes après modification. Le lancement
manuel garde son comportement. Les réglages par défaut reproduisent le jeu
précédent. Les réserves peuvent être fractionnaires comme lors d’un
ravitaillement ; il faut toujours une unité entière pour tirer.

## Génération de nuées (debug)

Dans le même panneau, **six champs** permettent de saisir des quantités entières
de fourmis, cafards, moucherons, voltigeurs, carapaces et bourdons blindés.
**Envoyer la nuée** crée exactement le nombre demandé de chaque type, sans
application du multiplicateur de population ni du multiplicateur ×5 des
moucherons du directeur. Les autres joueurs voient les nouveaux ennemis lors
de leur prochaine synchronisation fiable ; un nouvel arrivant reçoit le même
état. Les insectes apparaissent progressivement sur environ une seconde, suivent
les entrées et trajets habituels, et conservent les réglages de PV et de vitesse.

L'action est ouverte à tous les joueurs connectés à la room et disponible pendant
la préparation ou un combat. En combat, les ennemis sont ajoutés à la vague
active sans modifier les identifiants, morts ni dégâts existants. En préparation,
l'envoi ouvre une vague de debug sans ennemis automatiques et interrompt le
compte à rebours ; la boucle des vagues et les récompenses reprennent ensuite
normalement. En cas de défaite, il faut d'abord réinitialiser la partie.
Le bouton de remise à zéro de la partie efface aussi les ennemis de debug.

Les champs restent à zéro après un envoi réussi. Les valeurs négatives,
fractionnaires, inconnues ou toutes nulles sont refusées. **Limites techniques** :
5 000 insectes par envoi et 10 000 insectes par combat, afin d'éviter de saturer
le serveur en RAM et les réponses UDP. Elles ne limitent pas le multiplicateur
de population des vagues normales, dont les contraintes techniques restent
indépendantes. Les paramètres changés en parallèle sont pris en compte au
moment de l'envoi ; un reset concurrent invalide la demande.

## Autorité et limites

`src/balance.js` définit les champs, minima et règles de transformation. Aucun réglage n’a de
plafond supérieur de gameplay, côté formulaire comme côté serveur. Les nombres
doivent rester finis ; les limites techniques du navigateur, de la mémoire et
des messages réseau continuent naturellement à s’appliquer.
`server/game.js` valide l'identité de la session et, pour les réglages, l'epoch
et la révision avant toute mutation. Pour la génération de nuées, il valide
l'epoch et les quantités ; les identifiants sont attribués sur le serveur.
Le plan actif est une copie propre à la room ; le cache déterministe partagé de
`waves.js` reste inchangé. L’autorité coopérative des mouvements et des impacts
légers demeure celle décrite dans [réseau](walking-network.md). Les paramètres
ne modifient ni les constantes globales ni le backend Worker historique.

`src/balance-ui.js` gère le formulaire, les conflits, l’attente et les erreurs.
Les champs affichent leur moment d’application. Les PV des personnages, les PV
des véhicules, la physique du pilotage et les taux de prêts ne sont pas réglables
dans ce premier panneau. Les PNJ du purgatoire gardent leurs PV habituels.

## Vérifications

`node scripts/test-room-balance.mjs` : isolation, défauts, autorisation, reprise,
validation atomique, révisions, vagues, continuité de trajectoire, PV, réserves,
économie, délais, reset et vrais gestionnaires UI. Les tests natifs UDP incluent
une modification par un pair, son observation par l’autre et un refus d’écriture.
Un test humain WebGL sur deux navigateurs reste nécessaire pour apprécier le
pilotage et la lisibilité ; aucun environnement temporaire Actions n’est configuré.
