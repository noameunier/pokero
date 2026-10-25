# Captures UI · Pokero

Captures Playwright de l’interface, avant et après la refonte.

## Arborescence

```
docs/ui/
  before/
    mobile/    21 captures, 390 × 844
    tablet/    19 captures, 834 × 1112
    desktop/   19 captures, 1440 × 900
  after/
    small/     25 captures, 320 × 640
    iphone/    29 captures, 390 × 844
    android/   25 captures, 412 × 915
    tablet/    25 captures, 834 × 1112
    desktop/   26 captures, 1440 × 900
    states/     5 captures (vide, chargement, erreur)
```

Les captures « avant » ont été prises sur `main` (`56a1b77`). Les captures
« après » ont été prises sur `redesign/ui-ux` avec le compte de démonstration et
les données du seed.

## Écrans comparables

| Écran | Avant (mobile/tablet/desktop) | Après (small/iphone/android/tablet/desktop) |
|---|---|---|
| Tableau de bord | `dashboard.png` | `dashboard.png`, `dashboard-full.png` |
| Mallettes | `chip-cases.png` | `chip-cases.png` |
| Création de mallette | `chip-case-new.png` | `chip-case-new.png` |
| Détail de mallette | `chip-case-detail.png` | `chip-case-detail.png` |
| Presets | `presets.png` | `presets.png` |
| Création de preset | `preset-detail.png` | `preset-new.png` |
| Assistant : informations | `wizard-1-info.png` | `wizard-1-info.png` |
| Assistant : jetons | `wizard-2-chips.png` | `wizard-2-chips-auto.png`, `wizard-2-chips-manual.png`, `wizard-2-common.png`, `wizard-2-common-insufficient.png` |
| Assistant : blindes | `wizard-3-blinds.png` | `wizard-3-blinds.png` |
| Assistant : options | `wizard-4-options.png` | `wizard-4-options.png` |
| Console live | `tournament-live.png` | `tournament-live.png` |
| Structure | `tournament-structure.png` | `tournament-structure.png` |
| Joueurs | `tournament-players.png` | `tournament-players.png` |
| Classement | `tournament-ranking.png` | `tournament-ranking.png` |
| Tournoi terminé | `tournament-completed.png` | `tournament-completed.png` |
| Projection | `projection.png` | `projection.png` |
| Spectateur | `spectator.png` | `spectator.png` |
| Statistiques | `stats.png` | `stats.png` |
| Compte | `account.png` | `account-profile.png`, `account-security.png`, `account-data.png` |
| Connexion | `login.png` | `login.png` |
| Inscription | `register.png` | `register.png` |

## États et cas limites (après)

| Cas | Fichier |
|---|---|
| Tableau de bord vide, pseudo long | `states/iphone-dashboard-empty.png`, `states/desktop-dashboard-empty.png` |
| Chargement | `states/iphone-dashboard-loading.png` |
| Erreur réseau | `states/iphone-dashboard-error.png`, `states/desktop-dashboard-error.png` |
| Hors ligne | `iphone/dashboard-offline.png` |
| Quantité commune | `*/wizard-2-common.png` |
| Stock insuffisant | `*/wizard-2-common-insufficient.png` |
| Ex æquo | `*/tournament-ranking.png` |

## Régénérer les captures

Les scripts de capture ne sont pas versionnés (ils dépendent du serveur de
développement et du seed). Procédure :

1. Lancer PostgreSQL, l’API et Vite :

   ```bash
   docker compose up -d db
   pnpm --filter @pokero/api dev
   API_PROXY_TARGET=http://127.0.0.1:4100 pnpm --filter @pokero/web dev
   ```

2. Se connecter avec `demo@pokero.local` / `PokeroDemo2026!`.
3. Utiliser Playwright (`apps/web`, Chromium installé) avec les tailles du
   tableau ci-dessus, en français (`locale: 'fr-FR'`).
4. Désactiver les animations (`animations: 'disabled'`) et attendre le chargement
   des données avant chaque capture.

## Note sur la prévisualisation

Les fichiers sont des PNG valides. Certains visualiseurs Markdown peuvent
afficher des artefacts (rectangles dorés, doublons) lors de la mise à l’échelle ;
ils ne proviennent pas de l’interface. En cas de doute, ouvrir le PNG à sa taille
native.
