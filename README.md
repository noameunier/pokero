# Pokero

Gestion de tournois de poker pour organisateurs : caves, blindes, chronomètre
serveur, classements, statistiques et liens spectateurs.

Production : <https://pokero.noameunier.fr>

## Stack

| Couche | Technologies |
|---|---|
| Web | React 19, Vite 8, TypeScript, Tailwind 4, TanStack Query, React Router, i18next, PWA |
| API | Fastify 5, TypeScript, Zod, Socket.IO, Prisma 7, PostgreSQL 17 |
| Domaine | `packages/domain`, TypeScript pur, testé avec Vitest |
| Mobile | Capacitor 8 (phase ultérieure) |
| Infra | pnpm workspaces, Docker Compose, Caddy hôte |

## Structure

```
apps/
  api/        API Fastify, Prisma, migrations, seed, tests d'intégration
  web/        SPA React, serveur statique de production, tests Playwright
packages/
  contracts/  Schémas Zod et types partagés
  domain/     Logique métier sans dépendance framework
infra/
  bootstrap/  Scripts d'installation du VPS
  docker/     Dockerfiles, compose de développement, sauvegarde
docker-compose.prod.yml
```

## Développement local

Prérequis : Node 24, pnpm 12, Docker.

```bash
# Dépendances
pnpm install

# Base PostgreSQL + Mailpit (dev)
docker compose -f infra/docker/docker-compose.dev.yml up -d

# Configuration API
cp apps/api/.env.example apps/api/.env
# Adapter DATABASE_URL si nécessaire (port 5433 en dev)

# Schéma + données de démonstration
pnpm --filter @pokero/api db:generate
pnpm --filter @pokero/api db:migrate
SEED_DEMO=true pnpm --filter @pokero/api db:seed

# API (4000) + web (5173)
pnpm dev
```

Compte de démonstration (dev uniquement) : `demo@pokero.local` /
`PokeroDemo2026!`.

Variables principales de `apps/api/.env` :

- `DATABASE_URL`
- `SESSION_SECRET`, `TOKEN_PEPPER`, `PIN_PEPPER` (32+ caractères)
- `APP_BASE_URL`, `COOKIE_SECURE`
- `EMAIL_VERIFICATION_REQUIRED` (false en dev sans SMTP)
- `SMTP_*` (Mailpit local : `127.0.0.1:1025`)
- `SEED_DEMO`

## Tests

```bash
pnpm --filter @pokero/domain test       # 47 tests unitaires
pnpm --filter @pokero/api test          # 28 tests d'intégration (base pokero_test)
pnpm --filter @pokero/web test:e2e      # scénario Playwright complet
pnpm typecheck                          # tous les paquets
pnpm build                              # API + web
```

Les tests d'intégration utilisent une base PostgreSQL dédiée. Les tests E2E
lancent l'API et Vite automatiquement si `E2E_BASE_URL` n'est pas défini.

## Production

Le déploiement utilise le Caddy de l'hôte :

- `/` → `127.0.0.1:8080` (web)
- `/api/*` et `/socket.io/*` → `127.0.0.1:4000` (API)
- PostgreSQL n'est jamais exposé publiquement.

### Configuration

```bash
cp .env.example .env
# Renseigner POSTGRES_PASSWORD et les trois secrets (openssl rand -hex 32)
```

Points importants :

- `COOKIE_SECURE=true` derrière HTTPS.
- `EMAIL_VERIFICATION_REQUIRED=false` tant qu'aucun SMTP réel n'est configuré.
- `SEED_DEMO=false` en production.
- `.env` n'est jamais commité ni copié dans les images.

### Déploiement / mise à jour

```bash
sg docker -c 'docker compose -f docker-compose.prod.yml build'
sg docker -c 'docker compose -f docker-compose.prod.yml up -d'
sg docker -c 'docker compose -f docker-compose.prod.yml ps'
```

La migration Prisma s'exécute dans un service one-shot avant le démarrage de
l'API. Les healthchecks empêchent le web de démarrer si l'API est indisponible.

### Sauvegarde

```bash
./infra/docker/backup.sh
# Personnalisation :
BACKUP_DIR=/var/backups/pokero RETENTION_DAYS=30 ./infra/docker/backup.sh
```

Le script produit une archive `pokero-<UTC>.sql.gz`, vérifie son intégrité et
applique la rétention. Restauration :

```bash
gunzip -c backups/pokero-<UTC>.sql.gz | \
  sg docker -c 'docker compose -f docker-compose.prod.yml exec -T db psql -U pokero -d pokero'
```

⚠️ La restauration remplace les données existantes. Toujours tester sur une base
temporaire avant d'agir en production.

## Sécurité

- Mots de passe Argon2id, sessions opaques en base, cookie httpOnly `SameSite=Lax`
  `Secure`, CSRF double-submit + contrôle d'origine.
- Rate limiting sur l'authentification.
- Isolation stricte des ressources par organisateur.
- PIN de tournoi facultatif (verrou secondaire, jamais un substitut à
  l'authentification).
- Liens spectateurs révocables : seul le hash du token est stocké.
- Export RGPD JSON et suppression de compte avec anonymisation des participations.
- Conteneurs API/web en lecture seule, sans capabilities, avec
  `no-new-privileges`.
- CSP et en-têtes de sécurité appliqués par le serveur web et Caddy.

## Limites connues

- Vérification d'email désactivée en production faute de SMTP réel.
- Application mobile Capacitor non commencée ; aucune publication sur les stores
  n'est revendiquée.
- Bundle web principal ≈ 560 kB (découpage à prévoir).
- Avertissement de dépréciation `pg` dans la pile Prisma (sans impact observé).
- Pas de sauvegarde planifiée ni de supervision externe pour l'instant.
