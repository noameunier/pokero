# TEST_REPORT · Refonte UI/UX Pokero

Rapport des vérifications réellement exécutées le 25 octobre 2026 sur
l’environnement de développement Linux.

## 1. Environnement

| Élément | Valeur |
|---|---|
| Dépôt | `/home/dev/repos/pokero` |
| Branche | `redesign/ui-ux` |
| Point de départ | `56a1b77` (`main`) |
| Node / pnpm | versions du dépôt, `PATH` local |
| Navigateur | Chromium via Playwright |
| API | `127.0.0.1:4100` |
| Web | `127.0.0.1:5173` |
| Base | PostgreSQL `127.0.0.1:5433`, base `pokero` |

Commandes de lancement utilisées :

```bash
export PATH="$HOME/.local/bin:$PATH"
API_PROXY_TARGET=http://127.0.0.1:4100 pnpm --filter @pokero/web dev
```

Les captures et tests E2E utilisent le compte de démonstration
`demo@pokero.local` / `PokeroDemo2026!` et les données du seed.

## 2. Tests unitaires et d’intégration

Commande : `pnpm test`

| Paquet | Fichiers | Tests | Résultat |
|---|---|---|---|
| `packages/contracts` | 0 | 0 | ✅ (aucun test défini) |
| `packages/domain` | 4 | 47 | ✅ 47/47 |
| `apps/api` | 2 | 29 | ✅ 29/29 |
| `apps/web` | 0 | 0 | ✅ (couverture par Playwright) |

Durées observées : domaine ≈ 1 s, API ≈ 53 s.

Remarque : l’API émet un avertissement de dépréciation `pg` sur des requêtes
concurrentes provenant de la pile Prisma. Aucun test n’échoue et aucune erreur
fonctionnelle n’a été observée.

## 3. Typecheck et build

| Commande | Résultat |
|---|---|
| `pnpm --filter @pokero/web typecheck` | ✅ `tsc --noEmit` sans erreur |
| `pnpm --filter @pokero/web build` | ✅ build Vite + PWA |

Sortie de build :

| Fichier | Taille |
|---|---|
| `index-*.js` | ≈ 623 kB minifié, ≈ 176 kB gzip |
| `index-*.css` | ≈ 84 kB minifié, ≈ 17 kB gzip |
| Polices | Manrope ≈ 25 kB, Instrument Serif ≈ 21–22 kB (woff2) |
| Pré-cache PWA | 22 entrées, ≈ 848 KiB |

L’avertissement Vite sur la taille du chunk principal reste présent. Il est
antérieur à la refonte et n’est pas bloquant ; aucun découpage de code n’a été
introduit pour ne pas modifier le comportement.

## 4. Tests E2E Playwright

Commande :

```bash
E2E_BASE_URL=http://127.0.0.1:5173 pnpm test:e2e
```

Résultat : **4/4 scénarios verts** (59,7 s au total, dernier passage).

| Scénario | Fichier | Durée | Couverture |
|---|---|---|---|
| Parcours organisateur complet | `e2e/tournament.spec.ts` | 27,3 s | Inscription, mallettes, tournoi, jetons communs, joueurs, chrono, éliminations avec confirmation, clôture, classement, lien spectateur, lien invalide, suppression RGPD |
| Saisie mobile | `e2e/mobile-layout.spec.ts` | 7,9 s | Valeurs et quantités lisibles, pas de débordement, suppression de compte |
| Quantité commune de jetons | `e2e/chip-common.spec.ts` | 12,3 s | Case globale, cases par jeton, valeur commune, retour aux valeurs spécifiques, alerte de stock |
| Aperçu local de cave | `e2e/chip-case-preview.spec.ts` | 10,3 s | Aperçu calculé avec les valeurs non enregistrées, avertissement d’obsolescence, enregistrement depuis le bas de page, suppression |

Adaptations rendues nécessaires par la refonte, sans modifier les attentes
fonctionnelles :

- les onglets sont désormais des `role="tab"` ;
- les éliminations et la clôture passent par un dialogue de confirmation ;
- la suppression de compte exige l’onglet « Données » ;
- le texte « par joueur » existe dans deux contextes, le test cible le premier.

## 5. Matrice responsive

Captures générées avec Playwright :

| Format | Taille | DPR | Fichiers |
|---|---|---|---|
| Petit téléphone | 320 × 640 | 2 | 25 |
| iPhone | 390 × 844 | 2 | 29 |
| Android | 412 × 915 | 2 | 25 |
| Tablette | 834 × 1112 | 2 | 25 |
| Desktop | 1440 × 900 | 1 | 26 |

Écrans couverts : connexion, inscription, mot de passe oublié, tableau de bord
(vide, complet, hors ligne), mallettes (liste, création, détail), presets
(liste, création, détail), assistant tournoi (4 étapes, jetons automatiques,
manuels, communs, stock insuffisant), console (chrono, structure, joueurs,
classement, terminé), projection, spectateur, statistiques, compte (profil,
sécurité, données).

### Débordement horizontal

Contrôle automatisé : `document.documentElement.scrollWidth` comparé à
`clientWidth`.

| Largeur | Routes contrôlées | Résultat |
|---|---|---|
| 320 px | 13 routes principales | 0 débordement |
| 390 px | Console live + tournoi terminé | 0 débordement |

Un débordement avait été détecté pendant la refonte sur la console tournoi
(colonnes de grille sans `min-w-0`). Il a été corrigé et re-vérifié.

## 6. États vérifiés

Captures dans `docs/ui/after/states/` :

| État | Fichier | Vérification |
|---|---|---|
| Tableau de bord vide, pseudo long (31 caractères) | `iphone-dashboard-empty.png`, `desktop-dashboard-empty.png` | Salutation sur deux lignes, carte vide lisible, actions visibles |
| Chargement | `iphone-dashboard-loading.png` | Spinner `role="status"` avec libellé « Chargement… » |
| Erreur réseau | `iphone-dashboard-error.png`, `desktop-dashboard-error.png` | Message explicite + bouton « Réessayer » |
| Hors ligne | `iphone/dashboard-offline.png` | Badge « Hors ligne » dans l’en-tête |
| Stock insuffisant | `*/wizard-2-common-insufficient.png` | Alerte visible, saisie non bloquée |
| Pause | `*/tournament-live.png`, projection | Badge pause, copie « Profitez de la pause » |
| Terminé | `*/tournament-completed.png` | Badge « Terminé », actions adaptées |
| Ex æquo | `*/tournament-ranking.png`, projection | `1=` + note explicative |
| Grandes valeurs | wizard et console | Montants formatés, pas de débordement |

## 7. Accessibilité

### Contrastes calculés

Formule WCAG 2.x appliquée aux valeurs de tokens.

| Combinaison | Ratio | Seuil | Résultat |
|---|---|---|---|
| `cream-50` sur `night-950` | 18,15:1 | 4,5:1 | ✅ |
| `cream-100` sur `night-950` | 16,46:1 | 4,5:1 | ✅ |
| `cream-300` sur `night-800` | 8,39:1 | 4,5:1 | ✅ |
| `cream-400` sur `night-800` | 5,32:1 | 4,5:1 | ✅ |
| `cream-500` sur `night-800` | 4,71:1 | 4,5:1 | ✅ |
| `gold-500` sur `night-950` | 9,00:1 | 4,5:1 | ✅ |
| `night-950` sur `gold-500` | 9,00:1 | 4,5:1 | ✅ |
| `success-300` sur `night-950` | 11,91:1 | 4,5:1 | ✅ |
| `danger-300` sur `night-950` | 10,19:1 | 4,5:1 | ✅ |
| `warning-300` sur `night-950` | 13,29:1 | 4,5:1 | ✅ |

La V1 présentait plusieurs échecs mesurés (`ink-500` à 2,98:1,
`cream-300/60` sur carte à 4,16:1, placeholder à 2,79:1). Les couleurs de texte
avec opacité (`text-…/…`) ont été supprimées : **183 occurrences en V1, 0 en V2**.

### Contrôles manuels

| Contrôle | Résultat |
|---|---|
| Navigation clavier complète (Tab, Maj+Tab, Entrée, Espace) | ✅ |
| Focus visible sur fond sombre | ✅ contour or 2 px |
| Piège de focus dans les modales | ✅ |
| Fermeture par `Escape` | ✅ |
| Restitution du focus au déclencheur | ✅ |
| Lien d’évitement | ✅ |
| Libellés de champs associés | ✅ |
| Erreurs annoncées (`role="alert"`) | ✅ |
| `aria-busy` sur boutons en chargement | ✅ |
| `prefers-reduced-motion` | ✅ animations ramenées à 0,01 ms |
| Cibles tactiles ≥ 44 px sur pointeur grossier | ✅ boutons, onglets, switch, navigation, champs |
| Champs à 16 px (anti-zoom iOS) | ✅ |
| Zones sûres iOS | ✅ navigation, modales, toasts |

### Limites d’accessibilité

- Aucun test avec lecteur d’écran réel (VoiceOver, TalkBack, NVDA).
- Aucun audit automatisé axe-core.
- Aucun test sur appareil iOS/Android physique.
- Les objectifs WCAG 2.2 AA sont visés, pas certifiés.

## 8. Non-régression fonctionnelle

Les vérifications suivantes ont été refaites après refonte :

- inscription, connexion, déconnexion, mot de passe oublié ;
- création et édition d’une mallette, inventaire, stock ;
- création et duplication d’un preset ;
- assistant tournoi complet, cave automatique, manuelle et commune ;
- démarrage, pause, reprise du chrono ;
- rebuys, add-ons, éliminations, annulation d’élimination ;
- classement, clôture, tournoi terminé ;
- création et révocation d’un lien spectateur, QR code ;
- projection plein écran ;
- statistiques et compte ;
- export et suppression RGPD.

Aucun changement n’a été apporté aux routes API, aux schémas Zod, au schéma
Prisma, aux migrations, à l’authentification, au CSRF, au rate limiting, au PIN,
au chrono serveur, au WebSocket ni à l’isolation multi-organisateurs.

## 9. Vérification en production

Déploiement effectué le 25 octobre 2026 après fusion sur `main` :

| Contrôle | Résultat |
|---|---|
| `https://pokero.noameunier.fr/` | 200 |
| `https://pokero.noameunier.fr/api/health` | 200, base à 2 ms |
| Conteneurs `api` / `web` / `db` | healthy |
| Thème navigateur (`theme-color`) | `#070908` |
| Fond calculé | `rgb(7, 9, 8)` |
| Police des titres | Instrument Serif chargée |
| Erreurs console sur `/connexion` | 0 |
| Mise en page 320 × 640 | aucun débordement, formulaire visible sans scroll |

Le compte de production `NonoPoker` n’a pas été utilisé ni modifié.

## 10. Bibliothèques

| Ajout | Version | Justification |
|---|---|---|
| `@fontsource-variable/manrope` | `^5.3.0` | Police de texte variable, auto-hébergée, lisible sur mobile, sans CDN |
| `@fontsource/instrument-serif` | `^5.3.0` | Police de titres éditoriale, auto-hébergée, deux graisses utiles |

Aucune bibliothèque de composants UI n’a été ajoutée. `lucide-react` et
`qrcode.react` étaient déjà présents. Le reste (boutons, cartes, modales,
onglets, switch, toasts) est interne.

## 11. Limites et points ouverts

- Validation sur appareils réels impossible ici : pas de macOS/Xcode, pas
  d’émulateur Android (KVM indisponible), pas de comptes Apple/Google.
- Vérification email non testable en production sans SMTP réel.
- Bundle principal volumineux (≈ 176 kB gzip) : découpage à planifier.
- Les tests E2E laissent des comptes `@pokero.test` en base de développement
  lorsque le nettoyage échoue ; ce sont des comptes de test, pas des comptes
  utilisateur.
- La refonte est déployée en production ; les tests sur appareils réels restent
  à faire.
