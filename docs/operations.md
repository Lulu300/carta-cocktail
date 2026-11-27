# Guide d'exploitation

Ce guide décrit l'exploitation de Carta Cocktail v1.19 avec les images publiées (`docker-compose.prod.yml`) : installation, sauvegardes, mises à jour, retour arrière, secrets et HTTPS. Les commandes se lancent depuis le dossier qui contient `docker-compose.prod.yml` et `.env`.

Références :

- [`README.md`](../README.md) : variables d'environnement, dossiers de données et uid, partages réseau, migrations ;
- [`UPGRADING.md`](../UPGRADING.md) : actions obligatoires de chaque version ;
- [GitHub Releases](https://github.com/Lulu300/carta-cocktail/releases) et [`docs/releases/`](releases/) : changements de chaque version.

> **Commandes destructrices.** Les commandes précédées d'un avertissement remplacent ou suppriment des données. Faites d'abord une sauvegarde (voir [Sauvegarde à froid](#sauvegarde-à-froid-des-volumes)), et relisez les noms de volumes et de fichiers avant de valider. N'utilisez jamais `docker compose down -v` sur cette installation : `-v` supprime les volumes, donc la base et les photos.

## Prérequis

- Docker avec Docker Compose v2 (`docker compose version`).
- Un hôte 64 bits : les images existent pour `linux/amd64` et `linux/arm64`, pas pour l'ARM 32 bits.
- `openssl` pour générer le secret, `curl` pour les vérifications.

## Installation

1. Récupérer le fichier compose de la version voulue :

   ```bash
   mkdir carta-cocktail && cd carta-cocktail
   curl -fsSLO https://raw.githubusercontent.com/Lulu300/carta-cocktail/v1.19.0/docker-compose.prod.yml
   ```

2. Épingler la version : dans `docker-compose.prod.yml`, remplacer `:latest` par `:1.19` sur les deux lignes `image:`. `:1.19` suit les correctifs 1.19.x ; `:1.19.0` ne bouge jamais. Avec `:latest`, un `pull` peut installer une version dont vous n'avez pas lu les actions obligatoires.

   ```yaml
   image: ghcr.io/lulu300/carta-cocktail/backend:1.19
   image: ghcr.io/lulu300/carta-cocktail/frontend:1.19
   ```

3. Créer `.env` à côté du fichier compose. `JWT_SECRET` (32 caractères au moins) et `ADMIN_PASSWORD` (12 caractères au moins) sont obligatoires : `docker compose` refuse de démarrer sans `JWT_SECRET`, et le backend refuse un secret trop court ou connu.

   ```bash
   openssl rand -hex 32   # valeur de JWT_SECRET
   ```

   ```bash
   JWT_SECRET=<sortie de openssl rand -hex 32>
   ADMIN_EMAIL=admin@monbar.fr
   ADMIN_PASSWORD=<au moins 12 caractères>
   ```

   `.env` contient les secrets : il est prudent de le réserver à son propriétaire (`chmod 600 .env`). `ADMIN_PASSWORD` ne sert qu'à créer l'admin au premier démarrage ; changez ensuite le mot de passe dans Paramètres > Profil administrateur (Settings > Admin Profile). Les variables facultatives (`SQLITE_WAL`, `TRUST_PROXY`, limites de débit…) se mettent aussi dans `.env` : voir [README › "Environment Variables"](../README.md#environment-variables).

4. Démarrer et attendre que les deux conteneurs soient sains :

   ```bash
   docker compose -f docker-compose.prod.yml up -d --wait
   ```

5. Vérifier :

   ```bash
   curl -s http://localhost/api/health
   ```

   Réponse attendue : `{"status":"ok","version":"1.19.0"}`. Le site répond sur le port 80 de l'hôte. Pour un autre port, changer `"80:8080"` en `"<port>:8080"` dans le service `carta-cocktail-frontend` : nginx écoute sur 8080 dans le conteneur.

Le backend tourne sous l'uid 1000, le frontend (nginx) sous l'uid 101. Les volumes nommés n'ont besoin de rien. Pour des dossiers de l'hôte ou un partage réseau (SMB/NFS) à la place des volumes, voir [README › "Data folders and the node user"](../README.md#data-folders-and-the-node-user) et `SQLITE_WAL=false` dans [README › "Database files and network shares"](../README.md#database-files-and-network-shares).

## Vérifier l'état

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail 50 carta-cocktail-backend
curl -s http://localhost/api/health
```

`/api/health` répond 200 avec la version quand le backend lit la base, 503 sinon. Le healthcheck Docker l'appelle toutes les 30 secondes, et le frontend ne démarre qu'une fois le backend sain.

## Volumes

| Volume | Monté sur | Contenu |
| --- | --- | --- |
| `<projet>_db-data` | `/app/data` | Base SQLite `carta_cocktail.db` (avec `-wal` et `-shm` pendant que le backend tourne), copies `backups/pre-migrate-<date>.db` et `backups/pre-restore-<date>.db` |
| `<projet>_uploads` | `/app/uploads` | Photos des cocktails |

`<projet>` est le nom du projet compose : par défaut, le nom du dossier qui contient le fichier compose. `docker volume ls | grep -E 'db-data|uploads'` affiche les noms exacts.

Ne copiez jamais `carta_cocktail.db` seul pendant que le backend tourne : les dernières écritures peuvent être dans le fichier `-wal`. Arrêtez le backend, ou utilisez l'export de l'admin.

### Sauvegarde à froid des volumes

Copie complète des deux volumes, backend arrêté (le site est indisponible pendant la copie) :

```bash
docker compose -f docker-compose.prod.yml stop carta-cocktail-backend
docker run --rm -v <projet>_db-data:/data -v "$PWD":/backup alpine tar czf /backup/db-$(date +%F).tgz -C /data .
docker run --rm -v <projet>_uploads:/data -v "$PWD":/backup alpine tar czf /backup/uploads-$(date +%F).tgz -C /data .
docker compose -f docker-compose.prod.yml up -d --wait
```

Les archives `db-<date>.tgz` et `uploads-<date>.tgz` sont écrites dans le dossier courant, par root. Copiez-les hors de la machine.

### Restauration à froid des volumes

> **Attention : destructif.** Ces commandes effacent tout le contenu des deux volumes (base, copies `backups/`, photos) avant d'y extraire les archives. Ce qui a été saisi depuis la sauvegarde est perdu.

```bash
docker compose -f docker-compose.prod.yml stop carta-cocktail-backend
docker run --rm -v <projet>_db-data:/data -v "$PWD":/backup alpine sh -c 'tar tzf /backup/db-<date>.tgz >/dev/null && find /data -mindepth 1 -delete && tar xzf /backup/db-<date>.tgz -C /data'
docker run --rm -v <projet>_uploads:/data -v "$PWD":/backup alpine sh -c 'tar tzf /backup/uploads-<date>.tgz >/dev/null && find /data -mindepth 1 -delete && tar xzf /backup/uploads-<date>.tgz -C /data'
```

Chaque commande lit d'abord toute l'archive (`tar tzf`) : si le nom est mal tapé ou l'archive abîmée, elle s'arrête sans rien effacer.

La base revient avec le mot de passe admin et les sessions de la sauvegarde, y compris les sessions révoquées depuis : changez `JWT_SECRET` (voir [Rotation de `JWT_SECRET`](#rotation-de-jwt_secret)) avant de redémarrer avec `docker compose -f docker-compose.prod.yml up -d --wait`.

L'archive restaure les fichiers avec leur propriétaire d'origine (uid 1000). Une sauvegarde faite avant v1.12.0 contient des fichiers de root : donnez-les à l'uid 1000 avant de démarrer, comme dans la [section v1.12.0 d'`UPGRADING.md`](../UPGRADING.md#v1120).

## Sauvegarde et restauration depuis l'admin

Dans Paramètres > Sauvegarde & Restauration (Settings > Backup & Restore) :

- **Exporter la sauvegarde** télécharge un ZIP : une copie cohérente de la base, prise sans arrêter le backend, et toutes les photos. Le backend reste disponible.
- **Restaurer une sauvegarde** remplace la base et les photos par celles du ZIP. Les photos d'une sauvegarde plus ancienne n'ont pas encore leurs copies réduites (WebP pour la carte, JPEG pour les aperçus de liens) : le backend les crée en arrière-plan juste après, et la carte affiche la photo d'origine en attendant.

> **Attention : destructif.** La restauration remplace **toutes** les données actuelles. Le backend garde une copie de la base remplacée dans `/app/data/backups/pre-restore-<date>.db`, mais pas des photos : exportez d'abord une sauvegarde.

- Une restauration termine toutes les sessions, y compris celle qui l'a lancée : reconnectez-vous avec l'email et le mot de passe enregistrés dans la sauvegarde.
- Une sauvegarde dont la base vient d'une version plus récente (migration inconnue de la version installée) est refusée : mettez d'abord l'application à jour. Une sauvegarde d'une version plus ancienne peut demander un redémarrage du backend (quand son schéma est plus ancien ; l'interface l'indique) : voir [UPGRADING › "Restoring a backup from an older version"](../UPGRADING.md#restoring-a-backup-from-an-older-version).
- Le ZIP à restaurer ne doit pas dépasser 200 Mo, cette taille comprise (limite du backend, `MAX_BACKUP_UPLOAD_BYTES` ; nginx accepte jusqu'à 210 Mo pour laisser passer l'enveloppe multipart). L'export et la restauration sont limités à 10 requêtes en 15 minutes.

Les mêmes opérations passent par l'API, avec le jeton de `POST /api/auth/login` : `GET /api/backup/export` et `POST /api/backup/import` (champ multipart `backup`).

### Export automatique par cron

Script à placer sur l'hôte, par exemple `/usr/local/bin/carta-backup.sh`. Il demande `curl` et `jq`.

```sh
#!/bin/sh
# Daily export of Carta Cocktail through the admin API.
set -eu
. /root/.carta-backup.env   # CARTA_URL, CARTA_EMAIL, CARTA_PASSWORD, CARTA_BACKUP_DIR
LOGIN=$(jq -n --arg email "$CARTA_EMAIL" --arg password "$CARTA_PASSWORD" '{email: $email, password: $password}')
TOKEN=$(curl -fsS -X POST -H 'Content-Type: application/json' -d "$LOGIN" "$CARTA_URL/api/auth/login" | jq -r .token)
curl -fsS -H "Authorization: Bearer $TOKEN" -o "$CARTA_BACKUP_DIR/carta-$(date +%F).zip" "$CARTA_URL/api/backup/export"
# Keeps 30 days of exports
find "$CARTA_BACKUP_DIR" -name 'carta-*.zip' -mtime +30 -delete
```

Le fichier `/root/.carta-backup.env` contient les identifiants de l'admin (mieux vaut le réserver à root, `chmod 600`) :

```sh
CARTA_URL=http://localhost
CARTA_EMAIL=admin@monbar.fr
CARTA_PASSWORD='<mot de passe admin>'
CARTA_BACKUP_DIR=/volume1/sauvegardes/carta
```

> **Attention :** la dernière ligne du script supprime les fichiers `carta-*.zip` de plus de 30 jours dans `CARTA_BACKUP_DIR`. Choisissez un dossier réservé à ces exports.

Puis, avec `crontab -e` (root) :

```
30 3 * * * /usr/local/bin/carta-backup.sh
```

Pensez à mettre à jour `CARTA_PASSWORD` quand vous changez le mot de passe admin : chaque échec de connexion compte dans la limite de `LOGIN_RATE_LIMIT` (10 échecs en 15 minutes par adresse) ; au-delà, toute connexion venant de la même adresse est refusée pendant 15 minutes au plus.

## Mise à jour

1. Lire les sections d'[`UPGRADING.md`](../UPGRADING.md) de toutes les versions entre la vôtre et la nouvelle, et faire leurs actions « Before upgrading ». Ce guide ne les recopie pas.
2. Sauvegarder : export depuis l'admin, ou [sauvegarde à froid](#sauvegarde-à-froid-des-volumes).
3. Changer le tag des deux lignes `image:` de `docker-compose.prod.yml` (par exemple `:1.18` → `:1.19`). Avec un tag `:X.Y`, les correctifs de la même mineure arrivent par un simple `pull`. Si la version demande un nouveau fichier compose, téléchargez celui de son tag et remettez-y vos modifications (port, volumes). Les variables facultatives (`SQLITE_WAL`, `TRUST_PROXY`, limites de débit…) restent dans `.env` : si vous les aviez ajoutées à la liste `environment` d'un fichier compose de la v1.15.0 ou plus ancien, mettez-les dans `.env` au lieu de les remettre dans le nouveau fichier.
4. Télécharger et redémarrer :

   ```bash
   docker compose -f docker-compose.prod.yml pull
   docker compose -f docker-compose.prod.yml up -d --wait
   ```

5. Vérifier la version : `curl -s http://localhost/api/health`. Puis faire les actions « After upgrading » d'`UPGRADING.md`.

**Rappel dans l'administration.** Après une mise à jour, le backend écrit dans son journal les actions obligatoires des versions sautées, lues dans les notes de version embarquées dans l'image (une ligne par action, avec sa version et « before » ou « after »). L'administration les affiche dans un bandeau, sur toutes les pages, jusqu'au clic sur « J'ai fait ces actions ». Les actions « before » s'y trouvent aussi, à vérifier après coup : elles devaient être faites avant de lancer la nouvelle version. `UPGRADING.md` reste la référence. Le bandeau n'apparaît qu'à partir de la mise à jour qui suit la première version qui l'embarque : avant, la version précédente n'était pas enregistrée. Une version de développement (`dev`) n'enregistre rien et n'affiche rien.

**Copie avant migration.** Au démarrage, quand la nouvelle image apporte une migration de la base, le backend copie d'abord la base dans `/app/data/backups/pre-migrate-<date>.db` (le journal affiche `Database backed up to …`, ou `Database unchanged since backup …` quand la base n'a pas changé depuis la copie précédente, qui sert alors), puis applique la migration (`Applying migration …`). Il garde les 10 copies les plus récentes. Cette copie ne contient pas les photos : elle sert au [retour arrière](#retour-arrière). Si une migration échoue, le backend refuse de démarrer et nomme la copie à restaurer : suivez [README › "Recovering from a failed migration"](../README.md#recovering-from-a-failed-migration).

Pour lister les copies (la plus récente en dernier ; le dossier n'existe pas tant qu'aucune copie n'a été faite) :

```bash
docker compose -f docker-compose.prod.yml run --rm --no-deps --entrypoint ls carta-cocktail-backend -l /app/data/backups/
```

## Retour arrière

1. **Avant de changer d'image**, regarder dans le journal du backend si la mise à jour a appliqué une migration. Ce journal disparaît quand le conteneur est recréé, donc par le changement de tag :

   ```bash
   docker compose -f docker-compose.prod.yml logs carta-cocktail-backend | grep -E 'Applying migration|Database backed up|Database unchanged'
   ```

   - Aucune ligne (le journal affiche `No pending migrations to apply.`) : la base n'a pas changé, passer à l'étape 3.
   - `Applying migration …` : une migration a tourné. La copie à restaurer est celle que nomme `Database backed up to …`, ou `Database unchanged since backup …` quand la base n'avait pas changé depuis la copie précédente. La liste des copies (commande de [Mise à jour](#mise-à-jour)) permet de vérifier son nom.

   Le journal ne couvre que le conteneur actuel : si le backend a été recréé depuis la mise à jour (changement de `.env`, par exemple), il ne le dit plus. Comparez alors le dossier `backend/prisma/migrations/` des deux versions sur GitHub (`https://github.com/Lulu300/carta-cocktail/tree/v<version>/backend/prisma/migrations`) : un dossier présent seulement dans la nouvelle version est une migration qui a tourné.

2. Si une migration a tourné, restaurer la copie avec la nouvelle image encore en place.

   > **Attention : destructif.** La copie remplace la base actuelle : tout ce qui a été saisi depuis la mise à jour est perdu.

   ```bash
   docker compose -f docker-compose.prod.yml stop carta-cocktail-backend
   docker compose -f docker-compose.prod.yml run --rm --no-deps --entrypoint sh carta-cocktail-backend -c '
     B=/app/data/backups/pre-migrate-<date>.db
     cp "$B" /app/data/carta_cocktail.db
     rm -f /app/data/carta_cocktail.db-wal /app/data/carta_cocktail.db-shm
     if [ -f "$B-wal" ]; then cp "$B-wal" /app/data/carta_cocktail.db-wal; fi'
   ```

   La copie revient avec ses sessions : changez `JWT_SECRET` (voir [Rotation de `JWT_SECRET`](#rotation-de-jwt_secret)) avant l'étape 3.

3. Remettre le tag précédent sur les deux lignes `image:`, puis :

   ```bash
   docker compose -f docker-compose.prod.yml up -d --wait
   ```

Revenir à une version v1.11.x ou plus ancienne demande aussi son propre fichier compose (pas de `/api/health`, démarrage en root, port 80 jusqu'à v1.7.0) : voir [README › "Running a previous version"](../README.md#running-a-previous-version).

## Mot de passe admin perdu

1. Dans `.env`, ajouter `ADMIN_RESET_PASSWORD=true` (exactement `true`) et mettre le nouveau mot de passe dans `ADMIN_PASSWORD` (12 caractères au moins). `ADMIN_EMAIL` devient l'email de connexion : vérifiez sa valeur, `admin@carta.local` par défaut.
2. Redémarrer : `docker compose -f docker-compose.prod.yml up -d --wait`. Le journal du backend affiche `Admin credentials reset from environment (login email: …)` :

   ```bash
   docker compose -f docker-compose.prod.yml logs carta-cocktail-backend | grep 'Admin credentials reset'
   ```

3. Retirer `ADMIN_RESET_PASSWORD` de `.env` et redémarrer encore (`up -d --wait`) : sinon chaque redémarrage réinitialise le mot de passe.

## Rotation de `JWT_SECRET`

`JWT_SECRET` signe les sessions de l'admin. Le changer déconnecte toutes les sessions ouvertes, sur tous les appareils ; les données ne changent pas. À faire si le secret a fuité, et après avoir remis une base à la main (restauration à froid, copie `pre-migrate` ou `pre-restore`).

1. Générer un nouveau secret : `openssl rand -hex 32`.
2. Remplacer la valeur de `JWT_SECRET` dans `.env`.
3. Recréer le backend : `docker compose -f docker-compose.prod.yml up -d --wait`.
4. Se reconnecter dans l'admin.

## HTTPS

Le conteneur frontend sert du HTTP. Pour HTTPS, placez un reverse proxy devant lui (Caddy, Traefik, SWAG…) qui termine TLS :

- **Proxy sur l'hôte** (Caddy, nginx) : publiez le frontend sur l'adresse de bouclage seulement, pour que personne ne contourne le proxy, et sur un port libre (le proxy prend 80 et 443). Dans `docker-compose.prod.yml`, remplacez `"80:8080"` par `"127.0.0.1:8080:8080"`, puis `docker compose -f docker-compose.prod.yml up -d --wait`.
- **Proxy dans Docker** (Traefik, SWAG) : branchez le proxy sur le réseau du projet compose et visez le conteneur `carta-cocktail-frontend`, port **8080** (le seul port que déclare l'image, détecté seul par Traefik). Retirez alors la section `ports` du frontend.

Exemple de `Caddyfile` pour un Caddy installé sur l'hôte (certificat obtenu automatiquement) :

```
carte.monbar.fr {
    reverse_proxy 127.0.0.1:8080
    header Strict-Transport-Security "max-age=31536000"
}
```

- **En-têtes `X-Forwarded-*`** : le proxy doit transmettre `X-Forwarded-For` (Caddy, Traefik et SWAG le font par défaut). L'API s'en sert pour compter les limites de débit par client. Un proxy sur l'hôte ou sur un réseau privé n'a besoin d'aucun réglage ; dans les autres cas (Docker rootless, Podman, Docker Desktop…), voir `TRUST_PROXY` dans [README › "Login limit behind a reverse proxy"](../README.md#login-limit-behind-a-reverse-proxy).
- **Aperçus de liens** : renseignez `PUBLIC_BASE_URL=https://carte.monbar.fr` dans `.env`, puis recréez le backend. Les aperçus d'une carte partagée dans une messagerie (titre, description, photo) ont besoin d'adresses absolues, et derrière le proxy le backend ne voit que `http`.
- **HSTS** s'active sur le proxy, ou dans le conteneur (ligne `Strict-Transport-Security` en commentaire de `frontend/security-headers.conf`) une fois HTTPS en place devant lui, jamais quand le site est servi en HTTP. Une fois activé, les navigateurs refusent le HTTP pour ce domaine pendant toute la durée de `max-age` : activez-le quand HTTPS fonctionne.
- Ne publiez pas le port 3001 du backend : nginx l'atteint par le réseau compose (`docker-compose.prod.yml` ne le publie pas).
- Le reverse proxy ne doit pas mettre en cache `/sw.js` : il transmet tel quel son `Cache-Control: no-cache` (voir [Carte hors ligne](#carte-hors-ligne-et-installation)).

## Carte hors ligne et installation

Le frontend installe un service worker (`/sw.js`) dans le navigateur des invités. Une fois la carte ouverte, elle se rouvre sans réseau : l'application publique, les cartes et les fiches cocktail déjà consultées, et leurs photos. Elle s'installe aussi sur l'écran d'accueil (« Ajouter à l'écran d'accueil »), avec l'icône de l'application.

- **HTTPS obligatoire.** Les navigateurs n'activent un service worker qu'en HTTPS, ou sur `localhost`. Une instance servie en HTTP sur une adresse du réseau local (`http://192.168.1.10`) fonctionne comme avant, sans mode hors ligne ni installation : voir [HTTPS](#https).
- **Données à jour.** Les réponses de `/api/public/` viennent du réseau quand il répond en moins de 3 secondes, du cache sinon. Aucune autre route `/api/` n'est gardée, et l'admin connecté lit toujours le serveur : ses requêtes portent son jeton, que le service worker laisse passer sans les garder. Les pages `/admin` et `/login` se chargent toujours depuis le serveur.
- **Mise à jour.** Après une mise à jour de l'instance, le navigateur trouve le nouveau `/sw.js` au chargement suivant d'une page : le nouveau service worker prend la main, dans tous les onglets du site. Une page publique se recharge d'elle-même sur la nouvelle version. Une page de l'admin ou de connexion ne se recharge pas, pour ne pas perdre une saisie en cours : elle affiche « Une nouvelle version est disponible » avec un bouton « Recharger ». nginx sert `/sw.js` avec `Cache-Control: no-cache` pour qu'aucun cache ne garde l'ancien.

### Désinscrire un service worker bloqué

Si un navigateur reste sur une ancienne version ou affiche une page cassée que le rechargement ne corrige pas :

1. Vérifier que le serveur sert la bonne version : `curl -sI http://localhost/sw.js` répond `200` avec `Cache-Control: no-cache`. Un reverse proxy ou un CDN qui le met en cache bloque la mise à jour pour tous les invités : corrigez sa configuration, puis rechargez la page.
2. Sur le navigateur concerné, effacer les données du site, ce qui désinscrit le service worker et vide ses caches :
   - **Chrome, Edge (ordinateur)** : outils de développement (F12) > Application > Storage > « Clear site data ». Ou `chrome://serviceworker-internals` > « Unregister » sur la ligne du site ;
   - **Firefox** : `about:serviceworkers` > « Unregister », puis Paramètres > Vie privée et sécurité > Cookies et données de sites > Gérer les données > supprimer le site ;
   - **Chrome Android** : Paramètres > Paramètres des sites > Tous les sites > le site > « Effacer et réinitialiser » ;
   - **Safari iOS et iPadOS** : Réglages > Apps > Safari > Avancé > Données de sites web > supprimer le site (sur iOS 17 et plus ancien : Réglages > Safari > Avancé). Une carte ajoutée à l'écran d'accueil garde ses propres données : supprimez l'icône, puis ajoutez-la de nouveau.
3. Recharger la page : elle vient du serveur, et un nouveau service worker s'installe.

Depuis la console du navigateur (F12 > Console, sur une page du site), ces deux lignes font la même chose que l'étape 2 :

```js
navigator.serviceWorker.getRegistrations().then((list) => list.forEach((r) => r.unregister()));
caches.keys().then((names) => names.forEach((name) => caches.delete(name)));
```

## Intégrer la carte dans le site du bar

Par défaut, aucun site ne peut afficher la carte dans une iframe. Admin > Paramètres > « Intégrer la carte dans un site » liste les sites autorisés, une adresse par ligne (`https://www.mon-bar.fr`, sans chemin ; `http://` est refusé, sauf pour `localhost` et `127.0.0.1`), et donne le code `<iframe>` à coller dans le site.

- Seules les pages `/menu/…` deviennent intégrables. La liste des cartes (`/`), la connexion, l'admin, l'API et les photos gardent `frame-ancestors 'none'` et `X-Frame-Options: DENY`. Dans le cadre, le lien « Connexion » ouvre la fenêtre entière.
- nginx demande la liste au backend à chaque chargement d'une page `/menu/` : un changement s'applique au chargement suivant, sans redémarrage. Si le backend ne répond pas dans les 3 secondes, la page reste servie, mais non intégrable.
- La liste est enregistrée dans la base : une restauration ramène celle de la sauvegarde, et une sauvegarde faite avant cette fonction ramène une liste vide (ressaisissez alors les sites).
- Un site en HTTPS ne peut intégrer qu'une instance servie elle aussi en HTTPS : les navigateurs bloquent un cadre en HTTP.
- Le reverse proxy ne doit pas ajouter son propre `X-Frame-Options` ou `Content-Security-Policy` (SWAG : lignes `add_header X-Frame-Options` de `ssl.conf`, en commentaire par défaut) : il bloquerait le cadre quoi que dise la liste.
- Vérifier : `curl -sI https://carte.mon-bar.fr/menu/<slug> | grep -i -e frame-ancestors -e x-frame-options` montre `frame-ancestors 'self' https://www.mon-bar.fr` et aucun `X-Frame-Options`.

## Mise à jour depuis une ancienne version

Si l'instance a sauté plusieurs versions, appliquez dans l'ordre les sections d'[`UPGRADING.md`](../UPGRADING.md) de chaque version sautée (récupération des photos de v1.5.0, droits des volumes de v1.12.0, port 8080 du frontend, port 3001 non publié…). `UPGRADING.md` et les notes de version font référence : ce guide ne les recopie pas.
