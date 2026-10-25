# PROGRESS · Pokero

Dernière mise à jour : 2026-10-25 12:30 UTC

## Statut global

**Application web déployée en production** sur <https://pokero.noameunier.fr>.

Le parcours organisateur complet fonctionne de bout en bout : compte, mallettes de
jetons, presets, création de tournoi, joueurs, caves/rebuys/add-ons, chronomètre
serveur, éliminations, classement, clôture, liens spectateurs révocables,
statistiques et suppression de compte RGPD.

La refonte UI/UX est terminée, fusionnée sur `main` et **déployée en
production** le 25 octobre 2026. Elle a été validée en local (typecheck, build,
76 tests unitaires/intégration, 5 scénarios E2E, captures avant/après) puis
vérifiée en HTTPS (santé, thème, polices, absence d'erreur console).

L'application mobile Capacitor reste à faire (phase P9). Aucun test sur appareil
réel, aucune compilation iOS et aucune publication sur les stores ne sont
revendiqués.

## Phases

| Phase | Statut | Détail |
|---|---|---|
| P0 · Préparation | ✅ Terminé | Environnement vérifié, DNS + TLS + vhost Caddy opérationnels |
| P1 · Bootstrap | ✅ Terminé | Monorepo pnpm, TypeScript strict, domaine métier testé |
| P2 · Comptes & sécurité | ✅ Terminé | Auth Argon2id, sessions opaques, CSRF, rate limiting, PIN tournoi |
| P3 · Domaine persistant | ✅ Terminé | Prisma 7, mallettes, inventaire, presets, réservations |
| P4 · Tournois & chrono | ✅ Terminé | API tournois, Socket.IO, heartbeat, 3 modes de reprise |
| P5 · Interface web | ✅ Terminé | 12 pages, PWA, i18n FR + EN, console + projection + spectateur |
| P6 · Tests E2E | ✅ Terminé | Scénario Playwright complet A→L vert |
| P7 · Déploiement | ✅ Terminé | Compose, migrations one-shot, HTTPS, redémarrages vérifiés |
| P8 · Qualité & docs | ✅ Terminé | RGPD, seed, docs, tests production, en-têtes de sécurité |
| P9 · Mobile | ⏳ À faire | Capacitor Android/iOS (hors V1 web) |
| P10 · Livraison | 🔄 En cours | Rapport final, sauvegardes, supervision |
| P11 · Refonte UI/UX | ✅ Déployé | Design system, tous les écrans, mobile, accessibilité, captures |

## Réalisé

### Domaine (`packages/domain`)

- Distribution des caves : programmation dynamique bornée, objectif exact puis
  meilleure approximation, contraintes de stock et de réserves, repli glouton.
- Règle « Même nombre de jetons » (`resolveCommonCounts`).
- Résumé de cave manuelle (`summarizeBuyIn`).
- Générateur de blindes : progression géométrique, pauses, antes, arrondis,
  prolongation, trois presets (Express / Classique / Deepstack).
- Moteur de chrono : état serveur, traversée de plusieurs niveaux, pauses
  manuelles et programmées, ajout/retrait de temps, trois modes de récupération,
  structure épuisée sans vainqueur automatique.
- Classement final et statistiques joueur multi-organisateurs.
- **47 tests unitaires verts**, `tsc --noEmit` vert.

### Contrats (`packages/contracts`)

- Schémas Zod partagés pour auth, mallettes, presets, tournois, participants,
  caves/rebuys/add-ons, éliminations, commandes de chrono, PIN, spectateurs,
  export/suppression RGPD.
- Types TypeScript dérivés utilisés par l'API et le web.

### API (`apps/api`)

- Fastify 5, Prisma 7 (`prisma-client` + adaptateur `@prisma/adapter-pg`).
- PostgreSQL 17, migration initiale `20261025025438_init`.
- Auth : Argon2id, sessions opaques en base (hash SHA-256 + pepper), cookie
  httpOnly `SameSite=Lax` `Secure`, CSRF double-submit + contrôle d'origine,
  rate limiting, vérification d'email (désactivée en prod faute de SMTP réel).
- Isolation stricte par organisateur sur toutes les ressources.
- Mallettes et inventaire : stock, réservations, ajustements, archivage.
- Presets versionnés.
- Tournois : création assistée, joueurs, caves, rebuys, add-ons, éliminations,
  annulation d'élimination, clôture, classement final.
- Chronomètre : autorité serveur, version monotone, idempotence, auto-avance,
  heartbeat, trois modes de récupération, PIN secondaire facultatif.
- Temps réel Socket.IO + planificateur de chrono toutes les secondes.
- Liens spectateurs révocables : token aléatoire, seul le hash est stocké, URL
  affichée une seule fois à la création.
- Statistiques personnelles et profils publics opt-in.
- RGPD : export JSON complet, suppression avec anonymisation des participations.
- **29 tests d'intégration verts**, `tsc --noEmit` vert.

### Web (`apps/web`)

- React 19 + Vite 8 + Tailwind 4 + TanStack Query + React Router.
- Pages : connexion, inscription, mot de passe oublié/réinitialisation, tableau de
  bord, mallettes (liste + éditeur), presets (liste + éditeur), assistant de
  création de tournoi en 4 étapes, console organisateur, projection plein écran,
  spectateur public, statistiques, compte.
- PWA (manifest, service worker, icônes), i18n français + anglais.
- Client API typé, gestion CSRF, toasts, états de chargement/erreur.
- Serveur statique Node de production (`apps/web/server.mjs`) avec CSP, HSTS via
  Caddy, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`.
- `tsc --noEmit` vert et build Vite vert.

### Refonte UI/UX (branche `redesign/ui-ux`)

- Audit initial dans `UI_AUDIT.md`, système de design dans `DESIGN_SYSTEM.md`,
  rapport de tests dans `TEST_REPORT.md`.
- Tokens centralisés (anthracite, vert feutrine, or, ivoire), polices
  auto-hébergées Manrope + Instrument Serif.
- Bibliothèque `ui.tsx` refondue : boutons, champs, cartes, badges, onglets,
  switch, modales accessibles, états vide/erreur/chargement.
- Toutes les pages refondues, sans changement d'API ni de schéma de données.
- Navigation mobile à 5 entrées avec action « Créer » surélevée, cibles
  tactiles ≥ 44 px, zones sûres iOS, champs à 16 px.
- `ChipCountEditor` partagé pour « Même nombre de jetons », avec total
  nécessaire et alerte de stock.
- Contrastes mesurés ≥ 4,71:1 pour le texte courant ; suppression des 183
  classes de texte à opacité de la V1.
- Captures avant/après dans `docs/ui/` (mobile, tablette, desktop + états).
- Aucun test sur appareil iOS/Android réel.

### Seed de démonstration (`apps/api/prisma/seed.ts`)

- Idempotent, activé uniquement par `SEED_DEMO=true`.
- Crée un compte démo, une mallette à 6 valeurs, un preset 3 h, un tournoi
  terminé, un tournoi en cours et un brouillon.
- Identifiants de dev : `demo@pokero.local` / `PokeroDemo2026!`.
- Désactivé en production (`SEED_DEMO=false`).

### Tests E2E (`apps/web/e2e/tournament.spec.ts`)

- Playwright/Chromium, parcours organisateur complet :
  inscription → mallette → tournoi → joueurs → démarrage du chrono → éliminations
  → clôture → lien spectateur valide → lien invalide → suppression de compte.
- **5/5 scénarios verts** avec API et Vite lancés par Playwright : parcours
  organisateur complet, saisie mobile, quantité commune de jetons, aperçu local
  de cave et enregistrement depuis le bas de la page, valeur de cave réalisable.

### Déploiement

- `docker-compose.prod.yml` : PostgreSQL, migration one-shot, API, web.
- API et web liés à `127.0.0.1` uniquement ; PostgreSQL non exposé.
- Conteneurs API/web en lecture seule, `cap_drop: ALL`,
  `no-new-privileges`, healthchecks, logs JSON plafonnés.
- Images : `infra/docker/api.Dockerfile`, `infra/docker/web.Dockerfile`.
- HTTPS via le Caddy hôte existant ; `opencode.noameunier.fr` intact.
- Migrations appliquées automatiquement avant le démarrage de l'API.

## Vérifications exécutées

| Commande / contrôle | Résultat |
|---|---|
| `pnpm --filter @pokero/domain test` | 47/47 ✅ |
| `pnpm --filter @pokero/domain typecheck` | ✅ |
| `pnpm --filter @pokero/contracts typecheck` | ✅ |
| `pnpm --filter @pokero/api test` | 29/29 ✅ |
| `pnpm --filter @pokero/api typecheck` | ✅ |
| `pnpm --filter @pokero/web typecheck` | ✅ |
| `pnpm --filter @pokero/web build` | ✅ |
| `pnpm --filter @pokero/web test:e2e` | 5/5 ✅ |
| Refonte en production (HTTPS, thème, polices, console) | ✅ |
| Captures Playwright avant/après | 59 avant, 135 après + 5 états ✅ |
| Débordement horizontal (320 px, 13 routes) | 0 ✅ |
| Smoke test HTTPS production (compte, mallette, tournoi, chrono, CSRF, idempotence, conflit de version, spectateur, révocation, suppression) | ✅ |
| Redémarrage `docker compose restart api web` | API healthy en 2 s, session et données persistées ✅ |
| `./infra/docker/backup.sh` + restauration dans une base temporaire | Archive valide, 3 tables contrôlées ✅ |
| `https://pokero.noameunier.fr/` | 200 ✅ |
| `https://pokero.noameunier.fr/api/auth/me` | 200 ✅ |
| `https://pokero.noameunier.fr/api/health` | 200 ✅ |
| `https://opencode.noameunier.fr/` | 200 ✅ |

## Avertissements connus (non bloquants)

- `pg` signale un `client.query()` concurrent (avertissement de dépréciation
  provenant de la pile Prisma/adaptateur) ; aucune erreur fonctionnelle observée.
- Bundle web principal ≈ 623 kB minifié (≈ 176 kB gzip) : découpage de code à
  prévoir.
- Images Docker volumineuses (API ≈ 766 Mo, migrate ≈ 1,1 Go) : optimisation
  possible en séparant les dépendances de build et de migration.
- La vérification d'email est désactivée en production tant qu'aucun SMTP réel
  n'est configuré.
- La sauvegarde est manuelle ; aucun timer systemd/cron n'est encore installé.

## Prochaines étapes

1. Ajouter une sauvegarde PostgreSQL planifiée et tester une restauration.
2. Mettre en place une supervision (uptime, logs, alertes).
3. Découper le bundle web et optimiser les images Docker.
4. Ajouter un vrai SMTP puis activer `EMAIL_VERIFICATION_REQUIRED=true`.
5. Démarrer la phase mobile Capacitor (Android debug puis iOS sur macOS).
6. Compléter les tests E2E (reprise après coupure, PIN, multi-organisateurs,
   statistiques publiques, export RGPD).

## Blocages

Aucun blocage technique pour la V1 web.

Reste à faire côté humain (non bloquant pour la V1) : SMTP de production, comptes
Apple/Google, machine macOS pour iOS, tests sur appareils réels.
