# Revue UI · 13 novembre 2026

Branche : `ui/experience-refresh`, basée sur `bf50b87`.

## Conclusion

L’identité anthracite, feutrine et laiton est déjà cohérente. Le meilleur levier
n’est pas une autre bibliothèque UI : c’est une meilleure hiérarchie des tâches,
moins de répétition et un accès fiable aux contenus sur petit écran.

Aucune dépendance ajoutée. La bibliothèque interne et les tokens existants sont
réutilisés. Aucun changement d’API, de schéma, de calcul des caves ni de chrono serveur.
Le travail est isolé dans un worktree, sans reprendre les modifications locales
qui étaient en cours dans l’assistant tournoi et l’éditeur de preset.

## Constats et propositions réalisées

| Constat | Réponse |
|---|---|
| Créer un tournoi est répété dans l’en-tête, le titre, les accès rapides et la navigation mobile. | Suppression du bloc d’accès rapides redondant. Création secondaire lorsqu’une table est active ; console live prioritaire. |
| Les statistiques et raccourcis occupent beaucoup de hauteur avant les tournois. | Colonne principale consacrée aux parties ; matériel, presets et statistiques regroupés à droite sur desktop. |
| Les listes s’arrêtent à six éléments sans autre accès. | Recherche insensible aux accents, filtres Tous / À venir / Historique, affichage progressif par six. Recherche sur tous les éléments reçus. |
| Le statut des tournois disparaît sur mobile. | Badge conservé sous le titre sur mobile, à droite sur desktop. |
| Presets absent de la navigation mobile. | Raccourci permanent dans l’en-tête et liens de lancement dans la préparation de soirée. |
| Tous les liens desktop se disputent la place dès 768 px. | Navigation basse jusqu’à 1023 px ; navigation haute à partir de 1024 px. |
| Les requêtes secondaires en attente ou en erreur ressemblent à des zéros ou à des listes vides. | Squelettes de chargement et messages locaux avec reprise. Le tournoi reste accessible si son aperçu live échoue. |
| Le démarrage à vide propose simultanément plusieurs actions dominantes. | Trois étapes explicites et une action principale selon l’existence d’une mallette active. |
| Le panneau de compte déclare un menu ARIA sans interactions de menu complètes. | Modèle disclosure avec Tab natif, `aria-expanded`, `aria-controls` et retour de focus avec Échap. |

Le lien « Tout voir » est conservé pour les mallettes et presets : les aperçus de
la colonne latérale ne remplacent pas leurs pages de gestion.

## Captures comparables

Données fictives identiques : 13 tournois, dont une partie en cours, trois à
préparer et neuf dans l’historique ; une mallette et un preset. Horloge figée.
Les captures ne contiennent pas de données de production.

| Format | Avant | Après |
|---|---|---|
| Desktop · 1440 × 1000 | [Voir](before/desktop.png) | [Voir](after/desktop.png) |
| Mobile · 390 × 844 | [Voir](before/mobile.png) | [Voir](after/mobile.png) |

Les PNG couvrent la page entière : la barre fixe apparaît à la hauteur du premier
viewport, pas à la fin du contenu. Les captures « avant » ont été prises avant
les modifications de cette branche. Pour les régénérer, utiliser le code de base
avec le même scénario de capture et les mêmes fixtures.

## Vérifications

- **20/20 scénarios Chromium** avec les captures activées : filtres, recherche
  sans accents, historique long, suppression confirmée, restauration du focus,
  navigation clavier, ressources archivées, états vide/chargement/erreur,
  réessai, pause, anglais, mouvement réduit et écran tactile émulé.
- **0 débordement horizontal** de l’accueil à 320, 390, 768, 834, 1024 et 1440 px,
  y compris avec un pseudo long sans espaces.
- Navigation et largeur des pages mallettes, presets, statistiques et compte
  vérifiées à 834 et 1024 px.
- Cibles des filtres ≥ 44 px ; commandes console/suppression contrôlées sur
  écran tactile émulé. Console visible dans le premier viewport à 390 × 844.
- **Build web / typecheck : OK.** **48/48 tests du domaine : OK.**
- Le build garde ses avertissements de bundle > 500 kB et de sourcemap Tailwind.

Les requêtes de ces tests UI sont toutes interceptées par Playwright : pas de
base de données nécessaire, pas de modification des données de démonstration
ou de production.

### Reproduire

Depuis la racine, avec les dépendances installées et Node 24 :

```bash
# Terminal 1 : prévisualisation isolée, proxy vers l’API de développement seulement
API_PROXY_TARGET=http://127.0.0.1:4100 pnpm --filter @pokero/web dev --port 5174 --strictPort

# Terminal 2 : tests UI sans API nécessaire (toutes les requêtes sont simulées)
E2E_BASE_URL=http://127.0.0.1:5174 pnpm --filter @pokero/web test:e2e e2e/dashboard-ui.spec.ts

# Inclure la génération des captures après
E2E_BASE_URL=http://127.0.0.1:5174 UI_SCREENSHOT_DIR=../../docs/ui/refresh/after pnpm --filter @pokero/web test:e2e e2e/dashboard-ui.spec.ts
```

Sans `UI_SCREENSHOT_DIR`, seul le scénario de génération des captures est ignoré.

## Suites recommandées, non implémentées ici

1. **Assistant de tournoi** : résumé persistant de la cave et de la durée,
   paramètres avancés repliables, progression plus compacte sur mobile. À traiter
   après intégration des modifications fonctionnelles déjà en cours.
2. **Console live** : rapprocher la gestion des joueurs du chrono sur mobile,
   tout en séparant clairement les commandes courantes des actions irréversibles.
3. **Mallettes et presets** : filtres communs, recherche si la collection grandit,
   et libellés plus pédagogiques (« formats » en complément de « presets »).
4. **Performance perçue** : découpage des routes pour réduire le JavaScript initial.
5. **Validation utilisateur** : observer un organisateur créer une soirée puis
   éliminer un joueur ; mesurer les hésitations avant d’aller plus loin.

Ces pistes reposent sur la lecture du code et des captures existantes, pas sur
des entretiens utilisateur. Cette itération valide principalement l’accueil et
la coquille partagée. Les anciens scénarios métier nécessitant l’API n’ont pas
été rejoués. Pas de certification WCAG, d’audit axe ni de test sur appareil réel
ou lecteur d’écran ; les contrastes des tokens ne sont pas remesurés ici.
