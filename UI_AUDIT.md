# UI_AUDIT · Pokero

Audit de l'interface web avant/après la refonte UI/UX.

- **Date** : 25 octobre 2026
- **Branche** : `redesign/ui-ux`, créée depuis `main` (`56a1b77`)
- **Périmètre** : `apps/web` uniquement. Aucun contrat API, aucun schéma de
  données, aucune migration et aucune logique métier n'ont été modifiés.
- **Environnement d'audit** : API de développement sur `127.0.0.1:4100`, Vite sur
  `127.0.0.1:5173`, PostgreSQL local, compte de démonstration.
- **Captures** : `docs/ui/before/` (21 mobiles, 19 tablette, 19 desktop) et
  `docs/ui/after/` (small, iphone, android, tablette, desktop + états).

## 1. Méthode

1. Lecture de l'architecture et des parcours existants (routes, `AppShell`,
   `ui.tsx`, `index.css`, TanStack Query, Socket.IO, auth, i18n).
2. Captures Playwright de tous les écrans en français, avec des données de
   démonstration réalistes (tournoi en cours, en pause, terminé, brouillon).
3. Relevé des défauts visuels, tactiles, d'accessibilité et de responsive.
4. Mesure des contrastes avec la formule WCAG 2.x sur les valeurs de tokens
   réellement utilisées (pas d'estimation à l'œil).
5. Contrôle automatisé du débordement horizontal :
   `document.documentElement.scrollWidth === clientWidth` sur les routes
   principales à 320 px et 390 px.
6. Après refonte : nouvelles captures aux formats 320×640, 390×844, 412×915,
   834×1112 et 1440×900, plus les états vide, chargement, erreur et hors ligne.
7. Vérifications fonctionnelles : `typecheck`, build Vite, tests unitaires et
   trois scénarios Playwright.

**Limites** : les contrôles sont faits dans Chromium (Playwright) sur Linux.
Aucun test sur appareil iOS/Android réel, aucun lecteur d'écran, aucun audit
automatisé axe n'a été exécuté. Les objectifs WCAG 2.2 AA sont visés et
documentés, pas certifiés.

## 2. Architecture constatée

- SPA React 19 + Vite 8 + Tailwind 4, routage React Router, données via TanStack
  Query, temps réel via Socket.IO.
- Coquille applicative unique (`AppShell`) : en-tête desktop, navigation basse
  mobile, menu de compte, pied de page desktop.
- Bibliothèque interne de composants (`ui.tsx`) et styles globaux (`index.css`).
- Pages : connexion, inscription, mot de passe oublié, réinitialisation,
  vérification email, tableau de bord, mallettes (liste/éditeur), presets
  (liste/éditeur), assistant tournoi en 4 étapes, console live, projection,
  spectateur public, statistiques, compte (profil, sécurité, données).
- Le chronomètre est autoritaire côté serveur : l'interface ne fait qu'afficher
  un temps calculé et ne dépend jamais d'une animation pour rester juste.

## 3. Constats et corrections

### 3.1 Direction artistique et surfaces

| Réf. | Constat V1 | Correction V2 |
|---|---|---|
| A1 | Fond en grands dégradés verts saturés (`#0f4a37` → `#0a2d22`) peu lisibles et très « template ». | Fond anthracite `night-950` à sous-ton vert, deux halos très discrets, grain léger. Les surfaces sont opaques. |
| A2 | Cartes en verre translucide (`bg-white/[0.04]` + `backdrop-blur`) sur quatre composants, effet « glassmorphism » généralisé. | Surfaces solides `night-800`/`night-850`, bordures à 6–7 % de blanc, une seule carte d’action (`card-command`) avec un dégradé de feutrine contenu. |
| A3 | Or utilisé partout : boutons primaires, badges, navigation active, icônes. Perte de hiérarchie. | Or réservé à l’action principale, au chrono et aux accents rares. Le vert sert aux états positifs et au relief. |
| A4 | Titres en Georgia (police système de secours), texte en police système. Identité faible et rendu variable selon l’OS. | `Instrument Serif` pour les titres, `Manrope Variable` pour le texte, auto-hébergées. Rendu identique partout, aucune requête vers un CDN. |

### 3.2 Lisibilité et contrastes

Mesures V1 (formule WCAG, mélanges calculés sur les valeurs de tokens) :

| Combinaison V1 | Ratio | Seuil texte courant |
|---|---|---|
| `ink-500` `#56665f` sur `felt-950` | **2,98:1** | 4,5:1 (échec) |
| `cream-300/60` sur une carte (`#113026`) | **4,16:1** | 4,5:1 (échec) |
| `cream-300/60` sur `felt-900` | **4,42:1** | 4,5:1 (échec) |
| Placeholder `cream-300/40` sur `felt-950` | **2,79:1** | 4,5:1 (échec) |

La V1 comptait **183 occurrences** de classes `text-cream-*/…` (texte avec
opacité), ce qui rendait les contrastes dépendants du fond et impossibles à
auditer simplement.

Correction : passage à des **tokens pleins**. Il reste aujourd’hui **0** couleur de texte avec opacité
(`text-…/…`) dans `apps/web/src`. Mesures après refonte :

| Combinaison V2 | Ratio |
|---|---|
| `cream-400` `#8f8b7f` sur `night-800` `#121714` | **5,32:1** |
| `cream-500` `#858277` sur `night-800` | **4,71:1** |
| `cream-300` `#b6b0a1` sur `night-800` | **8,39:1** |
| `cream-100` `#eee9db` sur `night-950` | **16,46:1** |
| `gold-500` `#cfa958` sur `night-950` | **9,00:1** |
| `night-950` sur `gold-500` (bouton primaire) | **9,00:1** |

### 3.3 Formulaires, tactile et clavier virtuel

| Réf. | Constat V1 | Correction V2 |
|---|---|---|
| A5 | Champs en `text-sm` (14 px) : Safari iOS zoome automatiquement au focus. | Champs en `text-base` (16 px), hauteur 44 px (46 px sur pointeur grossier). |
| A6 | Boutons `btn-sm` d’environ 30 px de haut, navigation mobile en 10 px. Cibles inférieures à 44 px. | Règle `@media (pointer: coarse)` : boutons, liens de navigation, onglets et champs à **44 px minimum** ; `touch-action: manipulation`. |
| A7 | Zones sûres iOS traitées partiellement (navigation basse uniquement). | `env(safe-area-inset-bottom)` sur la navigation, les feuilles modales et les toasts ; `scroll-padding` haut/bas pour le clavier virtuel. |
| A8 | Messages d’erreur sans `role="alert"`, pas de focus automatique, pas de `aria-busy` sur les boutons en chargement. | `Field` expose `hint`/`error` avec `role="alert"`, `Button` expose `aria-busy`, focus visible or de 2 px. |

### 3.4 Responsive et débordements

| Réf. | Constat | Correction |
|---|---|---|
| A9 | Captures V1 à 390 px : boutons de la console et onglets tronqués à droite. | `min-w-0` sur les colonnes de grille et les conteneurs flexibles de la console ; vérification automatisée à **320** et **390 px** sur 13 routes : `scrollWidth === clientWidth`. |
| A10 | Titres longs et pseudos longs pouvaient pousser la mise en page. | `min-w-0`, troncature explicite, `text-wrap: balance` sur les titres et `pretty` sur les paragraphes ; captures dédiées avec un pseudo de 31 caractères. |
| A11 | Tableau de bord mobile : actions et cartes très denses, navigation basse sans action centrale identifiable. | Barre basse à 5 entrées, action « Créer » surélevée, libellés courts (« Accueil », « Créer »), zone active en or. |

### 3.5 États, erreurs et dialogues

| Réf. | Constat V1 | Correction V2 |
|---|---|---|
| A12 | Aucune gestion `isError` sur le tableau de bord, les mallettes, les presets et les statistiques : en cas de coupure, liste vide ou spinner sans issue. | Composant `ErrorState` avec message réseau explicite et bouton « Réessayer », branché sur ces quatre pages. |
| A13 | États vides hétérogènes, parfois un simple paragraphe. | `EmptyState` commun (icône, titre, description, action) et captures dédiées. |
| A14 | `window.confirm` natif pour clôturer, annuler ou supprimer un tournoi (3 occurrences). Boîte non stylée, non traduite, inaccessible. | `ConfirmDialog` basé sur `Modal` : titre, description, ton danger/primaire, focus trap, `Escape`, restitution du focus. |
| A15 | `Modal` : `Escape` seulement, pas de piège de focus, pas de restitution, pas de `aria-describedby`, pas de portail. | Portail React, `role="dialog"`, `aria-modal`, `aria-labelledby`/`aria-describedby`, focus trap, verrou de scroll, restitution du focus, feuille plein écran sur mobile. |
| A16 | Pas d’indicateur hors ligne. | Badge « Hors ligne » dans l’en-tête, basé sur `navigator.onLine`. |

### 3.6 Mouvement et accessibilité

| Réf. | Constat V1 | Correction V2 |
|---|---|---|
| A17 | Aucune règle `prefers-reduced-motion`. | Toutes les animations et transitions réduites à 0,01 ms si l’utilisateur le demande. |
| A18 | Animations décoratives permanentes et transitions longues. | Transitions de 150–300 ms, une seule animation infinie (le point « en direct »), rien qui conditionne le chrono. |
| A19 | Pas de lien d’évitement. | Lien « Aller au contenu » visible au focus clavier. |
| A20 | Focus visible dépendant du navigateur, parfois invisible sur fond vert. | `:focus-visible` global : contour or 2 px, offset 2 px. |

### 3.7 Contenu et cohérence

| Réf. | Constat | Correction |
|---|---|---|
| A21 | « Même nombre de jetons » implémenté séparément dans l’assistant tournoi et l’éditeur de preset, avec des libellés et comportements divergents. | `ChipCountEditor` partagé : case globale, case par jeton, quantité commune, quantités spécifiques conservées, total nécessaire et alerte de stock insuffisant. |
| A22 | Le classement n’affichait pas les ex æquo renvoyés par le domaine (`tied`). | Affichage `1=` dans la console et la projection, note explicative. Le payload spectateur n’expose pas `tied` : aucun indicateur inventé côté public. |
| A23 | En pause, la projection annonçait encore « Prochaine pause ». | « Profitez de la pause » quand le chrono est en pause. |
| A24 | Badge « Tournoi en cours » redondant sur la carte live, badge « Terminé » dupliqué dans la console. | Doublons retirés. |
| A25 | Le tableau de bord saluait avec le premier mot du pseudo. | Salutation avec le pseudo complet, tronqué proprement si nécessaire. |
| A26 | Presets : pas de duplication, filtre archives peu visible, suppression sans confirmation. | Duplication via l’API existante, filtre « Archives », `ConfirmDialog` de suppression. |

## 4. Parcours audités

- **Authentification** : connexion, inscription, mot de passe oublié,
  réinitialisation, vérification email.
- **Tableau de bord** : premier lancement vide, tournoi en cours, en pause,
  brouillon, tournoi terminé, hors ligne, erreur réseau, chargement.
- **Mallettes** : liste, archives, création, édition, inventaire, ajustement,
  suppression.
- **Presets** : liste, filtres, duplication, création, édition, suppression.
- **Tournoi** : assistant 4 étapes (infos, jetons automatiques/manuel/commun,
  blindes, options), console live (chrono, joueurs, structure, classement,
  historique), pause, reprise, éliminations, rebuys/add-ons, clôture.
- **Public** : projection plein écran, lien spectateur, classement public.
- **Statistiques** et **compte** (profil, sécurité, données/RGPD).

## 5. Résultats après refonte

| Contrôle | Résultat |
|---|---|
| Débordement horizontal à 320 px (13 routes) | 0 débordement |
| Débordement horizontal à 390 px (console live et terminée) | 0 débordement |
| Couleur de texte avec opacité (`text-…/…`) | 0 occurrence |
| Cibles tactiles | ≥ 44 px sur pointeur grossier |
| Champs | 16 px, ≥ 44 px |
| Contrastes texte courant | ≥ 4,71:1 sur `night-800` |
| `prefers-reduced-motion` | Respecté |
| Modales | Focus trap, `Escape`, restitution du focus, `aria-*` |
| États vide/chargement/erreur | Capturés et vérifiés |
| Typecheck web | ✅ |
| Build Vite | ✅ (`index.js` ≈ 648 kB minifié, ≈ 185 kB gzip) |
| Tests unitaires | 48 domaine + 31 API ✅ |
| E2E | 5/5 ✅ |
| Production HTTPS (thème, polices, console) | ✅ |

## 6. Non-régression fonctionnelle

Aucun changement n’a été apporté :

- aux routes API, aux schémas Zod, au schéma Prisma ou aux migrations ;
- à l’authentification, aux sessions, au CSRF, au rate limiting ou au PIN ;
- à l’isolation multi-organisateurs ;
- aux mallettes, stocks, réservations et ajustements ;
- à la distribution des caves, aux presets et aux blindes ;
- au chrono serveur, au WebSocket, à la pause/reprise ou aux interruptions ;
- aux rebuys, add-ons, éliminations et classements ;
- aux liens spectateurs, QR codes, exports et suppressions RGPD.

La refonte est confineée à `apps/web/src`, aux dépendances de polices, au proxy
de développement Vite et aux tests E2E.

## 7. Limites connues

- Pas de validation sur appareil iOS/Android réel (pas de macOS, pas d’émulateur
  Android/KVM, pas de compte de store).
- Pas de test avec lecteur d’écran (VoiceOver/TalkBack/NVDA) ni d’audit axe
  automatisé.
- Les contrastes sont calculés sur les tokens ; les images, dégradés et halos
  décoratifs ne portent jamais de texte essentiel.
- Le bundle principal reste volumineux (≈ 176 kB gzip) ; aucun découpage de code
  n’a été introduit dans cette refonte pour ne pas modifier le comportement.
- La vérification d’email reste désactivée en production faute de SMTP réel.

## 8. Captures

- Avant : `docs/ui/before/mobile/`, `docs/ui/before/tablet/`,
  `docs/ui/before/desktop/`.
- Après : `docs/ui/after/small/`, `iphone/`, `android/`, `tablet/`,
  `desktop/`, plus `states/` (vide, chargement, erreur desktop et mobile) et
  `iphone/dashboard-offline.png`.
- Index et commandes de régénération : `docs/ui/README.md`.
