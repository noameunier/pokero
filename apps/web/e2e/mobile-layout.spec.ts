import { expect, test } from '@playwright/test';

const stamp = Date.now().toString(36);
const account = {
  displayName: `Mobile ${stamp.slice(-4)}`,
  email: `mobile-${stamp}@pokero.test`,
  password: 'PokeroMobile2026!',
};

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  locale: 'fr-FR',
});

test('la saisie des valeurs et quantités reste lisible sur mobile', async ({ page }) => {
  await page.goto('/inscription');
  await page.locator('#displayName').fill(account.displayName);
  await page.locator('#email').fill(account.email);
  await page.locator('#password').fill(account.password);
  await page.locator('#confirm').fill(account.password);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/mallettes/nouvelle');
  await expect(page.getByRole('heading', { name: 'Jetons' })).toBeVisible();

  const quantities = page.getByLabel('Quantité', { exact: true });
  const values = page.getByLabel('Valeur', { exact: true });
  await expect(quantities).toHaveCount(5);
  await expect(values).toHaveCount(5);

  for (let index = 0; index < 5; index += 1) {
    const quantityBox = await quantities.nth(index).boundingBox();
    const valueBox = await values.nth(index).boundingBox();
    expect(quantityBox?.width ?? 0).toBeGreaterThan(100);
    expect(valueBox?.width ?? 0).toBeGreaterThan(100);
    expect(quantityBox?.height ?? 0).toBeGreaterThan(30);
    expect(valueBox?.height ?? 0).toBeGreaterThan(30);
  }

  // La valeur saisie reste entièrement visible et lisible.
  await quantities.first().fill('123456');
  await expect(quantities.first()).toHaveValue('123456');

  // Nettoyage : le compte de test ne doit pas rester en base.
  await page.goto('/compte');
  await page.getByRole('button', { name: 'Supprimer mon compte' }).click();
  const deleteForm = page.locator('form').filter({ has: page.getByPlaceholder('SUPPRIMER') });
  await deleteForm.locator('input[type="password"]').fill(account.password);
  await deleteForm.getByPlaceholder('SUPPRIMER').fill('SUPPRIMER');
  await deleteForm.getByRole('button', { name: 'Confirmer' }).click();
  await expect(page).toHaveURL(/\/connexion$/);
});
