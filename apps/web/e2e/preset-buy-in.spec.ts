import { expect, test, type Page } from '@playwright/test';
import { mockDashboard } from './fixtures/dashboard';

async function mockPresetEditor(page: Page) {
  await mockDashboard(page);
  const writes: Array<{ config: { buyIn: { targetBuyIn: number; startingStack: number } } }> = [];
  let saved: Record<string, unknown> | null = null;
  await page.route('**/api/presets**', async (route) => {
    const method = route.request().method();
    if (method === 'POST' || method === 'PATCH') {
      const payload = route.request().postDataJSON();
      writes.push(payload);
      saved = { ...payload, id: 'saved', archived: false, versionsCount: writes.length };
      await route.fulfill({ status: method === 'POST' ? 201 : 200, json: { preset: saved } });
    } else if (new URL(route.request().url()).pathname === '/api/presets/saved') {
      await route.fulfill({ json: { preset: saved } });
    } else {
      await route.fulfill({ json: { presets: saved ? [saved] : [] } });
    }
  });
  return writes;
}

test('la valeur de cave du preset peut être effacée puis ressaisie sur mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPresetEditor(page);
  await page.goto('/presets/nouveau');
  const buyIn = page.getByLabel('Valeur de la cave', { exact: true });
  await expect(buyIn).toHaveValue('10000');
  await buyIn.fill('');
  await expect(buyIn).toHaveValue('');
  await buyIn.pressSequentially('2800');
  await expect(buyIn).toHaveValue('2800');
});

test('les caves entières sont valides et les deux boutons enregistrent la valeur exacte', async ({
  page,
}) => {
  const writes = await mockPresetEditor(page);
  await page.goto('/presets/nouveau');
  await page.getByLabel('Nom du preset', { exact: true }).fill('Format entre amis');
  const buyIn = page.getByLabel('Valeur de la cave', { exact: true });
  expect(await buyIn.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(true);
  await buyIn.fill('2800');
  expect(await buyIn.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(true);
  await page.getByRole('button', { name: 'Créer le preset', exact: true }).click();
  await expect(page).toHaveURL(/\/presets\/saved$/);
  expect(writes[0]?.config.buyIn).toMatchObject({ targetBuyIn: 2800, startingStack: 2800 });
  await page.reload();
  await expect(buyIn).toHaveValue('2800');
  await buyIn.fill('1375');
  expect(await buyIn.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(true);
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText('Preset enregistré.', { exact: true })).toBeVisible();
  expect(writes[1]?.config.buyIn).toMatchObject({ targetBuyIn: 1375, startingStack: 1375 });
  await page.reload();
  await expect(buyIn).toHaveValue('1375');
});

test('le bouton du haut refuse une cave vide, négative ou non entière', async ({ page }) => {
  const writes = await mockPresetEditor(page);
  await page.goto('/presets/nouveau');
  await page.getByLabel('Nom du preset', { exact: true }).fill('Format invalide');
  const buyIn = page.getByLabel('Valeur de la cave', { exact: true });
  for (const value of ['', '-5', '12.5']) {
    await buyIn.fill(value);
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Indiquez une valeur de cave entière et positive.',
    );
    expect(writes).toHaveLength(0);
  }
});
