> **Archive du 29 octobre 2026.** Ce document décrit le paquet Docker `.2`,
> antérieur aux retours terrain. Il ne constitue plus la procédure courante.
> Reprendre avec le [guide Docker actuel](../docker.md) ou
> [l’exploitation](../operations.md).

# Installer l’image Docker

Image livrée : `i-am-a-moucheron:2026.10.29-udp.2`, **Linux AMD64 / x86-64**.
L’archive du paquet est une vraie image importable avec `docker load`, contenant
la base officielle Node 24 Bookworm Slim et le serveur RAM/UDP. Aucun registry
n’est nécessaire. Aucun registry distant n’a été alimenté par cette livraison.

## Installation

Télécharger le paquet ZIP fourni dans la conversation, le transférer sur la VM
et l’extraire. Dans le dossier `moucheron-docker` :

```sh
sha256sum -c SHA256SUMS
docker load -i i-am-a-moucheron-2026.10.29-udp.2-linux-amd64.tar.gz
cp .env.example .env
nano .env
```

Remplacer impérativement `UDP_ADVERTISE_ADDRESS` par **l’IP publique réelle de la
VM**. Docker bridge utilise une IP privée ; le serveur doit annoncer l’IP publique
pour recevoir les paquets UDP. Si la VM est derrière un routeur, rediriger les
ports UDP vers la VM en conservant leurs numéros. L’exemple `203.0.113.10` n’est
pas une adresse fonctionnelle.

Pour un proxy HTTPS déjà installé sur l’hôte :

```sh
docker compose up -d
docker compose ps
curl http://127.0.0.1:3000/healthz
```

Le port HTTP est lié à `127.0.0.1:3000` par défaut. Le proxy doit transmettre le
Host original. Pour un accès HTTP depuis le réseau local, définir
`HTTP_BIND=0.0.0.0` ; une URL HTTPS reste nécessaire pour jouer à distance.
L’image ne gère ni DNS ni certificat TLS.

## Avec ton Traefik

Renseigner également `GAME_HOST`, `TRAEFIK_NETWORK` et `TRAEFIK_ENTRYPOINT` dans
`.env`. Le réseau Docker externe doit déjà exister. Puis :

```sh
docker compose -f compose.yaml -f compose.traefik.yaml up -d
```

L’override relie le jeu au réseau `reverse-proxy` et dirige le HTTPS du domaine
choisi vers le port interne 3000. Les labels supposent un certificat disponible
dans Traefik ou un resolver par défaut sur l’entrypoint. Si ton ACME est configuré
par routeur, ajouter le label suivant avec le nom réel de ton resolver :

```yaml
traefik.http.routers.moucheron.tls.certresolver: TON_RESOLVER_EXISTANT
```

Le DNS du domaine doit pointer vers la VM. Les ports **41000–41099/UDP** passent
directement du réseau extérieur au conteneur et doivent être ouverts sur le
pare-feu de la VM et celui de l’hébergeur. Ils ne passent pas par le routeur HTTP
de Traefik. Conserver la même plage côté application et côté publication Docker.

## Avec Portainer

Importer d’abord l’image avec `docker load` sur le Docker Engine réellement
administré par Portainer. Créer ensuite une stack depuis `compose.yaml` et
renseigner les variables d’environnement de la stack. Pour Traefik, ajouter au
service les réseaux et labels de `compose.traefik.yaml`, et sa déclaration du
réseau externe. Ne pas demander à Portainer de retélécharger l’image : elle est
locale et `pull_policy: never` est explicite. Cet exemple vise Docker Compose
sur un Engine, pas une répartition de la partie entre plusieurs nœuds Swarm.

## Fonctionnement et mises à jour

Une seule instance héberge toutes ses salles. Aucun volume ni base de données.
Arrêter, redémarrer ou recréer le conteneur efface les parties en cours. Les
joueurs doivent alors rejoindre de nouveau. HTTP sert les assets, la santé et
la signalisation ; le gameplay utilise exclusivement UDP, sans repli.

Le conteneur utilise l’utilisateur `node`, un système de fichiers en lecture seule
et un petit `/tmp` éphémère. Le healthcheck interroge `/healthz` ; il ne prouve pas
que le pare-feu laisse passer UDP. Vérifier « UDP » avec deux joueurs sur des
réseaux distincts avant de conclure que l’installation fonctionne sur Internet.

Pour construire une nouvelle image depuis les sources du dépôt :

```sh
docker build -t i-am-a-moucheron:2026.10.29-udp.2 .
```

Le Dockerfile assemble les assets pendant la construction ; le démarrage lance
directement `node server/index.js`. Aucun téléchargement ni build au démarrage.
La base est épinglée par digest ; mettre à jour cet argument lors des futures
mises à jour Node. Pour publier ultérieurement sur un registry dont tu possèdes
les droits, étiqueter cette image avec son adresse puis utiliser `docker push`.

## Vérification de cette livraison

Les empreintes de la base officielle, la configuration et toutes les couches de
l’archive ont été vérifiées. Le Node et les dépendances natives extraits de
l’image ont exécuté le test à deux clients WebRTC, avec UDP confirmé et actions
HTTP refusées. La syntaxe YAML des deux fichiers Compose a été vérifiée.

Cet environnement ne dispose pas de Docker : `docker load`, `docker compose up`,
les restrictions du conteneur et la connectivité WAN n’ont pas été exécutés ici.
L’archive a été assemblée au format Docker à partir des couches officielles et
du contenu applicatif équivalent au runtime du Dockerfile, sans daemon Docker.

Sources : [docker load](https://docs.docker.com/reference/cli/docker/image/load/),
[politique de récupération Compose](https://docs.docker.com/reference/compose-file/services/#pull_policy),
[image officielle Node](https://github.com/nodejs/docker-node),
[labels Docker de Traefik](https://doc.traefik.io/traefik/reference/routing-configuration/other-providers/docker/).
