import { expect, test } from '@playwright/test';

const stamp = Date.now().toString(36);
const account = {
  displayName: `UX ${stamp.slice(-4)}`,
  email: `ux-${stamp}@pokero.test`,
  password: 'PokeroUX2026!',
};

test('aperçu local et enregistrement en bas de page', async ({ page }) => {
  await page.goto('/inscription');
  await page.locator('#displayName').fill(account.displayName);
  await page.locator('#email').fill(account.email);
  await page.locator('#password').fill(account.password);
  await page.locator('#confirm').fill(account.password);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/mallettes/nouvelle');
  await page.locator('#case-name').fill('Mallette aperçu local');

  const quantities = page.getByLabel('Quantité', { exact: true });
  const values = page.getByLabel('Valeur', { exact: true });
  await expect(quantities).toHaveCount(5);

  // Toutes les quantités sont à zéro sauf celle du jeton blanc.
  for (let index = 0; index < 5; index += 1) {
    await quantities.nth(index).fill('0');
    await values.nth(index).fill(String((index + 1) * 100));
  }
  await quantities.nth(0).fill('1000');

  const preview = page.getByRole('heading', { name: 'Aperçu de cave' }).locator('..');
  await preview.getByRole('button', { name: 'Calculer la répartition' }).click();
  const counts = page.getByTestId('buyin-preview-counts');
  await expect(counts).toContainText('Blanc');
  await expect(counts).not.toContainText('Rouge');

  // Modification non enregistrée : l’aperçu doit devenir obsolète puis suivre les nouvelles valeurs.
  await quantities.nth(0).fill('0');
  await expect(preview.getByText(/Les valeurs ont changé/)).toBeVisible();
  await quantities.nth(1).fill('1000');
  await preview.getByRole('button', { name: 'Calculer la répartition' }).click();
  await expect(counts).toContainText('Rouge');
  await expect(counts).not.toContainText('Blanc');

  // Le bouton du bas enregistre sans remonter en haut.
  await page.getByRole('button', { name: 'Créer la mallette' }).click();
  await expect(page.getByText('Mallette créée.')).toBeVisible();
  await expect(page).toHaveURL(/\/mallettes\/[^/]+$/);
  await expect(page.getByRole('button', { name: 'Enregistrer les modifications' })).toBeVisible();

  // Nettoyage : la mallette de test ne reste pas dans l’inventaire.
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
  await expect(page).toHaveURL(/\/mallettes$/);
});
