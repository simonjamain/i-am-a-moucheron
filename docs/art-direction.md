# Direction artistique

Référence de l’identité visuelle, sonore et du ton du jeu. Toute contribution visible
(modèle, décor, effet, son, texte, menu) s’y conforme ; une exception se justifie dans
sa PR. L’interface a sa propre référence : [règles d’interface](ui-guidelines.md).
Décisions prises après la planche visuelle n°1 (palettes rendues avec le moteur du jeu).

## En une phrase

**De vraies machines de guerre miniatures, égarées dans le quotidien des grands,
racontées sur un ton administratif pince-sans-rire.**

## Piliers

### 1. Le décalage est le sujet

Des engins militaires n’ont rien à faire dans un bureau : c’est ce décalage d’échelle et
de contexte qui fait le jeu et son humour (esprit _Micro Machines V3_). Le décor est le
monde des grands, immense, banal et familier ; les machines y sont des intruses et
doivent **se détacher** de lui, jamais s’y fondre.

### 2. Faux modèles, gestes vrais

Les machines sont de **vraies machines miniatures**, pas des jouets : rivets, panneaux,
usure, huile, plutôt que plastique, autocollants ou vis de jouet. On ne reproduit pas
fidèlement de modèles réels, mais tout ce qui bouge bouge comme en vrai (inspiration
_War Thunder_) : gouvernes, trappes, volets, recul du canon, douilles éjectées, chenilles,
rotors, suspensions, fumée moteur. Le réalisme est **dans la mécanique et les petits
détails**, pas dans l’exactitude des formes. Un détail crédible vaut mieux qu’un modèle exact.

### 3. Le monde est l’interface

Comme dans _Astroneer_ ou _Sea of Thieves_, le joueur comprend l’état du jeu en
regardant et en écoutant le monde, pas en lisant un HUD : une voile gonflée y dit le
vent, ici une hélice qui ralentit, un moteur qui tousse ou une caisse de munitions qui
se vide disent l’état de l’appareil. Détail et méthode : [règles d’interface](ui-guidelines.md).

### 4. L’absurde administratif

L’humour naît de la situation, jamais d’une blague appuyée : une armée minuscule qui
remplit des formulaires en triple exemplaire pour défendre une poubelle, un Saint Pierre
au guichet. Les textes adoptent le ton sérieux et réglementaire d’une administration
militaire, appliqué à des situations absurdes (voir [Ton des textes](#ton-des-textes)).
La paperasse est **militaire**, pas propre au bureau : elle reste cohérente sur toute carte.

## Rendu

- **Dessin animé, low poly, chaleureux** : [rendu dessin animé](toon-rendering.md) à
  trois paliers de lumière et contours brun sombre, pour tous les joueurs.
- Formes simples et lisibles à distance ; le détail sert la mécanique (pièces mobiles,
  marquages), pas la surcharge.
- Lumière d’intérieur chaude ; le brouillard et le voile d’altitude restent légers.
- Personnages et insectes forment **une même famille** : les modèles actuels sont la
  référence ([bestiaire](enemy-bestiary.md), galerie du site). Toute nouvelle créature
  ou tout nouveau personnage s’aligne sur eux.

## Couleurs

Pas de palette imposée au décor : chaque carte choisit ses teintes. Ce qui est fixé :

- **Le style** est commun à toutes les cartes (rendu, formes, contours).
- **Des tons pastels**, doux et peu saturés, pour le décor.
- **Le contraste de clarté** : les engins mêlent crème, sable et olive ; le sol reste
  nettement plus sombre ou plus froid que leurs carlingues, sinon ils s’y noient.
- **Des rôles réservés** :

| Rôle                 | Règle                                                                  |
| -------------------- | ---------------------------------------------------------------------- |
| Machines militaires  | Olive, kaki, sable et camouflages ; elles détonnent dans le quotidien. |
| Marquages            | Accents réalistes (cocardes, numéros, bandes, jaune de chantier).      |
| Insectes             | Famille des modèles actuels, lisible sur le décor.                     |
| Signal d’interaction | **Bleu cyan `#2ec4d6`**, uniquement pour « ceci s’utilise ».           |
| Danger               | Réservé aux alertes réelles (dégâts, infestation), jamais décoratif.   |

Le bleu cyan est la seule couleur fixée dans le code pour le monde, comme jeton partagé
([règles d’interface](ui-guidelines.md#jetons-visuels)) ; le jaune reste libre pour les
marquages des engins. Le vert sombre et le vert acide actuels de l’interface sont hérités
et disparaîtront avec la reprise des écrans.

## Environnements

- Le **bureau** est la carte principale et le concept d’origine ; d’autres pièces du
  quotidien sont possibles (cantine, salle de jeux…). Le design détaillé des cartes est
  en attente : leur intérêt de jeu passe d’abord.
- Un décor se pense comme **une famille d’objets du quotidien à l’échelle géante**
  (meubles, fournitures, objets posés) aux règles d’assemblage simples. Cette approche
  prépare une piste à long terme de cartes générées à partir d’une graine.
- Les objets du décor sont reconnaissables au premier coup d’œil, sans détail inutile.

## Machines et assets

- Pièces mobiles séparées, pivots crédibles, mouvements inspirés du réel ; règles de
  production : [pipeline des assets](asset-pipeline.md) et
  [ajouter du contenu](adding-content.md).
- Usure légère et marquages plutôt que surfaces neuves et unies.
- Une machine doit montrer son état : dégâts (fumée, trous, pièces qui pendent),
  carburant, munitions, poste occupé (personnage visible à son poste) — voir les règles
  d’interface.
- Chaque poste occupable est une pièce identifiable du modèle (verrière, tourelle,
  trappe) : c’est lui qu’on vise pour monter.
- Proposer tout nouveau visuel au regard de cette page **avant** génération (règle Meshy
  d’[AGENTS](../AGENTS.md)).

## Son

Le son porte autant d’information que l’image : moteur qui peine ou tousse, tir qui
change en fin de bande, rotor qui accélère, impact sur une carrosserie, insecte qui
approche. Un état important a un signal sonore reconnaissable, utile sans regarder
la source. Fonctionnement : [audio](audio.md).

## Ton des textes

- **Pince-sans-rire administratif** : phrases sérieuses, réglementaires, au service d’une
  situation absurde. Les contrats actuels (`src/contracts.js`) sont la référence, par
  exemple : « Le transfert de responsabilité ne s’effectue ni par un soupir ni par un
  message oublié sur le siège. »
- Pas de clin d’œil appuyé, d’émoji ni de point d’exclamation pour faire rire : la
  gravité du ton fait l’effet.
- Les consignes utiles restent claires : l’humour ne masque jamais ce que le joueur doit
  faire.
- Les textes de jeu sont en français courant ; noms validés des engins : [gameplay](gameplay.md#accueil-et-noms).

## Références

| Référence               | Ce qu’on en retient                                             |
| ----------------------- | --------------------------------------------------------------- |
| _Micro Machines V3_     | Engins miniatures dans le quotidien, décor géant et familier.   |
| _War Thunder_           | Mécanique crédible, sensation des machines, détails réels.      |
| _Astroneer_             | Aucun HUD : les interfaces sortent des machines.                |
| _Sea of Thieves_        | HUD minimal, état lu dans le monde et dans le son.              |
| _Bloons TD_             | Tower defense lisible, vagues, progression.                     |
| _Desktop Tower Defense_ | Bureau comme terrain, murs et détours imposés aux ennemis.      |
| Roguelikes              | Piste : parties variées, cartes générées, graines partageables. |

## Vérifier une contribution

- Se détache-t-elle correctement du décor, ou s’y fond-elle ?
- Ce qui bouge bouge-t-il de façon crédible ?
- L’information passe-t-elle par le monde et le son avant le HUD ?
- Le texte est-il sérieux, clair et absurde par la situation ?
- Est-elle cohérente avec les modèles, couleurs et pictogrammes existants ?
