# DECISIONS — Pokero

Ce fichier trace les choix techniques et les hypothèses, notamment celles qui
complètent le cahier des charges.

## Architecture

- **Monorepo pnpm** : `apps/web`, `apps/api`, `packages/domain`,
  `packages/contracts`. Les paquets `ui`/`config` ne sont pas nécessaires à ce
  stade et ne sont pas créés.
- **TypeScript strict** partout ; la logique métier est isolée dans
  `packages/domain`, sans dépendance à React, Fastify ou Prisma.
- **Pas de microservices.** Un seul déploiement API + un frontend statique.
- Prisma 7 utilise `apps/api/prisma7.config.ts`, le générateur `prisma-client`
  vers `apps/api/generated/prisma` (non commité) et l'adaptateur
  `@prisma/adapter-pg`.

## Déploiement

- Cible : ce VPS Debian 13, derrière le **Caddy hôte** déjà existant.
- Le vhost `pokero.noameunier.fr` proxifie :
  - `/` → `127.0.0.1:8080` (web) ;
  - `/api/*` et `/socket.io/*` → `127.0.0.1:4000` (API).
- PostgreSQL n'est jamais exposé publiquement.
- Le vhost OpenCode n'est pas modifié.
- `docker-compose.prod.yml` orchestre PostgreSQL, une migration one-shot, l'API
  et le web. La migration doit réussir avant le démarrage de l'API.
- L'API et le web sont liés à `127.0.0.1`, en lecture seule, sans capabilities,
  avec `no-new-privileges` et healthchecks.
- Le web de production est un petit serveur Node statique (`apps/web/server.mjs`)
  qui sert la SPA et applique les en-têtes de sécurité, plutôt qu'un serveur
  générique non maîtrisé.
- Les images Docker sont construites depuis les mêmes sources que le
  développement ; aucun secret n'est copié dans les images (`.env` exclu par
  `.dockerignore`).


## Base de données

- PostgreSQL 17 en conteneur, Prisma pour le schéma et les migrations.
- Toutes les valeurs de jetons sont des **entiers** (jamais de flottants).
- Les opérations sur le stock et le chrono sont transactionnelles.
- Les réservations de stock sont explicites et libérées de façon idempotente.

## Authentification

- Sessions opaques stockées en base (hash SHA-256 du token), cookie httpOnly,
  `SameSite=Lax`, `Secure` en production.
- Mot de passe : Argon2id, jamais de cryptographie maison.
- CSRF : vérification d'origine + double-submit token sur les mutations.
- Rate limiting sur l'authentification et les mutations sensibles.
- PIN de tournoi : verrou secondaire facultatif, hash Argon2id, déverrouillage
  limité dans le temps et journalisé. Il ne remplace jamais l'authentification.
- Vérification d'email **désactivée en production** tant qu'aucun SMTP réel
  n'existe ; Mailpit reste réservé au développement local.
- Les liens spectateurs sont des tokens aléatoires dont seul le hash est stocké.
  L'URL n'est affichée qu'une fois, à la création ; la révocation est immédiate
  et les liens révoqués renvoient 404.
- Le seed de démonstration est idempotent et strictement conditionné par
  `SEED_DEMO=true` ; il est désactivé en production.

## Tests

- Tests unitaires du domaine avec Vitest.
- Tests d'intégration API contre une base PostgreSQL dédiée (`pokero_test`),
  avec les vraies migrations et les vrais plugins de sécurité.
- Un scénario Playwright couvre le parcours organisateur complet, du compte à la
  suppression RGPD, en passant par le lien spectateur.
- Les tests de production sont effectués en HTTPS via l'API réelle (cookies
  `Secure`, CSRF, idempotence, conflit de version, révocation) ; aucune
  vérification n'est simulée.

## Chronomètre

- Le serveur est l'autorité unique.
- L'état persiste un **ancre temporelle** (`anchorAt`), le temps restant à
  l'ancrage, l'index de segment, le temps de jeu cumulé et une **version
  monotone**.
- Les traversées de plusieurs niveaux sont calculées à partir des horodatages.
- Les commandes sont idempotentes via une clé d'idempotence unique par tournoi.
- Trois modes de récupération explicites : `CONTINUE_ELAPSED`,
  `LAST_CHECKPOINT`, `LAST_CHECKPOINT_PAUSED`.
- Seuil de proposition de récupération : absence de heartbeat admin > 90 s.
- Une seule décision de récupération par version ; les autres clients reçoivent
  l'état courant.
- Fin de structure : `structureExhausted = true`, le tournoi reste `RUNNING`,
  aucun vainqueur n'est déclaré automatiquement.

## Distribution des caves

- Composition identique pour tous les joueurs.
- Objectif 1 : ne jamais dépasser le stock (réserves déduites).
- Objectif 2 : valeur cible exacte si possible.
- Objectif 3 : écart minimal sinon, affiché explicitement.
- Objectif 4 : petites dénominations utilisables pour les premières blindes.
- Objectif 5 : éviter les caves absurdes (> 60 jetons par défaut).
- Algorithme : DP bornée (PGCD des valeurs, score additif), budget 1,5 s,
  repli glouton documenté au-delà de 250 000 états.

## Blindes

- Profondeur de départ cible : 100 BB.
- Progression géométrique bornée entre +15 % et +60 % par niveau.
- Ante à partir du niveau 5, ≈ 12,5 % de la BB.
- Pause toutes les 4 mains (configurable).
- Les blindes sont arrondies à la plus petite dénomination disponible.
- La durée est une estimation ; la structure peut être prolongée.

## Multi-utilisateurs

- V1 : **un utilisateur = un organisateur** (pas d'organisation multi-membres).
- Un joueur peut participer chez plusieurs organisateurs.
- Les participants invités n'ont pas d'email obligatoire.
- Le rattachement d'une participation à un compte exige une preuve vérifiable et
  une décision de l'organisateur ; il est atomique et audité.

## Données personnelles

- Suppression de compte : révocation de toutes les sessions, suppression des
  PII, anonymisation des participations historiques (« Joueur supprimé »).
- Export des données au format JSON.
- Aucun compte de démonstration activé en production sans `SEED_DEMO=1`.

## Mobile

- Capacitor 8, maximum de code web partagé.
- Android : build debug possible sur ce VPS ; pas d'émulateur (pas de KVM).
- iOS : projet généré, non compilable ici (pas de macOS/Xcode).
- Aucune publication sur les stores ne sera déclarée sans comptes, signature et
  validation des plateformes.

## Choix de versions

Versions majeures récentes (React 19, Vite 8, Fastify 5, Prisma 7, Capacitor 8).
Elles sont pinnées par le lockfile ; toute incompatibilité détectée sera
documentée et corrigée sans désactiver les contrôles de sécurité.
