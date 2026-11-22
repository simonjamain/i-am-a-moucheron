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

`compose.yaml` (et sa surcouche `compose.traefik.yaml`) référence encore l’ancien
tag local `i-am-a-moucheron:2026.10.29-udp.2`, qui n’est plus produit : préférer les
commandes ci-dessus ou l’image GHCR `latest`.

## Contrôle de contribution

Chaque contribution construit l’image avec la commande `docker build` ci-dessus et
rapporte le résultat et le commit testé dans la PR ; si Docker manque localement,
le signaler et attendre le contrôle GitHub Actions.

Le workflow [Docker build validation](../.github/workflows/docker-build.yml)
exécute le contrôle requis **Docker build** sur toutes les PR (y compris
documentaires) et les groupes de fusion : il construit l’image `linux/amd64` sans
la publier ni utiliser de secret, la démarre et contrôle `/healthz` et le 410 de
`/api/join` (sans tester UDP). La publication GHCR ([docker.yml](../.github/workflows/docker.yml))
ne se déclenche que sur `main` ; ses exécutions ne sont pas annulées par les pushs
suivants et le tag SHA identifie chaque livraison.

Les contrôles requis de `main` sont réglés dans les paramètres du dépôt, hors de
portée des agents : si GitHub bloque la fusion, laisser la PR ouverte et le signaler.

## Outillage de modèles GLB (hors VPS de jeu)

L'image de développement Meshy est distincte de l'image du serveur : construite à
la demande par `compose.assets.yaml`, vérifiée en CI (`assets-check.yml`) et publiée
sur GHCR depuis `main` (`assets-publish.yml`). Voir [pipeline d'assets](asset-pipeline.md).
