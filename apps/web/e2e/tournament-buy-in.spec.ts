import { expect, test } from '@playwright/test';

const stamp = Date.now().toString(36);
const account = {
  displayName: `Cave ${stamp.slice(-4)}`,
  email: `cave-${stamp}@pokero.test`,
  password: 'PokeroCave2026!',
};

test('la valeur de cave est modifiable et propose une valeur réalisable', async ({ page }) => {
  await page.goto('/inscription');
  await page.locator('#displayName').fill(account.displayName);
  await page.locator('#email').fill(account.email);
  await page.locator('#password').fill(account.password);
  await page.locator('#confirm').fill(account.password);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page).toHaveURL(/\/$/);

  // Une mallette avec les valeurs par défaut suffit pour tester la proposition.
  await page.goto('/mallettes/nouvelle');
  await page.locator('#case-name').fill('Mallette cave');
  await page.getByRole('button', { name: 'Créer la mallette' }).click();
  await expect(page.getByText('Mallette créée.')).toBeVisible();
  await expect(page).toHaveURL(/\/mallettes\/[^/]+$/);
  const chipCaseUrl = page.url();

  await page.goto('/tournois/nouveau');
  await page.locator('input[placeholder="Tournoi du vendredi"]').fill('Test valeur de cave');
  await page.locator('select').first().selectOption({ label: 'Mallette cave' });
  await page.getByRole('button', { name: 'Suivant' }).click();

  const target = page.locator('#target-buy-in');
  await expect(target).toHaveValue('10000');

  // Le champ doit accepter d’être vidé avant de saisir une nouvelle valeur.
  await target.focus();
  await target.press('Control+A');
  await target.press('Backspace');
  await expect(target).toHaveValue('');
  await target.type('2801', { delay: 25 });
  await expect(target).toHaveValue('2801');

  // La proposition utilise une valeur réellement réalisable avec le stock.
  const field = target.locator('..');
  const suggestion = field.getByRole('button', { name: /2\s?800/ });
  await expect(suggestion).toBeVisible({ timeout: 20_000 });
  await suggestion.click();
  await expect(target).toHaveValue('2800');
  await expect(field.getByText('Valeur réalisable avec cette mallette.')).toBeVisible();
  await expect(page.getByText('Valeur exacte').first()).toBeVisible();

  // Nettoyage.
  await page.goto(chipCaseUrl);
  await expect(page.getByRole('heading', { name: 'Modifier la mallette' })).toBeVisible();
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
  await expect(page).toHaveURL(/\/mallettes$/);
});
