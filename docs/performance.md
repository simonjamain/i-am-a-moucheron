# Performances — mesures et limites

## Collisions des tirs

`InsectIndex` dans `src/insect-hits.js` sélectionne les candidats avec une grille
spatiale de 8 cm et un parcours des cellules traversées par le segment. Les mêmes
sphères conservatrices que le parcours exhaustif couvrent toutes leurs cellules.
Les intersections précises, tolérance du moucheron, exclusions et ordre des
impacts ex æquo sont conservés. L'index est invalidé après l'animation des ennemis
et construit au premier tir, une seule fois par image. Les suppressions entre
deux tirs sont filtrées. En dessous de 128 insectes, pour les rayons très longs,
les populations concentrées ou les modèles surdimensionnés, le parcours direct
reste disponible. Aucun ennemi ni projectile n'est supprimé par cette optimisation.

Reproduction : `npm run bench:collisions`. Le scénario CPU compare les mêmes
modèles et 256 segments de 2 cm, avec reconstruction de l'index incluse, après
échauffement ; 12 échantillons alternés par méthode. Population dispersée dans
2 m ou concentrée dans 12 cm. La médiane dépend de la machine et de sa charge.

Mesure locale du 31 octobre 2026, Node 24, avant / après (ms par lot) :

| Insectes | Dispersés, direct | Dispersés, index | Concentrés, direct | Concentrés, index/repli |
| -------- | ----------------- | ---------------- | ------------------ | ----------------------- |
| 100      | 1,39              | 1,33             | 5,39               | 5,01                    |
| 300      | 4,27              | 2,43             | 20,32              | 21,96                   |
| 900      | 12,33             | 4,26             | 72,35              | 71,54                   |

Le cas compact conserve le coût des intersections et ne promet aucun gain ;
le repli évite le tri d'une grande partie de la population. Les temps CPU ne
mesurent ni FPS, ni GPU, ni WAN. Les plafonds de population restent inchangés.

`test-insect-index.mjs` compare les impacts au parcours exhaustif avec les six
espèces, rotations/échelles, portées, exclusions, frontières de cellule,
suppressions, transformations parentes et modèles surdimensionnés.

Essai en jeu : une rafale dans et autour d'une nuée, puis un tir personnel sur
chaque espèce ; vérifier les impacts, les alliés, le mobilier et les fins de vague.
L'environnement temporaire est indisponible ; utiliser `npm ci && npm start`
et le réseau UDP décrit dans [l'exploitation](operations.md).

## Encodage des réponses UDP

`GameSession` conserve les réponses JSON immuables pour rejouer une commande.
`encodeReplyText()` découpe désormais ce texte directement, au lieu de le parser
puis de le resérialiser. `encodeReply()` garde son interface objet. Le format v1,
les identifiants, le découpage à 12 000 caractères et la limite de 4 Mio de
caractères sont conservés ; ce changement n'économise aucun octet réseau.
Le chemin texte est interne et attend du JSON déjà produit par `JSON.stringify`.
Les requêtes entrantes restent validées comme avant.

`node scripts/test-udp-reply-encoding.mjs` compare les paquets à un encodeur v1
figé, indépendant du code de production : erreurs, Unicode, frontières de blocs,
réassemblage inversé et dépassement de limite. Les tests de session et deux pairs
UDP couvrent le rejeu sans réexécuter une commande et l'immuabilité de la réponse.

`npm run bench:udp-replies` compare les mêmes réponses de vagues réelles (24, 288
et 300 ennemis), avec l'encodeur historique figé : 12 lots alternés de 100 envois
après échauffement. Le premier envoi inclut la sérialisation initiale commune ;
le rejeu utilise la chaîne déjà en cache. Exemple local Node 24, réponse de
91 766 caractères : premier envoi 1,19 → 0,50 ms ; rejeu 0,89 → 0,22 ms.
Ce sont des temps CPU d'encodage, pas la latence réseau ni le coût total serveur.
