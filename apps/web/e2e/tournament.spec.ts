import { expect, test } from '@playwright/test';

const stamp = Date.now().toString(36);
const account = {
  displayName: `E2E ${stamp.slice(-4)}`,
  email: `e2e-${stamp}@pokero.test`,
  password: 'PokeroE2E2026!',
};
const chipCaseName = `Mallette E2E ${stamp.slice(-4)}`;
const tournamentName = `Tournoi E2E ${stamp.slice(-4)}`;
const players = ['Alice', 'Bob', 'Carol'];

test.describe.configure({ mode: 'serial' });

test('parcours organisateur complet : compte, mallette, tournoi, spectateur, suppression', async ({
  page,
  context,
}) => {
  // --- Inscription -------------------------------------------------------
  await page.goto('/inscription');
  await page.locator('#displayName').fill(account.displayName);
  await page.locator('#email').fill(account.email);
  await page.locator('#password').fill(account.password);
  await page.locator('#confirm').fill(account.password);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: `Bonjour ${account.displayName}` })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Aucun tournoi pour le moment.' }),
  ).toBeVisible();

  // --- Mallette de jetons ------------------------------------------------
  await page.goto('/mallettes/nouvelle');
  await page.locator('#case-name').fill(chipCaseName);
  await page.getByRole('button', { name: 'Enregistrer' }).click();

  await expect(page.getByText('Mallette créée.')).toBeVisible();
  await expect(page).toHaveURL(/\/mallettes\/[^/]+$/);
  await expect(page.getByRole('heading', { name: 'Modifier la mallette' })).toBeVisible();
  await expect(page.getByText('Jetons', { exact: true })).toBeVisible();

  // --- Création du tournoi ----------------------------------------------
  await page.goto('/tournois/nouveau');
  await page.locator('input[placeholder="Tournoi du vendredi"]').fill(tournamentName);
  await page.locator('select').first().selectOption({ label: chipCaseName });
  await page.getByRole('button', { name: 'Suivant' }).click();

  // Étape caves : la distribution doit être calculable avec le stock de la mallette.
  await expect(page.getByText('Distribution des caves')).toBeVisible();
  await expect(page.getByText('Valeur exacte')).toBeVisible();
  await expect(page.getByText('par joueur', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Rebuys possibles avec ce stock/)).toBeVisible();
  await page.getByRole('button', { name: 'Suivant' }).click();

  // Étape structure : premier niveau distinct, prévisualisation générée côté client.
  await expect(page.getByText('Aperçu de la structure')).toBeVisible();
  await page.locator('#first-level-duration').fill('40');
  await expect(page.locator('table tbody tr').first().getByText('40 min')).toBeVisible();
  await expect(page.getByText(/niveaux de jeu/)).toBeVisible();
  await page.getByRole('button', { name: 'Suivant' }).click();

  // Étape options : classement public et PIN.
  await expect(page.getByText('Affichage & sécurité')).toBeVisible();
  await page.getByRole('switch', { name: 'Classement public' }).click();
  await page.locator('#tournament-pin').fill('1234');
  await page.getByRole('button', { name: 'Créer' }).click();

  await expect(page.getByRole('heading', { name: tournamentName })).toBeVisible();
  await expect(page.locator('.badge', { hasText: 'Brouillon' })).toBeVisible();

  // Le champ PIN du dialogue de déverrouillage doit recevoir le focus et la saisie.
  await expect(page.getByText('Ce tournoi est protégé par un PIN.')).toBeVisible();
  await page.getByRole('button', { name: 'Déverrouiller' }).click();
  const pinDialog = page.getByRole('dialog', { name: 'Déverrouiller' });
  const pinInput = pinDialog.locator('#tournament-pin-unlock');
  await expect(pinInput).toBeFocused();
  await pinInput.fill('1234');
  await pinDialog.getByRole('button', { name: 'Déverrouiller' }).click();
  await expect(
    page.getByText('Tournoi déverrouillé pour 30 minutes', { exact: true }),
  ).toBeVisible();

  // --- Joueurs -----------------------------------------------------------
  for (const player of players) {
    await page.getByPlaceholder('Nom du joueur').fill(player);
    await page.getByRole('button', { name: 'Ajouter un joueur' }).click();
    await expect(page.getByText(player, { exact: true })).toBeVisible();
  }

  // --- Démarrage du chronomètre ----------------------------------------
  await page.getByRole('button', { name: 'Démarrer le tournoi' }).click();
  await expect(page.locator('.badge', { hasText: 'En cours' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mettre en pause' })).toBeVisible();

  // --- Éliminations jusqu'au vainqueur ---------------------------------
  const eliminateButtons = page.getByRole('button', { name: 'Éliminer' });
  await expect(eliminateButtons).toHaveCount(3);

  await eliminateButtons.first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Éliminer' }).click();
  await expect(page.getByText('Élimination enregistrée.')).toBeVisible();
  await expect(eliminateButtons).toHaveCount(2);

  await eliminateButtons.first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Éliminer' }).click();
  await expect(eliminateButtons).toHaveCount(1);

  // --- Clôture -----------------------------------------------------------
  await page.getByRole('button', { name: 'Déclarer le vainqueur' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Clôturer' }).click();
  await expect(page.locator('.badge', { hasText: 'Terminé' })).toBeVisible();
  await page.getByRole('tab', { name: 'Classement' }).click();
  await expect(page.getByRole('heading', { name: 'Classement' })).toBeVisible();

  // --- Lien spectateur ---------------------------------------------------
  await page.getByRole('button', { name: 'Partage' }).click();
  const shareDialog = page.getByRole('dialog', { name: 'Partage' });
  await expect(shareDialog).toBeVisible();
  await shareDialog.getByRole('button', { name: 'Créer un lien spectateur' }).click();

  const spectatorLink = shareDialog.locator('a[href*="/spectateur/"]').first();
  await expect(spectatorLink).toBeVisible();
  const spectatorUrl = await spectatorLink.getAttribute('href');
  expect(spectatorUrl).toBeTruthy();

  const spectator = await context.newPage();
  await spectator.goto(spectatorUrl!);
  await expect(spectator.getByRole('heading', { name: tournamentName })).toBeVisible();
  await expect(spectator.getByText('Terminé', { exact: true })).toBeVisible();
  await expect(spectator.getByRole('heading', { name: 'Classement' })).toBeVisible();

  const rankingSection = spectator.locator('section').filter({ hasText: 'Classement' });
  await expect(rankingSection.getByText('Carol', { exact: true })).toBeVisible();
  await expect(spectator.getByText(/Lien spectateur en lecture seule/)).toBeVisible();

  // Un lien inconnu est refusé proprement.
  const invalid = await context.newPage();
  await invalid.goto('/spectateur/lien-invalide');
  await expect(
    invalid.getByText('Ce lien spectateur est invalide ou a été révoqué.'),
  ).toBeVisible();
  await invalid.close();
  await spectator.close();

  // --- Suppression du compte (RGPD) ------------------------------------
  await page.goto('/compte');
  await page.getByRole('tab', { name: 'Données' }).click();
  await page.getByRole('button', { name: 'Supprimer mon compte' }).click();
  const deleteForm = page.locator('form').filter({ has: page.getByPlaceholder('SUPPRIMER') });
  await deleteForm.locator('input[type="password"]').fill(account.password);
  await deleteForm.getByPlaceholder('SUPPRIMER').fill('SUPPRIMER');
  await deleteForm.getByRole('button', { name: 'Confirmer' }).click();

  await expect(page).toHaveURL(/\/connexion$/);
  await page.locator('#email').fill(account.email);
  await page.locator('#password').fill(account.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByText('Email ou mot de passe incorrect.').or(page.getByText(/incorrect/i))).toBeVisible();
});
