# Vol des hélicoptères sur Rapier

L'hélicoptère d'attaque et le Castor volant (`HELI_TYPES`) sont des corps rigides Rapier
(`src/heli-physics.ts`, classe `HeliRig`), sur le même schéma que les avions
([plane-physics.md](plane-physics.md)) : unités « mètres de référence », monde partagé du serveur
pour les engins vides ([engins sans pilote](physics-engine.md#engins-sans-pilote-le-serveur)), train à ressorts par rayons, volumes mesurés sur le modèle.
Le pas `stepHelicopter` (`src/helicopter.ts`) ne sert que tant que Rapier n'est pas chargé.

## Pilotage

Le pilotage « instructeur » ([commandes](helicopter-controls.md)) : la souris donne l'assiette cible
(45° au plus, un seul budget pour tangage et roulis), le collectif une vitesse verticale
(montée 8 m/s, descente jusqu'à 30 m/s), le neutre tient le stationnaire ; A/E tournent
(1,4 rad/s) quand la vue verticale est active. Ce pilotage s'exerce sur un corps rigide :

- **Rotor.** Poussée le long de l'axe haut du corps, égale à ce qui tient la vitesse verticale
  demandée (`g + 2 (cible − vy)`), divisée par le cosinus de l'inclinaison (inclinée, la même
  portance pousse aussi de côté), bornée à 2,2 g, multipliée par `rotorPower` (le rotor monte et
  descend en régime : 2/s en montée, 0,8/s en descente). Sans moteur ou sans
  pilote, il ne reste que le poids : l'engin tombe.
- **Vitesse maximale.** Traînée quadratique sur la vitesse horizontale, réglée pour que la
  poussée horizontale à 45° (g) l'équilibre à `maxSpeed` (env. 39 m/s pour 42), plus un
  amortissement linéaire léger.
- **Assiette.** Vitesse angulaire visée par la rotation vers la cible (≈ 2/s). Au sol avec un rotor qui ne porte pas, seul le lacet est imposé : l'inclinaison est
  l'affaire du train et de la gravité. Garé : rien n'est imposé.
- **Train.** Ressorts par rayons : trois roues pour l'hélicoptère d'attaque (deux principales
  sous la cabine, une au nez), quatre points sur les deux patins du Castor volant. Garé : freins
  et frottement raide, pour ne pas glisser sur une pente.
- **Collisions et dégâts.** Cabine, queue, ailerons ou coque et pylônes sont des boîtes ; les
  **disques de rotor** sont des cylindres minces. Un contact au-delà de `HELI_CRASH_IMPACT`
  (8 m/s de variation de vitesse) détruit l'engin ; un toucher du train à plus de 8 m/s aussi
  (les ressorts amortissent : la vitesse de fermeture du ressort est lue avant l'impulsion).
  Un frôlement ne détruit pas.

## Engin vide

Quand le pilote sort, le serveur reprend l'hélicoptère (`ParkedHost`) : le rotor ralentit (en
vol, il tombe), les freins sont serrés, et il s'endort au sol une fois le rotor arrêté.

## Géométrie

`HELI_GEOMETRY` (en unités du modèle, relevée sur les îlots du maillage avec
`scripts/split-vehicle-parts.mjs`) : moyeux des roues ou patins, sol, centre de masse (la part de
poids portée par chaque ressort suit le centre de masse), boîtes et disques. Le Castor volant
a son profil `gear` aligné sur ses patins (1 unité). Les boîtes sont ajustées à la main d'après les
îlots, comme celles du biplan : à vérifier avec le bouton « Physique ».

## Non fait

Effet de sol, décrochage de pale, effet de couple du rotor, tangage différentiel du tandem :
le Castor volant a le comportement de l'hélicoptère d'attaque avec ses volumes. Les
constructions posées par les joueurs ne sont pas dans le monde du serveur.

## Vérifier

`scripts/test-heli-physics.mjs` (stationnaire, montée, descente, vitesse maximale,
visée à la souris, moteur coupé, décollage, atterrissage doux et chute, pente de 7° garée).
