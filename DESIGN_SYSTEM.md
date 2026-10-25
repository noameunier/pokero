# DESIGN_SYSTEM — Pokero

Système de design de l’interface web Pokero. Il sert de référence pour toute
évolution : les écrans doivent réutiliser les tokens et les composants décrits
ici plutôt que réintroduire des couleurs, tailles ou ombres ad hoc.

- **Source des tokens** : `apps/web/src/index.css`
- **Bibliothèque de composants** : `apps/web/src/components/ui.tsx`
- **Coquille et navigation** : `apps/web/src/components/AppShell.tsx`
- **Chrono** : `apps/web/src/components/Clock.tsx`
- **Notifications** : `apps/web/src/components/Toast.tsx`
- **Jetons communs** : `apps/web/src/components/ChipCountEditor.tsx`

## 1. Principes

1. **Sobre et feutré.** Anthracite à sous-ton vert, surfaces opaques, or rare.
   Pas de dégradé violet/bleu, pas de verre dépoli généralisé.
2. **La donnée d’abord.** Le chrono, les montants et les rangs passent avant la
   décoration. Aucune animation ne porte une information critique.
3. **Mobile réel.** Zones tactiles de 44 px, zones sûres iOS, clavier virtuel,
   portraits étroits (320 px) et tablettes.
4. **Une seule action dominante par écran.** Le bouton or est l’action
   principale ; le reste est secondaire, discret ou dangereux.
5. **Accessible par défaut.** Contraste, focus visible, libellés, erreurs
   explicites, `prefers-reduced-motion`.
6. **Cohérence avant originalité.** Un nouveau besoin se résout avec un
   composant existant ; sinon on l’ajoute à `ui.tsx` et on le documente ici.

## 2. Couleurs

Toutes les couleurs sont des tokens Tailwind 4 déclarés dans `@theme`. Les
composants ne doivent pas contenir de code hexadécimal.

### Fond et surfaces

| Token | Valeur | Usage |
|---|---|---|
| `night-950` | `#070908` | Fond de page, texte sur or |
| `night-900` | `#0b0e0c` | Fond des onglets, surfaces enfoncées |
| `night-850` | `#0e1210` | Feuilles modales, cartes plates |
| `night-800` | `#121714` | Cartes, en-têtes de menu |
| `night-700` | `#18201b` | Éléments surélevés discrets |
| `night-600` | `#222b25` | Pistes de switch, scrollbar |
| `night-500` | `#33403a` | Bordures fortes ponctuelles |

### Vert poker

| Token | Valeur | Usage |
|---|---|---|
| `felt-950` | `#06130e` | Vert le plus profond |
| `felt-900` | `#0a2018` | Halos, fonds d’accent |
| `felt-800` | `#0d2f23` | Halo de la carte d’action |
| `felt-700` | `#11402f` | Halo supérieur |
| `felt-600` | `#17553e` | Accent de relief |
| `felt-500` | `#1f6b4e` | Réservé aux illustrations |
| `felt-400` | `#2c8a66` | Réservé aux illustrations |
| `felt-300` | `#4cae87` | Réservé aux illustrations |

Le vert n’est **pas** une couleur de texte courant ni une couleur de bouton. Il
sert au relief et aux états positifs.

### Or / laiton

| Token | Valeur | Usage |
|---|---|---|
| `gold-200` | `#f4e6bd` | Survol du bouton primaire |
| `gold-300` | `#ebd49a` | Texte or sur fond sombre |
| `gold-400` | `#dfc078` | Focus, icônes actives, soulignements |
| `gold-500` | `#cfa958` | Bouton primaire, accents, chrono |
| `gold-600` | `#b08a3d` | Bordures or discrètes |
| `gold-700` | `#8c6b2c` | Réservé aux illustrations |

### Texte

| Token | Valeur | Usage | Contraste sur `night-800` |
|---|---|---|---|
| `cream-50` | `#f7f4ea` | Titres | 18,15:1 |
| `cream-100` | `#eee9db` | Texte principal | 16,46:1 |
| `cream-200` | `#d9d3c4` | Texte fort secondaire | 13,37:1 |
| `cream-300` | `#b6b0a1` | Texte secondaire | 8,39:1 |
| `cream-400` | `#8f8b7f` | Texte tertiaire, hints | 5,32:1 |
| `cream-500` | `#858277` | Mentions très discrètes | 4,71:1 |

Règle : **jamais de couleur de texte avec opacité** (`text-cream-400/60`).
Utiliser le token plein correspondant. L’opacité reste autorisée pour l’état
`disabled`. Les fonds, bordures et halos peuvent rester
translucides.

### États

| Token | Valeur | Usage |
|---|---|---|
| `success-300` | `#8ed7b4` | Texte succès |
| `success-400` | `#5fc395` | Point « en direct », progression |
| `success-500` | `#3da578` | Bordures succès |
| `success-600` | `#2b7f5c` | Réservé |
| `warning-300` | `#f0ce96` | Texte avertissement (pause) |
| `warning-400` | `#e0b16b` | Point avertissement |
| `warning-500` | `#c68f43` | Bordures avertissement |
| `danger-300` | `#f0a79d` | Texte erreur |
| `danger-400` | `#e07f72` | Point erreur |
| `danger-500` | `#c85c4e` | Bouton danger, bordures |
| `danger-600` | `#a94438` | Survol danger |

Les états ne sont jamais signalés par la couleur seule : un badge contient
toujours un libellé, souvent un point.

## 3. Typographie

### Familles

| Rôle | Famille | Chargement |
|---|---|---|
| Texte, UI, chiffres | **Manrope Variable** | `@fontsource-variable/manrope` (latin, poids variable) |
| Titres, chiffres de chrono | **Instrument Serif** | `@fontsource/instrument-serif` (latin, 400 + italique) |

Les polices sont auto-hébergées : aucune dépendance à Google Fonts, aucun
décalage lié à un CDN, meilleure confidentialité.

### Échelle

| Rôle | Taille | Détail |
|---|---|---|
| Titre de page | `2,15rem` → `2,65rem` (sm) | `font-display`, interligne 1,08 |
| Titre de section | `2rem` → `2,35rem` | `.stat-value` |
| Titre de modale | `1,7rem` | `font-display` |
| Titre d’état vide | `1,5rem` | `font-display` |
| Corps | `0,9375rem` (15 px) | interligne 1,55 |
| Petit texte | `0,8125rem` (13 px) | hints, erreurs |
| Libellé | `0,6875rem` (11 px) | majuscules, interlettrage 0,13–0,16 em |
| Badge | `0,65625rem` (10,5 px) | majuscules, gras |
| Onglet | `0,8125rem` (13 px) | semi-gras |
| Bouton | `0,875rem` (14 px) | semi-gras |
| Saisie | `1rem` (16 px) | obligatoire pour éviter le zoom iOS |

Le chrono utilise `Manrope` en `tabular-nums`, interlettrage `-0,055em` et une
taille fluide (`clamp`) selon le contexte : `sm`, `md`, `lg`, `xl`.

## 4. Espacements et mise en page

- Base : **4 px** (échelle Tailwind).
- Conteneur principal : `max-width: 1200px`.
- Marges latérales : 16 px (mobile), 24 px (sm), 32 px (lg).
- Hauteur de l’en-tête : 62 px, 72 px à partir de `lg`.
- Navigation basse : environ 64 px + zone sûre.
- Marge basse du contenu : `calc(5.5rem + env(safe-area-inset-bottom))` sur
  mobile, 56 px sur desktop.
- Rythme vertical : `space-y-7`/`space-y-8` pour les pages, `space-y-5` pour les
  groupes de cartes, `gap-5` pour les grilles.
- Padding des cartes : 20 px, 24 px à partir de `sm`.
- Champs de formulaire : 12 px de gap vertical, 16 px entre groupes.

### Points de rupture

| Préfixe | Largeur | Usage |
|---|---|---|
| `sm` | 640 px | Boutons secondaires visibles, titres agrandis |
| `md` | 768 px | Navigation desktop, disparition de la barre basse |
| `lg` | 1024 px | En-tête 72 px, grilles à deux colonnes |
| `xl` | 1280 px | Console tournoi : colonne principale + colonne latérale |

## 5. Rayons

| Token | Valeur | Usage |
|---|---|---|
| `--radius-xs` | 6 px | Très petits éléments |
| `--radius-sm` | 9 px | Boutons compacts, éléments de menu |
| `--radius-md` | 12 px | Boutons, champs, cartes plates |
| `--radius-lg` | 16 px | Cartes standards |
| `--radius-xl` | 20 px | Carte d’action, modale desktop |
| `--radius-2xl` | 26 px | Feuille modale mobile |

Les pastilles et pilules utilisent `rounded-full`.

## 6. Élévation

| Token | Usage |
|---|---|
| `--shadow-soft` | Cartes standards |
| `--shadow-lifted` | Carte d’action, modales, menus |
| `--shadow-gold` | Réservé aux accents or (bouton, logo) |

Les ombres restent larges, très diffuses et sombres. Aucune ombre colorée
saturée, aucun empilement de cartes avec ombre.

## 7. Surfaces et composants

### Cartes

| Classe | Rôle |
|---|---|
| `.card` | Surface standard : `night-800`, bordure 7 %, rayon 16 px |
| `.card-flat` | Surface secondaire : `night-850`, rayon 12 px |
| `.card-command` | Carte d’action : halo de feutrine + filet or, rayon 20 px |
| `.card-quiet` | Surface très discrète pour les groupes |

Ne pas imbriquer plus de deux niveaux de cartes. Une carte dans une carte doit
avoir un rôle identifiable (liste, encart de données).

### Boutons — `Button`

| Variante | Style | Usage |
|---|---|---|
| `primary` | Fond or, texte `night-950` | Une seule action principale par zone |
| `secondary` | Bordure claire, fond translucide | Action complémentaire |
| `ghost` | Sans fond, texte `cream-300` | Annuler, fermer, action tertiaire |
| `danger` | Bordure et texte danger | Suppression, annulation irréversible |

| Taille | Desktop | Pointeur grossier |
|---|---|---|
| `sm` | 36 px | 44 px |
| `md` | 44 px | 44 px |
| `lg` | 48 px | 48 px |

États : survol, actif (`translate-y-px`), focus or 2 px, désactivé à 45 %
d’opacité, chargement avec `aria-busy` et spinner.

### Formulaires

- `Field` : libellé, `hint`, `error` avec `role="alert"`.
- `Input`, `Textarea`, `Select` : classe `.input`, 16 px, 44 px de haut,
  placeholder `cream-400`.
- `Select` : chevron SVG intégré, apparence native désactivée.
- `Switch` : bouton `role="switch"`, zone cliquable pleine largeur, 44 px,
  piste de 44 × 24 px.
- Case à cocher de jeton : input transparent couvrant la ligne, `peer`,
  indicateur visuel or, zone tactile étendue.
- Erreurs : jamais uniquement en rouge ; texte explicite + icône.

### Badges — `Badge`

Tons : `neutral`, `success`, `warning`, `danger`, `gold`. Toujours un libellé
lisible en majuscules. Le point optionnel ne remplace jamais le texte.

### Navigation — `AppShell`

- **Desktop (`md+`)** : en-tête collant, logo, liens principaux, bouton
  « Nouveau tournoi », menu de compte.
- **Mobile (`< md`)** : barre basse fixe à 5 entrées :
  Accueil, Mallettes, **Créer** (action surélevée or), Statistiques, Compte.
  Libellés courts pour éviter la troncature.
- Lien actif : texte `cream-50`, fond translucide et filet or (desktop) ;
  icône et texte or (mobile).
- Menu de compte : nom, email, compte, déconnexion.
- Lien d’évitement « Aller au contenu » au focus clavier.
- Indicateur « Hors ligne » dans l’en-tête.

### Onglets — `Tabs`

`role="tablist"`, boutons `role="tab"`, `aria-selected`, défilement horizontal
sans scrollbar sur mobile, pastille or sur l’onglet actif, 44 px sur tactile.

### Dialogues — `Modal` / `ConfirmDialog`

- Portail dans `document.body`.
- Mobile : feuille ancrée en bas, coins supérieurs 26 px, poignée décorative.
- Desktop : centré, largeur 448 px (ou 672 px en `wide`).
- `aria-modal`, `aria-labelledby`, `aria-describedby`, focus trap, `Escape`,
  verrou de scroll, restitution du focus.
- `ConfirmDialog` : ton `danger` par défaut, bouton de confirmation explicite.

### Notifications — `Toast`

- Empilées en bas, au-dessus de la navigation mobile, max 4.
- Disparition après 5,2 s, fermeture manuelle avec zone tactile étendue.
- `aria-live="polite"` pour les succès/infos, `role="alert"` pour les erreurs.
- Icône + couleur + texte : jamais la couleur seule.

### États de données

| Composant | Usage |
|---|---|
| `Spinner` | Chargement initial, `role="status"` |
| `Skeleton` | Chargement de contenu structuré (réservé) |
| `EmptyState` | Aucune donnée, avec action |
| `ErrorState` | Échec de requête, message + « Réessayer » |
| `ProgressBar` | Progression du niveau, `role="progressbar"` |

Les quatre états (vide, chargement, erreur, contenu) doivent être prévus pour
toute page alimentée par une requête.

## 8. Mouvement

| Animation | Durée | Usage |
|---|---|---|
| `fade` | 180 ms | Voile de modale |
| `rise` | 280 ms | Menus, toasts, cartes |
| `sheet-up` | 300 ms | Feuille modale mobile |
| Transitions de bouton | 150 ms | Couleur, bordure, ombre |
| Switch | 200 ms | Déplacement du curseur |
| Progression | 500 ms | Largeur de barre |
| `live-pulse` | 2,4 s | Point « en direct » uniquement |

Règles :

- Pas d’animation permanente hors indicateur « en direct ».
- Pas de parallaxe, pas de flottement, pas de rebond.
- Le chrono se met à jour par calcul serveur ; il ne dépend d’aucune animation.
- `prefers-reduced-motion: reduce` ramène toutes les durées à 0,01 ms.

## 9. Accessibilité

Objectif **WCAG 2.2 AA**.

- **Contraste** : texte courant ≥ 4,5:1 ; les tokens `cream-400` et `cream-500`
  ont été éclaircis pour tenir sur `night-800`.
- **Focus** : contour or 2 px, offset 2 px, visible sur tous les fonds.
- **Clavier** : ordre logique, focus trap dans les modales, `Escape`, retour du
  focus à l’élément déclencheur.
- **Cibles** : 44 px minimum sur pointeur grossier ; 24 px minimum absolu sur
  desktop (WCAG 2.5.8).
- **Formulaires** : chaque champ a un `label` associé par `htmlFor`, les erreurs
  sont annoncées (`role="alert"`), les boutons en chargement exposent
  `aria-busy`.
- **Sémantique** : `header`, `nav`, `main`, `footer`, titres hiérarchisés,
  `aria-current` via `NavLink`, `role="tablist"`, `role="switch"`,
  `role="progressbar"`.
- **Mouvement** : respect de `prefers-reduced-motion`.
- **Zoom** : mise en page utilisable à 320 px de large et avec un zoom texte de
  200 % ; pas de défilement horizontal.
- **Zones sûres** : navigation, modales et toasts protégés par
  `env(safe-area-inset-*)`.
- **Clavier virtuel** : `scroll-padding-top/bottom` pour que le champ actif ne
  soit pas masqué.

## 10. Responsive : règles concrètes

- Concevoir d’abord à **320 px**, puis 390, 412, 834, 1440.
- Toute grille à deux colonnes utilise `minmax(0, …fr)` et `min-w-0` sur les
  enfants pour autoriser la troncature.
- Les tableaux de données deviennent des listes empilées sur mobile.
- Les actions principales restent visibles sans défilement horizontal.
- Les onglets défilent horizontalement plutôt que de se comprimer.
- Les libellés de navigation basse font au maximum 10 caractères.
- Les titres longs passent à la ligne ; aucun `truncate` sur un titre de page.

## 11. Ajouter ou modifier un composant

1. Vérifier si `ui.tsx` couvre le besoin ; sinon, l’ajouter là (pas dans une
   page).
2. Utiliser exclusivement les tokens de ce document.
3. Prévoir les états : normal, survol, focus, actif, désactivé, chargement,
   erreur si pertinent.
4. Vérifier à 320 px, 390 px et 1440 px.
5. Vérifier au clavier et avec `prefers-reduced-motion`.
6. Documenter la nouveauté dans ce fichier et, si elle change un parcours,
   mettre à jour `UI_AUDIT.md`.

## 12. Inventaire

| Élément | Fichier |
|---|---|
| Tokens, base, classes de composants | `apps/web/src/index.css` |
| Boutons, champs, badges, cartes, états, modales, onglets, switch | `apps/web/src/components/ui.tsx` |
| En-tête, navigation basse, menu de compte, marque | `apps/web/src/components/AppShell.tsx` |
| Chrono, barre de progression, carillon | `apps/web/src/components/Clock.tsx` |
| Notifications | `apps/web/src/components/Toast.tsx` |
| Éditeur de quantités de jetons | `apps/web/src/components/ChipCountEditor.tsx` |
| Pages | `apps/web/src/pages/` |
| Captures avant/après | `docs/ui/` |
