# Retours de partie — visibilité, signatures et entrées

Livraison du lot suivant la version 025, 29 octobre 2026.
Le diagnostic et la correction du pistolet est dans [pistol-diagnosis](pistol-diagnosis.md).

## Présentation et état des insectes

Les noms flottants des véhicules et personnages sont supprimés. Les listes de
joueurs, postes et contrats conservent les identités ; les panneaux de lieux et
les guichets restent dans la scène.

Le modèle et la géométrie touchable du moucheron (`midge`) sont agrandis historiquement de 35 %, puis de 50 % supplémentaires dans VIS-07 (facteur historique 2,025), puis de nouveau ×3 le 30 octobre (facteur courant 6,075), avec tolérance de tir de 20 %.
Les autres types, appareils et personnages gardent leur taille. Le test de rayons
sur un plan échantillonné retrouve une surface touchable accrue de plus de 50 %,
sans changer les dégâts. Il ne remplace pas un essai de visée en partie.

Une barre de PV discrète apparaît pour chaque insecte blessé, y compris les PNJ
du purgatoire, uniquement lorsque 0 < PV < maximum. Les données viennent des
dégâts partagés et les rapports de mouvement ne peuvent pas remplacer les PV
serveur des PNJ. La barre disparaît à la mort, au nettoyage ou à pleine santé.
Elle regarde la caméra, ne porte pas de texte et ne participe pas aux raycasts.

La blessure ajoute trois petites volutes de fumée dont l’opacité augmente avec
la perte de PV. À 30 % de PV ou moins, deux flammes s’ajoutent. Aucun dégât
supplémentaire n’en résulte. Les objets suivent l’insecte et sont réutilisés ;
leur nombre dépend du nombre d’insectes blessés, avec un groupe de barre (deux meshes), trois volutes et deux flammes
par insecte et aucune émission cumulative de particules. Les
matériaux sont libérés au retrait ; la géométrie commune reste partagée.

Une mort aérienne visible lance un son fini de quatre secondes évoquant une
chute en perdition. Il suit le corps, s’arrête à l’impact ou à sa suppression,
respecte muet/volume/distance et ne redémarre pas sur les snapshots. Au maximum
16 voix de chute sont ouvertes, dans le budget de voix ponctuelles existant.
Les insectes terrestres n’en déclenchent pas. L’explosion finale optionnelle n’a
pas été ajoutée. L’écoute subjective et WebGL restent à confirmer en partie.

## Signatures et tampon

Une signature déclenche désormais un seul effet `stampEcho`, sans outil de tampon,
secousse et seconde marque superposés. Il est retiré lors du changement de
feuille ; les confirmations serveur de sa propre signature ne rejouent pas le
son local. L’archive attend toujours une confirmation et n’est pas doublée.

Deux défauts sont couverts par des tests capables d’échouer sur l’ancien code :
le trait pouvait ne pas être reconnu lorsque le navigateur ne délivrait que
pointer-down et pointer-up ; le dossier précédent restait ouvert pendant une
sélection de poste retardée. La sélection attend maintenant sa confirmation
avant d’exposer une feuille signable. Le point final est enregistré et dessiné,
la capture est relâchée au nettoyage, un pointeur annulé ne signe rien et un
échec réinitialise l’encre sans nécessiter « Effacer ». Les données du dossier
en cours d’envoi sont figées. Les commandes de fermeture/effacement sont
neutralisées pendant cet envoi, sans ajouter de délai d’animation obligatoire.
Ces reproductions ne prétendent pas couvrir toute situation de navigateur ayant
pu provoquer le signalement original.

Contrôle réel à deux clients locaux : deux dossiers pilote en parallèle, une
seule attribution du cockpit, refus de l’autre signature, fermeture puis nouveau
dossier dorsal et embarquement. Six traits ont été signés sans effacement manuel,
avec cinq documents archivés au total (la demande refusée n’est pas archivée).
Les positions des deux joueurs ont été préparées dans la base locale de test.
Souris réelle du navigateur et événements synthétiques mouse/touch sont testés ;
un écran tactile physique et une déconnexion WAN ne sont pas revendiqués.

## Apparitions et découverte tardive

Tous les portails sont sur la périphérie et à au moins **3 mètres du décor** de
la corbeille, soit 1000 mètres de référence. Les deux portails terrestres trop
proches ont été déplacés sur leurs murs. Les fourmis d’introduction empruntent
le couloir depuis le mur gauche, sans raccourci débutant près de la cible.
L’entrée reste au portail pendant deux secondes, puis rejoint le même parcours
continu. Ce délai est inclus dans la durée de vie. Les parcours ont ensuite été allongés
à vitesse conservée : première vague désormais étendue à toute la pièce avec deux fourmis supplémentaires,
voir [trajets actuels](vehicles-bank.md#trajets-et-crashs).

Le rendu des vagues utilise l’heure serveur prise à l’envoi de la réponse et
un temps local monotone, plutôt que de déduire l’avancement d’un milieu d’aller-
retour contenant aussi le travail D1. L’heure de départ et les durées d’arrivée
sont communes au client et au serveur.

Rejoindre tard ou réafficher une scène peut révéler un ennemi déjà près de la
corbeille : ce n’est pas une nouvelle apparition. Le client distingue l’état
`entry` de `in-flight` et affiche une indication de découverte tardive ; il ne
replace pas cet ennemi au mur et ne décale pas son arrivée serveur.
`test-feedback.mjs` couvre les positions effectivement rendues pendant les deux
premières secondes sur 50 graines et cinq paliers de vagues, sol et air compris.

Le [correctif du 30 octobre](enemy-visibility.md) remplace les points d’apparition
masqués par les aérations et corrige les modèles réutilisés entre vagues.
