# Construire et exécuter avec Docker

Le `Dockerfile` construit localement la même version du serveur Node/UDP. Le workflow de
[publication](../.github/workflows/docker.yml) construit et publie sur GHCR à
chaque push sur `main` : `ghcr.io/simonjamain/i-am-a-moucheron:latest` et un
tag `sha-<SHA complet>` pour retrouver le commit publié.

## Construction et démarrage

Depuis la racine du dépôt :

```sh
node scripts/build-info.ts   # VERSION et nouveautés (historique Git complet requis)
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
connectivité UDP : `node scripts/smoke-image.ts http://127.0.0.1:3000` joue une courte
partie en local, et deux joueurs sur des réseaux distincts valident le WAN.

`compose.yaml` (et `compose.traefik.yaml` pour un Traefik existant) démarre l’image GHCR
`ghcr.io/simonjamain/i-am-a-moucheron:latest` avec la plage UDP 41000–41099 ; renseigner
`UDP_ADVERTISE_ADDRESS` dans `.env` (voir `.env.example`). Pour essayer un build local,
définir `MOUCHERON_IMAGE=i-am-a-moucheron:local` :

```sh
docker compose up -d                                          # production
docker compose -f compose.yaml -f compose.traefik.yaml up -d  # derrière Traefik
```

## Contrôle de contribution et protection de main

Chaque contribution construit l'image complète avec la commande `docker build` ci-dessus
et rapporte le résultat et le commit testé dans la PR ; sans Docker local, attendre le
contrôle GitHub Actions.

Le workflow [Docker build validation](../.github/workflows/docker-build.yml) exécute le
contrôle **Docker build** sur toutes les PR et les groupes de fusion, sans filtre de
fichiers : il construit l'image `linux/amd64` sans la publier ni utiliser de secret, puis
la démarre en lecture seule avec la plage UDP publiée, et ensuite avec un port UDP unique.
Chaque fois, [`smoke-image.ts`](../scripts/smoke-image.ts) vérifie `/healthz` et le 410
de `/api/join`, puis fait jouer deux pairs WebRTC natifs en UDP : ils rejoignent la salle,
lancent la mission et reçoivent les mouvements de l'autre. Le client écoute seulement sur
127.0.0.1 : sans port publié ni adresse annoncée, la partie échoue. Ce contrôle ne prouve
ni le WAN ni le navigateur. Seul le workflow de
publication reconstruit l'image sur `main` ; ses exécutions ne sont pas annulées par les
pushs suivants, et le tag SHA identifie chaque livraison.

Le fichier de workflow ne rend pas un contrôle obligatoire : c'est la protection (ou le
ruleset) de `main`, configurée par un administrateur, qui exige la PR et le status check
**Docker build** avec une branche à jour. Les agents ne peuvent ni la lire ni la modifier ;
si la fusion est bloquée, laisser la PR ouverte
([contrôles obligatoires GitHub](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches#require-status-checks-before-merging)).

## Outillage de modèles GLB (hors VPS de jeu)

L'image Docker de développement Meshy est distincte de l'image du serveur.
Elle est construite et utilisée à la demande par `compose.assets.yaml`.
La CI (`assets-check.yml`) vérifie l'outil sur une fixture texturée ; `assets-publish.yml`
le publie sur GHCR quand `tools/assets/` ou `compose.assets.yaml` change sur `main`. Aucun
service permanent.
Voir [pipeline d'assets](asset-pipeline.md).
