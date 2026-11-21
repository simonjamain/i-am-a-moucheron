# Construire et exécuter avec Docker

La référence de livraison est le dépôt GitHub (voir [l’exploitation](operations.md)). Le dépôt fournit aussi un `Dockerfile` pour
construire localement la même version du serveur Node/UDP. Le workflow de
[publication](../.github/workflows/docker.yml) construit et publie sur GHCR à
chaque push sur `main` : `ghcr.io/simonjamain/i-am-a-moucheron:latest` et un
tag `sha-<SHA complet>` pour retrouver le commit publié.

## Construction et démarrage

Depuis la racine du dépôt :

```sh
docker build -t i-am-a-moucheron:local .
docker run -d --name i-am-a-moucheron --restart unless-stopped --init \
  --read-only --tmpfs /tmp:size=16m,mode=1777 --cap-drop ALL \
  --security-opt no-new-privileges \
  -e UDP_ADVERTISE_ADDRESS=ADRESSE_IP_PUBLIQUE \
  -p 127.0.0.1:3000:3000/tcp -p 41000-41099:41000-41099/udp \
  i-am-a-moucheron:local
curl http://127.0.0.1:3000/healthz
```

Remplacer `ADRESSE_IP_PUBLIQUE` par l’adresse réelle de la VM. La plage
`41000–41099/UDP` doit être publiée sans changement de numéros et autorisée par
les pare-feu de la VM et de l’hébergeur. HTTP peut passer par un proxy HTTPS ; le
trafic de jeu UDP ne passe pas par ce proxy. Les variables et vérifications réseau
sont détaillées dans le [guide du serveur UDP](udp-server.md).

Pour un réseau d'entreprise qui ne laisse sortir l'UDP que vers des ports
connus, publier un seul port partagé, par exemple sur 3478 ou 443 :

```sh
docker run … -e UDP_ADVERTISE_ADDRESS=ADRESSE_IP_PUBLIQUE \
  -e UDP_MUX_PORT=41000 -e UDP_ADVERTISE_PORT=3478 \
  -p 127.0.0.1:3000:3000/tcp -p 3478:41000/udp i-am-a-moucheron:local
```

`UDP_ADVERTISE_PORT` doit égaler le port publié côté hôte ; voir
[le port UDP unique](udp-server.md#port-udp-unique-réseaux-dentreprise).

Pour conserver les [statistiques](stats.md) d'une version à l'autre, monter un volume
inscriptible par l'utilisateur `node` et définir `STATS_FILE` (par exemple
`-v moucheron-stats:/stats -e STATS_FILE=/stats/stats.json`) ; la page `/stats` les affiche.

Une seule instance conserve toutes les salles en RAM. Redémarrer ou recréer le
conteneur efface les parties en cours. Le contrôle `/healthz` valide HTTP, pas la
connectivité UDP : la vérifier avec deux joueurs sur des réseaux distincts.

`compose.yaml` et `compose.traefik.yaml` référencent encore l’ancien tag local
`i-am-a-moucheron:2026.10.29-udp.2`, qui n’est plus produit : ils ne suivent pas
l’état courant. Utiliser la commande `docker build` / `docker run` ci-dessus ou
l’image GHCR `latest`.

## Contrôle de contribution et protection de main

Chaque contribution construit l’image complète avec la commande `docker build`
ci-dessus. Rapporter le résultat et le commit testé dans la PR. Si Docker manque
localement, le signaler et attendre le résultat de GitHub Actions.

Le workflow [Docker build validation](../.github/workflows/docker-build.yml)
exécute le contrôle **Docker build** sur toutes les PR et les groupes de fusion. Il construit et charge l’image `linux/amd64` sans la
publier ni utiliser de secrets de déploiement. Aucun filtre de fichiers ne saute
le contrôle sur les contributions documentaires. Le job démarre ensuite l'image construite et contrôle `/healthz` et le refus 410
de `/api/join` (sans tester UDP). Le workflow de publication
GHCR reste distinct et ne se déclenche que sur les pushs sur `main` : les
branches de contribution et les tags Git ne publient aucune image. Sur `main`,
seul le workflow de publication reconstruit l’image, sans doubler le build de
vérification. Les exécutions de publication ne sont pas annulées par les pushs
suivants ; leur succès et le tag SHA permettent de vérifier chaque livraison.

Pour bloquer effectivement la fusion, un administrateur doit configurer dans
GitHub une protection ou un ruleset actif sur `main` : exiger une PR et le
status check **Docker build** (application GitHub Actions), avec une branche à
jour avant fusion. Conserver les autres protections existantes. Appliquer la
règle aux administrateurs et éviter les exceptions de contournement si toutes
les fusions doivent être bloquées en cas d’échec. Le fichier de workflow seul
ne peut pas rendre un contrôle obligatoire.

Les agents n'ont pas les droits d'administration : cette protection n'est pas
lisible ni modifiable depuis une contribution. Vérifier son activation dans les
paramètres du dépôt ; si la fusion est bloquée, laisser la PR ouverte.

Référence : [contrôles obligatoires GitHub](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches#require-status-checks-before-merging).

## Outillage de modèles GLB (hors VPS de jeu)

L'image Docker de développement Meshy est distincte de l'image du serveur.
Elle est construite et utilisée à la demande par `compose.assets.yaml`.
La CI vérifie le même outil sur une fixture texturée et GHCR le publiera
après fusion sur `main`, sans aucun service permanent.
Voir [pipeline d'assets](asset-pipeline.md).
