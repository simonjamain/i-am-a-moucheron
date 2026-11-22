// Quelques étapes marquantes, rédigées pour les joueurs. Pas un journal technique.
export interface ChangelogEntry {
  version: number;
  changes: string[];
}
export const PLAYER_CHANGELOG: ChangelogEntry[] = [
  {
    version: 418,
    changes: [
      'Au sol, le biplan ne répond plus aux gouvernes sans air : il faut rouler un peu, avec un filet de gaz, pour le diriger.',
    ],
  },
  {
    version: 417,
    changes: [
      'Deux boutons discrets montrent les volumes de collision et la physique des engins, sans relancer la partie.',
    ],
  },
  {
    version: 415,
    changes: [
      'Le biplan vole avec une vraie physique : il décroche s’il va trop lentement et se pose sur ses roues, même sur un sol penché.',
      'La visée à la souris reste la même, mais l’avion la suit comme un vrai avion.',
    ],
  },
  {
    version: 414,
    changes: [
      'Moins de cases à cocher : on monte à bord, on revient du purgatoire et on choisit son lit en signant directement.',
      'Les bons de commande proposent des motifs plus variés, et la convenance personnelle annonce d’emblée qu’elle sera refusée.',
      'À la banque, plus d’objet du prêt : une seule case pour reconnaître que l’emprunt plombe l’équipe pendant ses vagues.',
    ],
  },
  {
    version: 413,
    changes: ['En construction, l’aide en bas de l’écran n’affiche plus un « false » égaré.'],
  },
  {
    version: 412,
    changes: [
      'Les fusées de proximité explosent en s’éloignant de la vraie forme des meubles, plus de la boîte autour.',
    ],
  },
  {
    version: 411,
    changes: [
      'Obus, roquettes et missiles touchent la vraie forme des meubles, comme les balles : on peut les passer sous une chaise.',
      'Beaucoup plus de projectiles peuvent voler en même temps.',
    ],
  },
  {
    version: 410,
    changes: [
      'Avions, piétons et véhicules touchent la vraie forme des meubles : on se pose sur une assise, on passe sous un bureau.',
      'Une pale de ventilateur ou une feuille ne se traverse plus, même très vite.',
    ],
  },
  {
    version: 409,
    changes: [
      'Les équipements se posent sur la vraie surface des meubles : assise d’une chaise, dessus de la photocopieuse.',
    ],
  },
  {
    version: 408,
    changes: [
      'Les tirs, les explosions et la caméra suivent la vraie forme des meubles : on tire entre les pieds d’une chaise.',
    ],
  },
  {
    version: 407,
    changes: [
      'Mode debug : les vraies formes de collision des meubles s’affichent en jaune, en préparation de collisions fidèles.',
    ],
  },
  {
    version: 405,
    changes: [
      'Les globes des ventilateurs sont allumés.',
      'Les contours noirs s’effacent dans les nuages et le brouillard, comme les objets qu’ils dessinent.',
    ],
  },
  {
    version: 404,
    changes: [
      'Mode debug : les volumes de collision des murs, meubles et ventilateurs s’affichent en fil de fer.',
    ],
  },
  {
    version: 403,
    changes: [
      'Diagonale s’éclaire par deux ventilateurs lumineux qui pendent sous les nuages : attention aux pales en vol.',
      'Ombres plus douces sous la lumière des lampes ; l’ombre des avions et des insectes tombe juste sous eux.',
    ],
  },
  {
    version: 401,
    changes: [
      'Nouveau décor : vrais meubles de bureau, écrans, cuisine, porte et désordre sur les bureaux, dans tous les plans.',
      'Le plan Diagonale devient un bureau complet. Bouches d’aération et trous de souris sont collés aux murs.',
      'Bureaux plus bas (0,74 m) : la corbeille du plan « Corbeille sur le bureau » s’atteint par-dessous.',
    ],
  },
  {
    version: 400,
    changes: [
      'Missiles guidés de l’hélicoptère : explosion bien plus puissante, qui touche jusqu’à 30 m autour.',
    ],
  },
  {
    version: 399,
    changes: ['Les documents ne se déchirent plus : le bouton « Déchirer ce document » disparaît.'],
  },
  {
    version: 398,
    changes: [
      'Obus perforant du char : il frappe chaque ennemi au moment où il le traverse, en perdant 20 % de ses dégâts à chacun.',
    ],
  },
  {
    version: 397,
    changes: [
      'Plus de ronds au sol : on monte dans tous les engins en visant le poste (verrière, tourelle, trappe).',
      'DCA fixes, canon anti-matériel et lits s’utilisent aussi en les visant, puis clic ou E.',
    ],
  },
  {
    version: 396,
    changes: [
      'Char moyen : la mitrailleuse du pilote tire plus fort et l’obus explosif frappe bien plus fort, sur 20 m.',
      'L’obus perforant du char traverse maintenant tous les ennemis sur sa route.',
      'Le camion anti-aérien explose aussi large que le flak léger ; la mitrailleuse du Castor fait deux fois plus de dégâts.',
    ],
  },
  {
    version: 395,
    changes: [
      'Le banquier devient un prospectus en papier : cochez une offre, puis l’objet du prêt, et signez.',
      'Les échéances payées sont tamponnées PAYÉ. Le remboursement anticipé disparaît.',
    ],
  },
  {
    version: 394,
    changes: [
      'Après une signature (montée à bord, changement de place), la souris est reprise tout de suite.',
      'Les anciens contrats signés ne s’empilent plus sous la feuille.',
    ],
  },
  {
    version: 393,
    changes: [
      'Tous les documents deviennent de vraies feuilles : prise de poste, retour du purgatoire et contrat de lit.',
      'La première pièce demande un motif coché au crayon ; la convenance personnelle reste refusée.',
    ],
  },
  {
    version: 392,
    changes: [
      'Bon de commande plus lisible : montants alignés, cases carrées, plus de bouton Gommer ni de fond grisé.',
    ],
  },
  {
    version: 391,
    changes: [
      'Le bon de commande devient une vraie feuille : cochez un motif au crayon, signez, et le tampon tombe.',
      'La convenance personnelle n’est pas un motif réglementaire : la commande est refusée.',
    ],
  },
  {
    version: 390,
    changes: [
      'La tourelle Gatling tire deux fois plus vite : 12 tirs par seconde.',
      'Les balles de la tourelle automatique font deux fois plus de dégâts.',
    ],
  },
  {
    version: 389,
    changes: [
      'Gatling : toute la partie haute de la tourelle se lève pour viser, pas seulement les canons.',
    ],
  },
  {
    version: 388,
    changes: ['Gatling : la base du faisceau de canons s’incline maintenant avec le canon.'],
  },
  {
    version: 387,
    changes: [
      'Bombardier moyen : le poste visé est cerné d’un trait net, qui le détache bien de l’avion.',
    ],
  },
  {
    version: 386,
    changes: [
      'Nouvelle tourelle Gatling pour le Castor et le Castor volant : six canons qui tournent et un tir continu.',
    ],
  },
  {
    version: 385,
    changes: [
      'Flak léger : l’explosion touche à 30 m. Flak lourd : à 40 m. DCA haute cadence : 62 dégâts par balle.',
      'Canon anti-matériel : 800 dégâts au cœur de l’impact et 50 obus. Tourelle automatique : 5 $.',
      'Le bunker LEGO disparaît.',
    ],
  },
  {
    version: 384,
    changes: [
      'Bombardier moyen : visez le poste voulu (cockpit ou tourelle) et cliquez pour monter, de n’importe quel côté.',
      'Le poste visé s’entoure de bleu ; un poste occupé affiche le nom de son occupant.',
    ],
  },
  {
    version: 381,
    changes: ['Les moyeux des roues du char suivent maintenant les roues sur le relief.'],
  },
  {
    version: 377,
    changes: [
      'Le tireur du char voit son canon de près, sans que la tourelle gêne quand il relève la visée.',
    ],
  },
  {
    version: 375,
    changes: ['Le canon du char ne se relève plus qu’à 30 degrés.'],
  },
  {
    version: 374,
    changes: [
      'La caméra suit mieux le véhicule : moins de petits sauts en arrière quand l’image saccade.',
    ],
  },
  {
    version: 373,
    changes: [
      'Le canon du char pivote à l’avant de la tourelle, et seul le tube recule quand il tire.',
    ],
  },
  {
    version: 372,
    changes: [
      'Un diagnostic d’affichage, dans « Nouveautés », aide à comprendre pourquoi certains joueurs ne voient pas tout.',
    ],
  },
  {
    version: 371,
    changes: ['Les ronds au sol des sièges et équipements restent visibles sur tous les écrans.'],
  },
  {
    version: 370,
    changes: ['Le tireur du char voit son canon de plus haut, sans la mitrailleuse devant.'],
  },
  {
    version: 369,
    changes: [
      'Le canon du char recule à chaque tir et secoue la caisse. Le tireur voit le canon par-dessus l’épaule.',
      'Un char abandonné reste bien à l’arrêt.',
    ],
  },
  {
    version: 366,
    changes: [
      'Les chenilles du char épousent le relief : galets et chenille montent sur les obstacles.',
    ],
  },
  {
    version: 365,
    changes: ['Le char est un cinquième plus grand, et ses roues tournent avec les chenilles.'],
  },
  {
    version: 364,
    changes: [
      'Camion anti-aérien : seules les roues avant braquent, selon le clavier, même à l’arrêt ; roues de remorque bien placées.',
    ],
  },
  {
    version: 363,
    changes: [
      'Camion anti-aérien : les roues tournent et braquent, la remorque pique et se cabre, et peut se replier à plus de 90°.',
      'Le camion anti-aérien va deux fois plus vite. Le camion, le char et le Castor accélèrent plus doucement.',
      'Char : avancer et tourner en même temps marche tout de suite, comme avec deux chenilles.',
    ],
  },
  {
    version: 362,
    changes: [
      'Tous les ennemis peuvent apparaître dès la première vague : seule la puissance de la vague décide de qui peut venir.',
    ],
  },
  {
    version: 361,
    changes: [
      'La remorque du camion anti-aérien se balance dans les virages et se met en portefeuille en marche arrière.',
      'Le camion est plus rapide.',
    ],
  },
  {
    version: 360,
    changes: [
      'Rat, scarabées, abeilles, moustiques et cafards sont plus costauds ; les bébés araignées ont presque aucune vie.',
      'Tous les ennemis, bébés araignées compris, passent au purgatoire avec leur vrai modèle et rapportent des dollars.',
      'Au purgatoire, les ennemis signent leurs papiers deux fois plus vite.',
    ],
  },
  {
    version: 358,
    changes: [
      'Le char moyen roule comme un vrai char : suspension qui pique du nez au freinage, pivot sur place, franchit les petites marches.',
      'Le char est plus rapide.',
    ],
  },
  {
    version: 357,
    changes: [
      'Le Castor se conduit comme un vrai véhicule à roues : départ progressif, freins, virages qui se resserrent à basse vitesse.',
    ],
  },
  { version: 355, changes: ['Le Castor volant est 30 % plus petit.'] },
  {
    version: 354,
    changes: [
      'Hélicoptère : avec Q/D, le nez suit toujours la hauteur de la souris, pour tourner autour d’une cible.',
      'Les barres sous les statistiques s’affichent sur tous les navigateurs.',
      'La flamme des mitrailleuses part dans le sens du tir.',
      'La bulle des stations de ravitaillement a la taille de celle du Castor.',
    ],
  },
  {
    version: 351,
    changes: ['Tirer sur une nuée est plus fluide, et le premier tir ne fige plus l’image.'],
  },
  {
    version: 348,
    changes: [
      'Les vagues deviennent plus difficiles plus vite : la puissance monte de moitié à chaque vague.',
    ],
  },
  {
    version: 345,
    changes: [
      'Zoom (clic droit) : la souris est plus fine, les sauts de visée ne sont plus agrandis.',
    ],
  },
  {
    version: 343,
    changes: [
      'Chaque ennemi a une puissance : plus il est fort, plus son âme libérée rapporte et plus il abîme la poubelle.',
      'Les vagues suivent le nombre de joueurs. Plus de prime de fin de vague : seules les âmes libérées rapportent.',
      'La puissance de la prochaine vague est annoncée.',
      'Nouveaux prix pour tous les appareils, véhicules et installations du magasin.',
      'Un char moyen gratuit et infini attend au sol, avec les deux avions de base.',
      'La motorisation et les munitions renforcées n’existent plus.',
    ],
  },
  {
    version: 340,
    changes: ['Le temps de préparation entre deux vagues passe à 3 minutes.'],
  },
  {
    version: 339,
    changes: [
      'La zone de tir du scarabée est maintenant une sphère parfaite, autour de son corps.',
    ],
  },
  {
    version: 338,
    changes: [
      'En plein combat, les sons proches et importants ne sont plus coupés par le vacarme lointain.',
      'Le bruit des moteurs ne se limite plus aux dix avions les plus proches : on entend ceux qui comptent le plus.',
    ],
  },
  {
    version: 334,
    changes: [
      'Le rat marche au ras du sol. Le moucheron est plus dur à toucher, les autres insectes volants plus faciles.',
    ],
  },
  {
    version: 329,
    changes: [
      'Les tapis du bureau sont retirés : ils coupaient les personnages et les équipements en deux.',
    ],
  },
  {
    version: 328,
    changes: [
      'Le chasseur léger et le bombardier moyen à quatre places sont de retour chez le marchand.',
    ],
  },
  {
    version: 327,
    changes: [
      'Le choix du plan de bureau tient sur une ligne : le bouton Rejoindre reste visible sur les petits écrans.',
    ],
  },
  {
    version: 324,
    changes: [
      'Six plans de bureau au choix quand on crée une partie : corbeille au centre, cloison avec une seule porte, archives en serpentin…',
      'On démarre maintenant au sol, près de la corbeille.',
    ],
  },
  {
    version: 322,
    changes: [
      'En mode debug, on peut de nouveau poser un ennemi par terre, et pas seulement sur un meuble.',
    ],
  },
  {
    version: 320,
    changes: [
      'En mode debug, le marchand permet de poser des mannequins immobiles qui affichent les dégâts reçus, ou de vrais ennemis.',
      'En mode debug, les zones touchables des ennemis et la portée des tourelles et du sucre sont visibles.',
    ],
  },
  {
    version: 319,
    changes: ['Le ventilateur est retiré pour l’instant : il ne se construit plus.'],
  },
  {
    version: 318,
    changes: [
      'L’abeille, le moustique et le scarabée sont plus grands, et plus faciles à toucher en proportion.',
    ],
  },
  {
    version: 317,
    changes: ['Les bébés araignées ont un nouveau modèle grognon qui trottine sur ses pattes.'],
  },
  {
    version: 312,
    changes: ['Le voltigeur disparaît : il n’apparaît plus dans aucune vague.'],
  },
  {
    version: 311,
    changes: [
      'Le moustique a un nouveau modèle : il vole en vibrant des ailes, ses longues pattes pendantes.',
    ],
  },
  {
    version: 310,
    changes: [
      'Le rat géant a un nouveau modèle de souris qui trottine avec une vraie animation de marche.',
    ],
  },
  {
    version: 309,
    changes: [
      'La carapace devient l’abeille : un nouveau modèle rayé jaune et noir qui bourdonne en battant vite des ailes.',
    ],
  },
  {
    version: 308,
    changes: [
      'Le cafard a un nouveau modèle : il trottine sur ses six pattes en agitant ses longues antennes.',
    ],
  },
  {
    version: 307,
    changes: [
      'Le bourdon blindé devient le scarabée : un nouveau modèle bleu et orange qui vole en battant des ailes, pattes pendantes.',
    ],
  },
  {
    version: 306,
    changes: [
      'Sur les réseaux qui bloquent l’UDP (réseaux d’entreprise), la partie se lance quand même, en mode secours « TCP ».',
    ],
  },
  {
    version: 305,
    changes: [
      'Tous les avions, y compris les deux de départ, décollent maintenant depuis une surface plane.',
      'Les insectes volants restent sous les nuages et suivent à nouveau leur trajectoire visible.',
    ],
  },
  {
    version: 303,
    changes: ['Sur PC, le moucheron vole maintenant vers vous à la fin du chargement.'],
  },
  {
    version: 300,
    changes: ['La vue du Flak lourd s’affiche correctement après la prise du poste.'],
  },
  {
    version: 299,
    changes: [
      'Poser une DCA fixe près du départ ne fait plus bondir le personnage.',
      'La vue de visée du Flak lourd s’active dès la confirmation de la prise du poste.',
    ],
  },
  {
    version: 298,
    changes: [
      'Le Flak lourd passe en vue de visée et sa culasse suit le tube. Les DCA visent de +5° à +90°.',
    ],
  },
  {
    version: 297,
    changes: [
      'Les deux canons supérieurs de la DCA haute cadence restent assemblés quand on vise.',
    ],
  },
  {
    version: 296,
    changes: [
      'Le Flak léger change de modèle. La boutique propose aussi une DCA à quatre mitrailleuses et un Flak lourd à obus de proximité.',
    ],
  },
  {
    version: 295,
    changes: [
      'La préparation du jeu laisse respirer l’animation du moucheron pour réduire les à-coups pendant le chargement.',
    ],
  },
  {
    version: 294,
    changes: [
      'À la fin du chargement, le moucheron s’envole vers vous et le fond s’efface pour révéler l’accueil.',
    ],
  },
  {
    version: 293,
    changes: [
      'Les ennemis au sol se contournent et se répartissent naturellement, au lieu de marcher en formations rigides.',
    ],
  },
  {
    version: 292,
    changes: [
      'Nouveau Castor volant (30 $) : pilote et trois passagers larguent les constructions du Castor, sauf les murs, même sur un meuble.',
      'V donne une vue verticale avec l’aperçu du largage ; A/E tournent l’appareil. Les colis tombent trois fois moins vite.',
    ],
  },
  {
    version: 291,
    changes: [
      'Viseur et traçantes se distinguent mieux dans les nuages. Le lit de réapparition adopte son nouveau modèle.',
      'La station de départ recule pour dégager l’accès au bombardier.',
    ],
  },
  {
    version: 288,
    changes: [
      'Les nuages voilent aussi le côté sud. Le plafond de vol monte d’un mètre pour explorer la couche nuageuse.',
    ],
  },
  {
    version: 287,
    changes: [
      'La collision de la station de ravitaillement suit son orientation, même en diagonale.',
    ],
  },
  {
    version: 286,
    changes: [
      'Un moucheron accompagne le chargement ; les murs LEGO s’emboîtent et la station grandit.',
      'Le Hind retrouve le suivi souris et ses canons tournent ; les chutes et le brouillard sont plus lisibles.',
    ],
  },
  {
    version: 285,
    changes: [
      'La fixation de la parabole tourne avec le radar. Le menu d’achat montre les nouveaux modèles des stations.',
    ],
  },
  {
    version: 284,
    changes: [
      'Nouvelles stations, réceptions au sol et rechargement visible autour du viseur.',
      'Hind plus doux et missiles libres de viser derrière ; Castor plus progressif, jantes mobiles et zoom en vue du dessus.',
    ],
  },
  {
    version: 283,
    changes: ['Nouveau personnage : l’opérateur.'],
  },
  {
    version: 282,
    changes: [
      'Nouveau personnage : l’opératrice.',
      'Accueil allégé : le choix du personnage n’a plus de cadre ni de nom, et le formulaire est plus compact.',
    ],
  },
  {
    version: 281,
    changes: [
      'Vue de dessus du Castor : le nord reste en haut de l’écran, même quand le camion tourne.',
    ],
  },
  {
    version: 280,
    changes: [
      'Nouveau : choisis ton personnage parmi six avant de rejoindre la partie, avec les flèches de l’accueil.',
      'Ton personnage tourne en douceur quand tu changes de direction.',
    ],
  },
  {
    version: 278,
    changes: [
      'Le rendu « dessin animé » (lumière par paliers et contours) devient le rendu du jeu pour tout le monde.',
    ],
  },
  {
    version: 277,
    changes: [
      'Nouveau : un rendu « dessin animé » facultatif (lumière par paliers et contours), dans Réglages.',
    ],
  },
  {
    version: 276,
    changes: [
      'Noms simplifiés : plus de codes comme M1, B3 ou G1 devant les véhicules et équipements.',
    ],
  },
  {
    version: 275,
    changes: [
      'Nouveau chasseur biplan : plus lent mais il décroche moins, avec une seule mitrailleuse.',
      'Nouveau bombardier biplan : un pilote, un mitrailleur arrière, 30 bombes lâchées plus lentement.',
    ],
  },
  {
    version: 274,
    changes: [
      'Les ennemis au sol ne se superposent plus : ils marchent côte à côte.',
      'Vagues plus compactes : grosses nuées de moucherons, fourmis plus nombreuses, gros ennemis seuls.',
    ],
  },
  {
    version: 273,
    changes: [
      'Menu d’achat simplifié : on clique directement sur l’article, sans bouton ni description.',
    ],
  },
  {
    version: 272,
    changes: [
      'Le haut de l’écran est regroupé en une seule barre : vague, argent et boutiques à gauche, connexion et réglages à droite.',
    ],
  },
  {
    version: 271,
    changes: [
      'Menu d’achat en colonnes, du moins cher au plus cher, avec une image de chaque article.',
      'Le titre de l’accueil devient « I am a moucheron ».',
    ],
  },
  {
    version: 270,
    changes: ['La fumée des roquettes et des missiles reste beaucoup plus longtemps dans le ciel.'],
  },
  {
    version: 269,
    changes: [
      'La fumée des roquettes et des missiles est plus douce et plus dense : de vrais nuages qui gonflent et se dissipent.',
    ],
  },
  {
    version: 268,
    changes: [
      'Un avion abîmé garde toute sa puissance : plus de moteur coupé ni d’aile perdue, seule la fumée montre les dégâts.',
    ],
  },
  {
    version: 267,
    changes: [
      'Un avion touché ne perd plus ses ailes : son moteur fume, de plus en plus fort selon les dégâts.',
      'Le chasseur léger reçoit une version corrigée de son nouveau modèle.',
    ],
  },
  {
    version: 266,
    changes: [
      'Nouveaux modèles pour le chasseur léger et le Stuka, avec hélice qui tourne et tirs qui partent des armes.',
    ],
  },
  {
    version: 265,
    changes: [
      'Sur un PC à écran tactile, la souris se capture de nouveau normalement et les boutons tactiles n’apparaissent plus.',
    ],
  },
  {
    version: 264,
    changes: [
      'Plus de contrats piégés : aucun document ne modifie vos commandes, votre visée ou vos tirs.',
      'Plus de vote entre les vagues : la prochaine vague est annoncée et chacun peut la lancer.',
      'Les bonus de plans disparaissent ; tourelle, bunker et canon du Castor s’achètent directement à leur prix.',
    ],
  },
  {
    version: 263,
    changes: [
      'Nouveaux modèles pour le Spitfire, le char, la DCA mobile, l’hélicoptère et le bombardier.',
      'Leurs tourelles, canons, hélices, rotors et la remorque de la DCA bougent pour de vrai, et les tirs partent du bout des canons.',
    ],
  },
  {
    version: 262,
    changes: [
      'Le Castor a un tout nouveau look : six roues, tourelle sur le toit et caisses de ravitaillement.',
      'Touche V au volant du Castor : vue de dessus, la souris déplace un viseur au sol pour poser vos défenses et tirer.',
      'Les zones de ravitaillement sont visibles : une bulle verte autour des stations et de chaque Castor.',
    ],
  },
  {
    version: 261,
    changes: [
      'Nouveaux modèles pour les fourmis, rouges et furieuses, et les araignées pondeuses, velues et tachetées.',
      'Elles marchent pour de vrai : les pattes se posent au sol au rythme de leur vitesse et se figent à l’arrêt.',
    ],
  },
  {
    version: 260,
    changes: [
      'Tirer à la mitrailleuse depuis un appareil ne provoque plus de déconnexions à répétition.',
    ],
  },
  {
    version: 259,
    changes: [
      'Les moucherons ont un nouveau look : de petites mouches à l’air furieux.',
      'En vol, ils battent des ailes, laissent pendre leurs pattes et remuent les antennes.',
    ],
  },
  {
    version: 257,
    changes: [
      'Les armes lourdes tirent sans délai et leurs obus partent bien de la bouche du canon.',
      'Bombes, roquettes, missiles et obus touchent ce que vous voyez au moment du tir.',
    ],
  },
  {
    version: 256,
    changes: [
      'Les autres joueurs se déplacent de façon fluide, sans sauts.',
      'À plusieurs dans un même appareil, la vue du mitrailleur ne tremble plus.',
    ],
  },
  {
    version: 255,
    changes: ['Les nuées et les insectes au sol avancent de façon régulière, sans à-coups.'],
  },
  {
    version: 250,
    changes: [
      'Après une coupure réseau, le jeu se reconnecte tout seul : on retrouve son personnage et sa place sans recharger.',
    ],
  },
  {
    version: 249,
    changes: [
      'Le serveur tient mieux la charge quand de nombreux joueurs sont connectés en même temps.',
    ],
  },
  {
    version: 248,
    changes: [
      'Les parties à plusieurs consomment bien moins de connexion : le jeu reste plus stable quand beaucoup de joueurs sont présents.',
    ],
  },
  {
    version: 247,
    changes: [
      'La connexion résiste aux courtes coupures du réseau au lieu de s’interrompre aussitôt.',
      'Les parties chargées, avec beaucoup de joueurs et d’ennemis, restent plus réactives.',
    ],
  },
  {
    version: 246,
    changes: [
      'Les personnages se croisent et passent entre les meubles sans rester coincés.',
      'Plus de bruits de pas pendant la chute ou sous le parachute.',
      'Écran plus épuré : fini le panneau d’aide à gauche et les boutons Défense, Recommencer et nom de partie.',
      'Le bouton Debug s’active et se désactive d’un simple clic.',
      'Le radar est plus grand et les ombres ont des bords un peu plus doux.',
    ],
  },
  {
    version: 245,
    changes: [
      'Le canon lourd tire de vrais obus, rapides et puissants, à petite explosion, et peut enfin tirer à l’horizontale.',
      'Son cercle d’accès est tout près du canon, avec son icône, et ses textes ne parlent plus de DCA.',
    ],
  },
  {
    version: 244,
    changes: [
      'Le canon lourd devient un vrai obusier à taille humaine : il pivote lentement sur ses roues et s’élève jusqu’à 40°.',
      'À chaque tir, son tube recule et l’affût tressaille.',
    ],
  },
  {
    version: 243,
    changes: [
      'Au bureau, on se promène sans arme : le personnage marche et court les mains libres. Le pistolet reste au purgatoire.',
      'Les initiales ne sont plus affichées sur les personnages.',
    ],
  },
  {
    version: 242,
    changes: [
      'Nouveau personnage animé : il marche, court, vise au pistolet, s’assoit dans la DCA et lève les bras en chute.',
    ],
  },
  {
    version: 241,
    changes: [
      'La tourelle automatique du Castor est à la bonne taille : son canon a la même taille que celui du Castor.',
    ],
  },
  {
    version: 240,
    changes: [
      'Les roquettes et le missile du H2 laissent une fumée plus marquée et brillent de loin.',
      'La tourelle automatique du Castor montre enfin ses tirs : traceurs, éclair et recul, pour tous les joueurs.',
    ],
  },
  {
    version: 239,
    changes: [
      'Les trajets des insectes au sol sont des pistes de phéromones orange bien visibles, avec des flèches vers la poubelle.',
    ],
  },
  {
    version: 238,
    changes: [
      'Plus de pastilles de couleur au-dessus des véhicules : chacun garde ses vraies couleurs.',
      'Les cercles d’accès aux postes montrent une icône blanche : volant, pilote, copilote, viseur ou canon.',
    ],
  },
  {
    version: 237,
    changes: [
      'Vitesses, altitudes et distances s’affichent en vraies mesures du bureau : cm/s, cm ou m.',
    ],
  },
  {
    version: 236,
    changes: [
      'Les murs du Castor sont faits de vraies briques 2×4 avec leurs tenons, aux couleurs du jeu.',
    ],
  },
  {
    version: 234,
    changes: [
      'Accueil épuré : titre I am Moucheron, et le numéro de version ouvre les nouveautés.',
      'Nouveaux noms : M1 Chasseur léger, B3 Bombardier moyen, T3 Char moyen, D2 Anti-air mobile, Canon Flak…',
      'Le son démarre tout seul au premier clic, sans réglage à l’écran.',
    ],
  },
  {
    version: 233,
    changes: [
      'Castor : le mur LEGO se construit brique par brique derrière le camion, et l’arrêt garde la partie commencée.',
      'Murs et rubans coûtent exactement 1 $ pour 20 cm, au centime près.',
    ],
  },
  {
    version: 231,
    changes: [
      'Le bouton Debug remplace l’équilibrage et l’envoi manuel d’insectes : un seul interrupteur pour toute la partie.',
      'En debug : argent illimité, plans débloqués, aucune blessure de chute et pas de défaite.',
    ],
  },
  {
    version: 229,
    changes: [
      'Les plans gagnés au vote s’achètent une seule fois pour toute l’équipe.',
      'Le bonus s’applique à tous les objets compatibles, même ceux posés plus tard.',
    ],
  },
  {
    version: 228,
    changes: [
      'Castor : deux fois plus rapide, avec un démarrage vif.',
      'Ses roues tournent dans le bon sens, braquent à l’avant et tournent en sens opposés quand il pivote sur place.',
    ],
  },
  {
    version: 227,
    changes: [
      'Char : la lunette du canon gradue maintenant jusqu’à l’autre bout de la pièce, et les obus vont jusque-là.',
    ],
  },
  {
    version: 226,
    changes: [
      'DCA fixe : maintenez Maj ou Ctrl pour régler la distance de fusée en continu ; relâchez pour arrêter.',
    ],
  },
  {
    version: 225,
    changes: [
      'Fourmis et cafards marchent tout droit vers la poubelle en contournant meubles et défenses.',
      'Le trajet montré pendant la préparation est exactement celui suivi pendant la vague.',
    ],
  },
  {
    version: 224,
    changes: [
      'L’aide en bas à gauche montre les vraies commandes du Castor, des postes de défense et de la construction.',
      'À pied, l’aide rappelle le zoom à la molette et la roue de construction.',
      'Au volant du Castor, V bascule de nouveau la vue tactique.',
    ],
  },
  {
    version: 223,
    changes: [
      'Les constructions montrent leur vrai modèle avant la pose. Les véhicules gardent leur orientation, face à votre personnage.',
    ],
  },
  {
    version: 222,
    changes: [
      'Le canon antichar et le bunker sont accessibles depuis leur cercle d’entrée ; leur sortie vous replace à côté du poste.',
    ],
  },
  {
    version: 217,
    changes: [
      'La tourelle automatique du Castor possède maintenant ses vrais modèles 3D texturés, avec un canon orientable jusqu’à la verticale.',
    ],
  },
  {
    version: 214,
    changes: [
      'La tourelle automatique du Castor suit sa cible avec une tête orientable et un canon pouvant viser à la verticale.',
    ],
  },
  {
    version: 211,
    changes: [
      'Les cartes débloquent désormais le bunker LEGO et le canon antichar du Castor : deux postes occupables à munitions finies.',
    ],
  },
  {
    version: 210,
    changes: [
      'Les boutons du laboratoire sont mieux rangés et restent accessibles sur petit écran.',
    ],
  },
  {
    version: 209,
    changes: [
      'Un laboratoire permet de débloquer les plans, choisir les vagues et retrouver vos scénarios de test.',
    ],
  },
  {
    version: 204,
    changes: [
      'Après avoir débloqué son plan, le Castor peut poser des tourelles automatiques avec une réserve de balles limitée.',
    ],
  },
  {
    version: 198,
    changes: [
      'Le pistolet possède désormais une réserve de 120 balles, rechargée automatiquement près des stations et du Castor.',
    ],
  },
  {
    version: 193,
    changes: [
      'Les DCA fixes disposent maintenant de 120 obus et se rechargent automatiquement près d’une station ou du Castor.',
    ],
  },
  {
    version: 192,
    changes: [
      'Le Castor et les stations réparent maintenant automatiquement les barricades endommagées à proximité.',
    ],
  },
  {
    version: 191,
    changes: [
      'À pied ou au volant du Castor, maintenez G pour choisir une défense, puis relâchez pour la sélectionner.',
    ],
  },
  {
    version: 189,
    changes: [
      'Le Castor construit les murs LEGO et les rubans en roulant, en déposant chaque section derrière lui.',
    ],
  },
  {
    version: 186,
    changes: [
      'Les roues du Castor sont repositionnées et ne se superposent plus à celles du châssis.',
    ],
  },
  {
    version: 185,
    changes: [
      'Le Castor adopte son vrai modèle détaillé, avec ses couleurs, sa tourelle et ses six roues animées.',
    ],
  },
  {
    version: 179,
    changes: [
      'Le G1 Castor rejoint le garage : un camion rapide qui soigne et ravitaille ses alliés tout en roulant.',
    ],
  },
  {
    version: 172,
    changes: [
      'Les stations réparent et rechargent automatiquement les véhicules à proximité, même en mouvement, en utilisant la caisse commune.',
    ],
  },
  {
    version: 169,
    changes: [
      'Les chasseurs, le H2, le tank et la DCA mobile retrouvent les détails de leurs camouflages d’origine.',
    ],
  },
  {
    version: 168,
    changes: [
      'Les véhicules gardent leurs couleurs ; un petit rond coloré au-dessus de chacun permet de les reconnaître.',
    ],
  },
  {
    version: 167,
    changes: [
      'Le Stuka, le Spitfire, le tank et la DCA mobile adoptent de nouvelles silhouettes militaires et leur camouflage.',
    ],
  },
  {
    version: 166,
    changes: [
      'Le bombardier accueille un quatrième joueur dans sa tourelle ventrale.',
      'Son nouveau modèle conserve son camouflage et se repère grâce à un rond coloré au-dessus de lui.',
    ],
  },
  {
    version: 165,
    changes: [
      'Le H2 adopte le croquis inspiré du Mi-24, avec deux verrières, un train à roues et ses deux rotors animés.',
    ],
  },
  {
    version: 163,
    changes: [
      'Le chasseur M1 prend les formes du croquis : ailes hautes, cockpit vitré et livrée bicolore.',
    ],
  },
  {
    version: 161,
    changes: [
      'Les ennemis au sol avancent plus régulièrement, sans petits bonds entre leurs déplacements.',
    ],
  },
  {
    version: 159,
    changes: [
      'Visez avec la caméra pour poser tous vos objets.',
      'Tracez vos barricades entre deux points : le nombre de briques s’adapte à leur longueur.',
    ],
  },
  {
    version: 157,
    changes: [
      'Repérez les prochaines entrées et votez pour un plan commun. Équipez vos défenses avant de lancer une vague plus coriace.',
    ],
  },
  {
    version: 156,
    changes: [
      'Repérez les couloirs de vol grâce aux phéromones. Posez et orientez des ventilateurs pour dévier les insectes vers vos défenses.',
    ],
  },
  {
    version: 154,
    changes: [
      'Maintenez la molette et relâchez vers votre outil. Deux clics posent un mur ou un ruban, un seul suffit pour le sucre.',
    ],
  },
  {
    version: 153,
    changes: [
      'Maintenez le clic et marchez pour étirer vos barricades et rubans. Tournez le sachet de sucre pour orienter ses cristaux.',
    ],
  },
  {
    version: 152,
    changes: [
      'Posez vos défenses directement devant votre personnage en marchant, avec un aperçu et une rotation.',
    ],
  },
  {
    version: 144,
    changes: [
      'Une carte de défense permet de poser des barricades, du sucre et des bandes collantes.',
    ],
  },
  {
    version: 131,
    changes: [
      'Les mitrailleuses tirent plus régulièrement lorsque la connexion ou les images ralentissent.',
    ],
  },
  {
    version: 128,
    changes: [
      'Les éclairs de tir apparaissent au bout des canons des mitrailleuses.',
      'Les distances et altitudes affichées correspondent désormais à l’échelle réelle.',
    ],
  },
  {
    version: 126,
    changes: [
      'Les obus de la DCA mobile attendent de passer au plus près des objets détectés pour exploser.',
    ],
  },
  { version: 125, changes: ['Les rats géants se déplacent 70 % plus vite.'] },
  { version: 124, changes: ['Tous les ennemis se déplacent deux fois moins vite.'] },
  {
    version: 122,
    changes: ['Les roquettes et missiles laissent une traînée de fumée et une petite flamme.'],
  },
  {
    version: 119,
    changes: ['Un bouton « Nouveautés » permet de retrouver les changements du jeu.'],
  },
  {
    version: 117,
    changes: ['Les grandes nuées se synchronisent plus efficacement en multijoueur.'],
  },
  { version: 112, changes: ['Les insectes ont des vitesses adaptées à chaque espèce.'] },
  {
    version: 109,
    changes: ['Le rat, le moustique et l’araignée pondeuse rejoignent le bestiaire.'],
  },
  {
    version: 97,
    changes: ['Les nuées créées manuellement avancent à vitesse constante, même très nombreuses.'],
  },
  { version: 94, changes: ['Les nuées s’adaptent à leur taille et empruntent plusieurs entrées.'] },
  {
    version: 90,
    changes: ['Les réglages personnels de pilotage sont enregistrés sur votre appareil.'],
  },
  {
    version: 89,
    changes: ['L’équilibrage et la génération de nuées sont accessibles aux joueurs de la room.'],
  },
  { version: 86, changes: ['Le bourdonnement des nuées se déplace avec elles dans le son 3D.'] },
  {
    version: 81,
    changes: ['Le rendu des nuées est optimisé pour afficher beaucoup de moucherons.'],
  },
];

// Utiliser uniquement du texte, jamais du HTML provenant du changelog.
export interface ChangelogMount {
  dialog: HTMLDialogElement;
  trigger: EventTarget;
  close: EventTarget;
  list: Element;
  document: Document;
  onOpen: () => void;
}
export function mountChangelog({
  dialog,
  trigger,
  close,
  list,
  document,
  onOpen,
}: ChangelogMount): void {
  const fragment = document.createDocumentFragment();
  for (const entry of PLAYER_CHANGELOG) {
    const section = document.createElement('section');
    const title = document.createElement('h3');
    title.textContent = 'Version ' + entry.version;
    const ul = document.createElement('ul');
    for (const change of entry.changes) {
      const li = document.createElement('li');
      li.textContent = change;
      ul.append(li);
    }
    section.append(title, ul);
    fragment.append(section);
  }
  list.replaceChildren(fragment);
  trigger.addEventListener('click', () => {
    if (dialog.open) return;
    onOpen();
    dialog.showModal();
  });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}
