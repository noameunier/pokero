import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { mockDashboard } from './fixtures/dashboard';

test('filtrer, rechercher sans accents et retrouver les tournois au-delà du sixième', async ({
  page,
}) => {
  await mockDashboard(page);
  await page.goto('/');
  const collection = page.getByRole('region', { name: 'Vos tournois', exact: true });
  await expect(collection.getByRole('listitem')).toHaveCount(6);
  await collection.getByRole('button', { name: 'À venir 3' }).click();
  await expect(collection.getByRole('listitem')).toHaveCount(3);
  await expect(collection.getByText('Partie à récupérer')).toBeVisible();
  await collection.getByRole('button', { name: 'Historique 9' }).click();
  await expect(collection.getByRole('listitem')).toHaveCount(6);
  await collection.getByRole('button', { name: 'Afficher plus de tournois' }).click();
  await expect(collection.getByRole('listitem')).toHaveCount(9);
  await expect(collection.getByText('Été au jardin')).toBeVisible();
  await page.getByRole('searchbox').fill('ete');
  await expect(collection.getByRole('listitem')).toHaveCount(1);
  await expect(collection.getByText('Été au jardin')).toBeVisible();
  await page.getByRole('searchbox').fill('introuvable');
  await expect(collection.getByText('Aucun tournoi ne correspond à ces filtres.')).toBeVisible();
  await collection.getByRole('button', { name: 'Réinitialiser les filtres' }).click();
  await expect(page.getByRole('searchbox')).toHaveValue('');
  await expect(collection.getByRole('button', { name: 'Tous 13' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

for (const width of [320, 390, 768, 834, 1024, 1440]) {
  test(`navigation et mise en page à ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockDashboard(page, { displayName: 'UnPseudoTrèsLongSansEspacesQuiDoitResterLisible' });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'La table du vendredi' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);
    const navigation = page.getByRole('navigation', {
      name: width < 1024 ? 'Navigation mobile' : 'Navigation principale',
    });
    await expect(navigation).toBeVisible();
    const presetsLink =
      width < 1024
        ? page.locator('header').getByRole('link', { name: 'Presets', exact: true })
        : navigation.getByRole('link', { name: 'Presets', exact: true });
    await expect(presetsLink).toBeVisible();
    await expect(presetsLink).toHaveAttribute('href', '/presets');
    const consoleLink = page.getByRole('link', { name: 'Ouvrir la console' });
    await expect(consoleLink).toHaveAttribute('href', '/tournois/live');
    await expect(page.getByRole('link', { name: 'Mode projection' })).toHaveAttribute(
      'href',
      '/projection/live',
    );
    const filters = page.getByRole('group', { name: 'Filtrer les tournois' });
    for (const button of await filters.getByRole('button').all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    const headerBounds = await page
      .locator('header')
      .first()
      .evaluate((header) => {
        const bounds = header.getBoundingClientRect();
        return Array.from(header.querySelectorAll('a, button'))
          .filter((element) => element.getBoundingClientRect().width > 0)
          .every((element) => {
            const rect = element.getBoundingClientRect();
            return rect.left >= bounds.left && rect.right <= bounds.right;
          });
      });
    expect(headerBounds).toBe(true);
    if (width < 640) {
      const draft = page.getByRole('listitem').filter({ hasText: 'Prochaine soirée entre amis' });
      await expect(draft.getByText('Brouillon', { exact: true }).first()).toBeVisible();
    }
  });
}

test('un nouvel organisateur voit une seule action de démarrage contextualisée', async ({
  page,
}) => {
  await mockDashboard(page, { empty: true });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Aucun tournoi pour le moment.' })).toBeVisible();
  await expect(page.locator('main .btn-primary')).toHaveCount(1);
  await expect(page.locator('main .btn-primary')).toHaveAttribute('href', '/mallettes/nouvelle');
  await expect(page.getByRole('searchbox')).toHaveCount(0);
});

test('une mallette existante permet de créer directement son premier tournoi', async ({ page }) => {
  await mockDashboard(page);
  await page.route('**/api/tournaments', (route) => route.fulfill({ json: { tournaments: [] } }));
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Créez votre premier tournoi' })).toHaveAttribute(
    'href',
    '/tournois/nouveau',
  );
});

test('les ressources archivées ne sont pas proposées pour la prochaine soirée', async ({
  page,
}) => {
  await mockDashboard(page, { archived: true });
  await page.goto('/');
  const preparation = page.getByRole('complementary', { name: 'La prochaine soirée' });
  await expect(preparation.getByRole('link', { name: 'Nouvelle mallette' })).toBeVisible();
  await expect(preparation.getByRole('link', { name: 'Nouveau preset' })).toBeVisible();
  await expect(preparation.getByText('La mallette du club')).toHaveCount(0);
});

test('sans tournoi en cours, la création redevient l’action principale', async ({ page }) => {
  await mockDashboard(page, { noLive: true });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Vos tournois', exact: true })).toBeVisible();
  await expect(page.getByRole('timer')).toHaveCount(0);
  await expect(page.locator('main .btn-primary')).toHaveAttribute('href', '/tournois/nouveau');
});

test('les chargements secondaires ne sont pas présentés comme des ressources vides', async ({
  page,
}) => {
  await mockDashboard(page, { delayed: ['/api/chip-cases', '/api/presets', '/api/stats/me'] });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'La table du vendredi' })).toBeVisible();
  const preparation = page.getByRole('complementary', { name: 'La prochaine soirée' });
  await expect(preparation.locator('[aria-hidden="true"].animate-pulse')).toHaveCount(3);
  await expect(preparation.getByRole('link', { name: 'Nouvelle mallette' })).toHaveCount(0);
  await expect(preparation.getByRole('definition')).toHaveCount(0);
});

test('la navigation tient aussi sur les autres pages à 834 et 1024px', async ({ page }) => {
  await mockDashboard(page);
  for (const width of [834, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/mallettes', '/presets', '/statistiques', '/compte']) {
      await page.goto(path);
      await expect(page.locator('main h1')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBe(0);
      await expect(
        page.getByRole('navigation', {
          name: width < 1024 ? 'Navigation mobile' : 'Navigation principale',
        }),
      ).toBeVisible();
    }
  }
});

test.describe('écran tactile', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('la console et les commandes restent accessibles sans débordement', async ({ page }) => {
    await mockDashboard(page);
    await page.goto('/');
    const consoleLink = page.getByRole('link', { name: 'Ouvrir la console' });
    await expect(consoleLink).toBeInViewport();
    expect((await consoleLink.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const deleteButton = page.getByRole('button', {
      name: 'Supprimer Prochaine soirée entre amis',
    });
    expect((await deleteButton.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);
  });
});

test('les erreurs secondaires ne deviennent pas de faux zéros et permettent de réessayer', async ({
  page,
}) => {
  await mockDashboard(page, {
    failed: ['/api/stats/me', '/api/presets', '/api/chip-cases', '/api/tournaments/live'],
  });
  await page.goto('/');
  await expect(page.getByText('Vos statistiques n’ont pas pu être chargées.')).toBeVisible();
  await expect(page.getByText('Vos presets n’ont pas pu être chargés.')).toBeVisible();
  await expect(page.getByText('Vos mallettes n’ont pas pu être chargées.')).toBeVisible();
  await expect(
    page.getByText('Chronomètre indisponible. Vous pouvez toujours ouvrir la console.'),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ouvrir la console' })).toBeVisible();
  await page.route('**/api/stats/me', (route) =>
    route.fulfill({
      json: { totals: { played: 5, wins: 2, podiums: 3 }, results: [], participations: [] },
    }),
  );
  const stats = page.getByRole('region', { name: 'Vos statistiques' });
  await stats.getByRole('button', { name: 'Réessayer' }).click();
  await expect(stats.getByRole('definition').first()).toHaveText('5');
});

test('chargement structuré et erreur principale récupérable', async ({ page }) => {
  await mockDashboard(page, { delayed: ['/api/tournaments'] });
  await page.goto('/');
  await expect(page.getByRole('status', { name: 'Chargement…' })).toBeVisible();
  await page.unroute('**/api/**');
  await mockDashboard(page, { failed: ['/api/tournaments'] });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Impossible de charger les données' }),
  ).toBeVisible();
  await page.route('**/api/tournaments', (route) => route.fulfill({ json: { tournaments: [] } }));
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Aucun tournoi pour le moment.' })).toBeVisible();
});

test('suppression confirmée, annulation et restitution du focus', async ({ page }) => {
  await mockDashboard(page);
  await page.goto('/');
  const deleteButton = page.getByRole('button', { name: 'Supprimer Prochaine soirée entre amis' });
  await deleteButton.click();
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(deleteButton).toBeFocused();
  await deleteButton.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer', exact: true }).click();
  await expect(page.getByText('Tournoi supprimé.', { exact: true })).toBeVisible();
  await expect(deleteButton).toHaveCount(0);
});

test('menu de compte au clavier et indicateur hors ligne sur mobile', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await mockDashboard(page);
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Menu du compte' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Tab');
  await expect(
    page.locator('#account-panel').getByRole('link', { name: 'Compte', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByRole('status', { name: 'Hors ligne' })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
});

test('accueil traduit en anglais, pause et mouvements réduits', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-11-13T19:00:00Z') });
  await mockDashboard(page, { locale: 'en', paused: true });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Hello Camille' })).toBeVisible();
  await expect(page.getByText('Friday 13 November', { exact: true })).toBeVisible();
  await expect(page.getByRole('timer')).toHaveText('12:34');
  await expect(page.locator('article .badge').getByText('Paused', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'History 9' })).toBeVisible();
  expect(
    await page
      .getByRole('link', { name: 'Open console' })
      .evaluate((element) => Number.parseFloat(getComputedStyle(element).transitionDuration)),
  ).toBeLessThan(0.001);
});

test('captures du tableau de bord', async ({ page }) => {
  test.skip(!process.env.UI_SCREENSHOT_DIR, 'Captures à la demande uniquement.');
  const directory = resolve(process.env.UI_SCREENSHOT_DIR!);
  await mkdir(directory, { recursive: true });
  await mockDashboard(page);
  await page.clock.install({ time: new Date('2026-11-13T19:00:00Z') });
  for (const [name, width, height] of [
    ['desktop', 1440, 1000],
    ['mobile', 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'La table du vendredi' })).toBeVisible();
    await expect(page.getByText('12:34', { exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: resolve(directory, `${name}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }
});
