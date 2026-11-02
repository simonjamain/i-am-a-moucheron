# Équilibrage par room

Le bouton **Équilibrage**, près du code de room, ouvre un panneau consultable
par tous, y compris en observation ou au purgatoire. Le premier joueur de la
room est son créateur et peut appliquer les modifications. Son identité de
reprise conserve ce droit après rechargement ; elle reste privée. Aucun autre
joueur ne récupère automatiquement ce droit à sa déconnexion.

Les valeurs appartiennent uniquement à cette room, restent en mémoire et sont
incluses dans les snapshots fiables UDP, y compris pour les nouveaux arrivants.
La remise à zéro conserve les réglages et leur propriétaire ; la suppression de
la room ou le redémarrage du serveur les efface. **Valeurs par défaut** prépare
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

## Autorité et limites

`src/balance.js` définit les champs, minima et règles de transformation. Aucun réglage n’a de
plafond supérieur de gameplay, côté formulaire comme côté serveur. Les nombres
doivent rester finis ; les limites techniques du navigateur, de la mémoire et
des messages réseau continuent naturellement à s’appliquer.
`server/game.js` valide identité, epoch et révision avant toute mutation.
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
