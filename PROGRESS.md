# PROGRESS — Pokero

Dernière mise à jour : 2026-10-25

## Statut global

**Phase 1 (bootstrap) — en cours.**

Le socle de domaine métier est implémenté et testé. L'API, la base de données,
l'interface web et le déploiement restent à construire.

## Phases

| Phase | Statut | Détail |
|---|---|---|
| P0 — Préparation | ✅ Terminé | Environnement vérifié, DNS + TLS + vhost Caddy opérationnels |
| P1 — Bootstrap | 🔄 En cours | Monorepo pnpm, TypeScript, domaine métier testé |
| P2 — Comptes & sécurité | ⏳ À faire | Auth, sessions, rôles, admin |
| P3 — Domaine persistant | ⏳ À faire | Prisma, mallettes, inventaire, presets |
| P4 — Tournois & chrono | ⏳ À faire | API tournois, Socket.IO, reprise |
| P5 — Interface web | ⏳ À faire | 20 écrans, PWA, i18n |
| P6 — Tests E2E | ⏳ À faire | Scénarios A→L |
| P7 — Déploiement | ⏳ À faire | Compose, migrations, sauvegardes |
| P8 — Qualité & docs | ⏳ À faire | Perf, sécurité, RGPD, docs |
| P9 — Mobile | ⏳ À faire | Capacitor Android/iOS |
| P10 — Livraison | ⏳ À faire | Rapport final |

## Réalisé

### P1 — domaine (`packages/domain`)

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

## Tests exécutés

| Commande | Résultat |
|---|---|
| `pnpm --filter @pokero/domain test` | 47/47 ✅ |
| `pnpm --filter @pokero/domain typecheck` | ✅ |

## Prochaines étapes

1. `packages/contracts` (schémas Zod partagés).
2. API Fastify + Prisma + PostgreSQL + migrations.
3. Auth, sessions, isolation multi-organisateurs.
4. API tournois + Socket.IO.
5. Interface web React.

## Blocages

Aucun blocage technique. Reste à faire côté humain (non bloquant) : SMTP de
production, comptes Apple/Google, tests sur appareil réel.
