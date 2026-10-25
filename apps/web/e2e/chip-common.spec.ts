import { expect, test } from '@playwright/test';

const stamp = Date.now().toString(36);
const account = {
  displayName: `Jetons ${stamp.slice(-4)}`,
  email: `chips-${stamp}@pokero.test`,
  password: 'PokeroChips2026!',
};

test('la quantité commune de jetons reste cohérente et réversible', async ({ page }) => {
  await page.goto('/inscription');
  await page.locator('#displayName').fill(account.displayName);
  await page.locator('#email').fill(account.email);
  await page.locator('#password').fill(account.password);
  await page.locator('#confirm').fill(account.password);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/mallettes/nouvelle');
  await page.locator('#case-name').fill(`Mallette jetons ${stamp.slice(-4)}`);
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Mallette créée.')).toBeVisible();

  await page.goto('/tournois/nouveau');
  await page.locator('#tournament-name').fill('Test quantité commune');
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByRole('tab', { name: 'Manuel' }).click();

  const toggles = page.getByRole('checkbox', { name: /Même nombre de jetons/ });
  await expect(toggles).toHaveCount(5);

  const commonCount = page.locator('#common-chip-count');
  await commonCount.fill('12');

  const white = page.getByLabel('Quantité par joueur pour Blanc');
  const red = page.getByLabel('Quantité par joueur pour Rouge');
  await toggles.nth(0).check();
  await toggles.nth(1).check();

  await expect(white).toHaveValue('12');
  await expect(white).toBeDisabled();
  await expect(red).toHaveValue('12');
  await expect(red).toBeDisabled();
  await expect(page.getByText('2 / 5 jetons suivent la quantité commune')).toBeVisible();

  // Décocher rend la quantité spécifique et conserve la valeur saisie.
  await toggles.nth(0).uncheck();
  await expect(white).toBeEnabled();
  await expect(white).toHaveValue('0');
  await white.fill('7');

  await toggles.nth(0).check();
  await expect(white).toBeDisabled();
  await toggles.nth(0).uncheck();
  await expect(white).toHaveValue('7');

  // Une quantité démesurée déclenche l'alerte de stock sans bloquer la saisie.
  await commonCount.fill('999999');
  await expect(page.getByText(/stock insuffisant/).first()).toBeVisible();

  // Nettoyage : le compte de test ne doit pas rester en base.
  await page.goto('/compte');
  await page.getByRole('tab', { name: 'Données' }).click();
  await page.getByRole('button', { name: 'Supprimer mon compte' }).click();
  const deleteForm = page.locator('form').filter({ has: page.getByPlaceholder('SUPPRIMER') });
  await deleteForm.locator('input[type="password"]').fill(account.password);
  await deleteForm.getByPlaceholder('SUPPRIMER').fill('SUPPRIMER');
  await deleteForm.getByRole('button', { name: 'Confirmer' }).click();
  await expect(page).toHaveURL(/\/connexion$/);
});
