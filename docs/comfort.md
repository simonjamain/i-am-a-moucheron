# Confort de jeu — version 37

Lot du 30 octobre 2026, sources Node/RAM/UDP. Le Worker public historique reste
inchangé. La référence des commandes demeure [controls](controls.md).

## Version et livraison

`VERSION` est la source unique du numéro entier affiché en haut à gauche, y compris
au lancement, dans les menus et purgatoires. L'assembleur injecte sa valeur dans
le HTML servi ; le hash des modules reste un identifiant de cache distinct.
Dans un clone : `npm run prepare:version` installe le hook Git local, puis
`npm run version:next` prépare le prochain numéro après synchronisation.
Après `git add`, `npm run check:version` refuse un index sans incrément par rapport
à HEAD. Le hook exécute cette vérification avant chaque commit, documentaire inclus.
Les hooks ne s'installent pas automatiquement dans les autres clones : y relancer
la préparation. Le ZIP se lance sans Git.

## Stations et affichage au viseur

La station répare gratuitement chaque coque vivante, posée et arrêtée, à 10 %
de ses PV maximum par seconde : 10 PV/s, ou 20 PV/s pour le H2. Même condition
que le ravitaillement, même si les stocks sont pleins. Calcul unique côté serveur,
indépendant des occupants et des stations superposées ; arrêt au départ, plafond
aux PV maximum, aucune résurrection de coque détruite. Les rapports identiques
retardés ne doivent pas annuler la réparation ; les snapshots mettent aussi à jour
les PV du pilote et des appareils sans pilote.

Deux petites jauges au viseur indiquent carburant (fraction des 300 secondes)
et commande moteur en pourcentage ; les autres postes lisent les gaz partagés
du pilote. Le H2 affiche désormais sa [commande verticale corrigée](helicopter-controls.md) :
50 % au stationnaire, plus pour monter et moins pour descendre. Son carburant
ne dépend pas du collectif. Aucun indicateur moteur n'est ajouté à la DCA fixe.

## Zoom et tir

Les boutons souris utilisent `mousedown`/`mouseup` : contrairement à `pointerdown`,
ils signalent chaque bouton lorsqu'on les combine. Cela permet clic gauche avec
clic droit déjà tenu et relâchement indépendant, sans modifier cadences, autorisations,
stocks ni règles du regard libre C. Les commandes clavier/manette restent les mêmes.

Le pistolet conserve ses dégâts immédiats et ses raycasts depuis la main.
ARM-06 remplace le segment immobile de 90 ms par un effet qui avance à 820 m/s de
référence, avec largeur lumineuse adaptée à la distance. Sa tête s'arrête à la
première intersection résolue, sa queue ne dépasse jamais derrière la bouche.
La distance est partagée avec les observateurs, avec compensation de l'âge reçu.
Ce changement visuel n'ajoute ni second impact, ni nouveau projectile physique.

## Radar, ennemis et remise à zéro

Dans le bureau, la carte reste visible à pied, en chute et sous parachute, avec
position et orientation. La couverture des radars continue seule à révéler les
ennemis ; aucune carte du bureau dans les purgatoires. L'état de présence est
« Ennemis restants » tant que le total de la vague contient des ennemis non tués
ou arrivés, y compris ceux qui n'ont pas encore apparu. Sinon : « Aucun ennemi
restant ». Le libellé ne compte plus les seuls moucherons.

Les fourmis ont des dimensions divisées par deux (facteur 12 → 6), de même que
leur vitesse effective. Le calcul de durée suit ce ralentissement, sans plafond
qui avancerait leur arrivée. Corps et hitbox utilisent le facteur partagé ; les
pattes restent relevées. Marge terrestre de 25 mm conservée pour les cafards,
ce qui garde aussi un passage dégagé pour les fourmis plus petites. Composition,
PV, dégâts et récompenses inchangés.

Le bouton permanent « Recommencer la partie » libère le curseur et demande
« Recommencer pour tout le monde ? ». Annuler ne change pas la salle. Confirmer
réutilise la remise à zéro serveur, avec l'epoch de départ pour dédupliquer deux
confirmations concurrentes. Les pseudos et la salle restent ; monnaie, prêts,
installations, véhicules, vagues et contrats sont recréés. Projectiles personnels,
salves et rapports d'appareils sans pilote sont nettoyés côté client.

## Accès au H2 et validation

BUG-06 : le test reproduit un état posé devenu non posé lorsque la soustraction
altitude−train dépasse infinitésimalement le support. Sans gravité au stationnaire,
cet écart peut persister et le filtre des cercles exige `landed`. Une tolérance de
10⁻⁹ m au contact conserve le H2 posé, sans l'aspirer depuis une hauteur perceptible.
Les accès pilote/copilote et signatures restent ceux de la flotte.
Cette reproduction numérique ne prouve pas que c'est l'unique cause du signalement
sur la VM ; conserver l'essai réel d'embarquement dans HEL-06.

`test-comfort.mjs` vérifie le contact H2, ses deux accès et leurs signatures à deux joueurs, sortie/réembarquement, les réparations sur tous
les modèles (stocks pleins, recouvrement, dégâts, départ, reprise et destruction),
le reset concurrent, les vitesses des fourmis et les positions de l'effet du pistolet.
La suite complète conserve contrats, exclusivité et deux clients UDP natifs.
Le navigateur de contrôle permet de vérifier l'interface ; WebGL, Pointer Lock,
confort de tir et coopération WAN restent à confirmer sur VM. HEL-06/DCM-03
conservent donc leur validation humaine en cours.
