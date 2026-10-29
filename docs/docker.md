# Construire et exécuter avec Docker

La livraison courante reste le ZIP des sources décrit dans
[l’exploitation](operations.md). Le dépôt fournit aussi un `Dockerfile` pour
construire localement la même version du serveur Node/UDP. Aucune image
préconstruite ni aucun registre distant ne sont maintenus.

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

Une seule instance conserve toutes les salles en RAM. Redémarrer ou recréer le
conteneur efface les parties en cours. Le contrôle `/healthz` valide HTTP, pas la
connectivité UDP : la vérifier avec deux joueurs sur des réseaux distincts.

Les fichiers Compose et l’exemple Traefik du dépôt restent liés à l’ancienne
image importable `2026.10.29-udp.2`. Ses instructions sont conservées dans
[l’archive du paquet Docker](archive/docker-package-2026-10-29.md) ; elles ne
doivent pas être prises pour une livraison de l’état courant.
