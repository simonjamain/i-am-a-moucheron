# Construire et exécuter avec Docker

Le `Dockerfile` construit l'image du serveur Node/UDP. Publication automatique depuis
`main` : [déploiement](operations.md#déploiement).

## Construction et démarrage

Depuis la racine du dépôt, avec l'historique Git complet :

```sh
node scripts/build-info.ts   # VERSION et nouveautés : Docker n'a pas accès à .git
docker build -t i-am-a-moucheron:local .
docker run -d --name i-am-a-moucheron --restart unless-stopped --init \
  --read-only --tmpfs /tmp:size=16m,mode=1777 --cap-drop ALL \
  --security-opt no-new-privileges \
  -e UDP_ADVERTISE_ADDRESS=ADRESSE_IP_PUBLIQUE \
  -p 127.0.0.1:3000:3000/tcp -p 41000-41099:41000-41099/udp \
  i-am-a-moucheron:local
curl http://127.0.0.1:3000/healthz
```

- `ADRESSE_IP_PUBLIQUE` : adresse réelle de la VM. La plage `41000–41099/UDP` est
  publiée sans changement de numéros et ouverte dans les pare-feu de la VM et de
  l'hébergeur. HTTP peut passer par un proxy HTTPS ; l'UDP de jeu, non.
- Réseau d'entreprise n'autorisant que des ports connus : publier un seul port partagé
  (`-e UDP_MUX_PORT=41000 -e UDP_ADVERTISE_PORT=3478 -p 3478:41000/udp`) ;
  `UDP_ADVERTISE_PORT` égale le port publié côté hôte
  ([port UDP unique](udp-server.md#port-udp-unique-réseaux-dentreprise)).
- [Statistiques](stats.md) persistantes : monter un volume inscriptible par l'utilisateur
  `node` et définir `STATS_FILE` (`-v moucheron-stats:/stats -e STATS_FILE=/stats/stats.json`).
- `/healthz` valide HTTP, pas l'UDP : vérifier l'UDP avec deux joueurs sur des réseaux
  distincts. Autres variables : [serveur UDP](udp-server.md).

`compose.yaml` et `compose.traefik.yaml` référencent l'ancien tag local
`i-am-a-moucheron:2026.10.29-udp.2`, qui n'est plus produit : utiliser les commandes
ci-dessus ou l'image GHCR `latest`.

## Contrôle de contribution

Chaque contribution construit l'image avec la commande ci-dessus et rapporte résultat et
commit testé dans la PR ; si Docker manque localement, le signaler et attendre le
contrôle **Docker build** de la PR (`docker-build.yml`). Ce contrôle tourne sur toutes
les PR et groupes de fusion, documentaires compris, sans publier ni utiliser de secret :
il construit l'image `linux/amd64`, la démarre et vérifie `/healthz` et le 410 de
`/api/join` (sans tester l'UDP). Sur `main`, seul `docker.yml` reconstruit et publie.

Le caractère obligatoire de **Docker build** avant fusion dépend de la protection de
`main` (ruleset GitHub), réglée par un administrateur et non lisible depuis une
contribution ; un workflow seul ne rend pas un contrôle obligatoire. Si la fusion est
bloquée, laisser la PR ouverte.

## Outil de modèles GLB

L'image de développement Meshy est distincte de celle du serveur et ne tourne pas sur le
VPS : [pipeline d'assets](asset-pipeline.md).
