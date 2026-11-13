import type { Page } from '@playwright/test';
import type { ChipCase, ClockView, MyStats, Preset, TournamentSummary } from '../../src/lib/types';

export const tournaments: TournamentSummary[] = [
  ['live', 'La table du vendredi', 'RUNNING'],
  ['draft', 'Prochaine soirée entre amis', 'DRAFT'],
  ['ready', 'Le club du dimanche', 'READY'],
  ['recovery', 'Partie à récupérer', 'RECOVERY_PENDING'],
  ...Array.from({ length: 8 }, (_, index) => [
    `completed-${index}`,
    index === 7 ? 'Été au jardin' : `Soirée du club ${index + 1}`,
    'COMPLETED',
  ]),
  ['cancelled', 'Soirée annulée', 'CANCELLED'],
].map(([id, name, status]) => ({
  id: id!,
  name: name!,
  status: status as TournamentSummary['status'],
  publicRanking: true,
  participantsCount: 8,
  createdAt: '2026-11-12T18:00:00Z',
  startedAt: status === 'DRAFT' || status === 'READY' ? null : '2026-11-13T19:00:00Z',
  completedAt: status === 'COMPLETED' ? '2026-11-13T22:00:00Z' : null,
  clockVersion: 1,
}));

export const clock: ClockView = {
  status: 'RUNNING',
  version: 1,
  serverNow: Date.now(),
  segmentIndex: 3,
  levelPosition: 3,
  playLevelNumber: 4,
  kind: 'PLAY',
  smallBlind: 100,
  bigBlind: 200,
  ante: 25,
  remainingMs: 754_000,
  segmentDurationMs: 1_200_000,
  elapsedInSegmentMs: 446_000,
  endsAt: null,
  accumulatedPlayMs: 4_046_000,
  totalPlayLevels: 12,
  structureExhausted: false,
  upcoming: [
    {
      index: 4,
      kind: 'PLAY',
      durationMs: 1_200_000,
      playLevelNumber: 5,
      levelPosition: 4,
      smallBlind: 150,
      bigBlind: 300,
      ante: 25,
    },
  ],
};

export const chipCase: ChipCase = {
  id: 'case',
  name: 'La mallette du club',
  description: null,
  archived: false,
  createdAt: '2026-11-01T18:00:00Z',
  updatedAt: '2026-11-12T18:00:00Z',
  tournamentsCount: 4,
  chipTypes: [
    {
      id: 'white',
      label: 'Blanc',
      color: '#eee9db',
      value: 25,
      quantity: 200,
      freeQuantity: 120,
      position: 0,
    },
    {
      id: 'red',
      label: 'Rouge',
      color: '#c85c4e',
      value: 100,
      quantity: 200,
      freeQuantity: 160,
      position: 1,
    },
    {
      id: 'green',
      label: 'Vert',
      color: '#2c8a66',
      value: 500,
      quantity: 100,
      freeQuantity: 80,
      position: 2,
    },
    {
      id: 'black',
      label: 'Noir',
      color: '#33403a',
      value: 1000,
      quantity: 100,
      freeQuantity: 100,
      position: 3,
    },
  ],
};

const preset: Preset = {
  id: 'preset',
  name: 'Entre amis · 3 heures',
  description: 'Notre format habituel',
  config: {},
  defaultChipCaseId: 'case',
  archived: false,
  versionsCount: 2,
  createdAt: '2026-11-01T18:00:00Z',
  updatedAt: '2026-11-12T18:00:00Z',
};

const stats: MyStats = {
  totals: { played: 12, wins: 3, podiums: 7 },
  results: [],
  participations: [],
};

export async function mockDashboard(
  page: Page,
  options: {
    empty?: boolean;
    failed?: string[];
    paused?: boolean;
    displayName?: string;
    locale?: 'fr' | 'en';
    delayed?: string[];
    archived?: boolean;
    noLive?: boolean;
  } = {},
) {
  let items = options.empty
    ? []
    : tournaments
        .filter((tournament) => !options.noLive || tournament.id !== 'live')
        .map((tournament) =>
          options.paused && tournament.id === 'live'
            ? { ...tournament, status: 'PAUSED' }
            : tournament,
        );

  await page.addInitScript(
    (locale) => localStorage.setItem('pokero.locale', locale),
    options.locale ?? 'fr',
  );
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (options.delayed?.includes(path)) return;
    if (options.failed?.includes(path)) {
      await route.fulfill({
        status: 503,
        json: { error: { code: 'HTTP_ERROR', message: 'Service indisponible.' } },
      });
      return;
    }
    if (route.request().method() === 'DELETE') {
      items = items.filter((item) => path !== `/api/tournaments/${item.id}`);
      await route.fulfill({ status: 204 });
      return;
    }
    const responses: Record<string, unknown> = {
      '/api/auth/me': {
        user: {
          id: 'demo',
          email: 'demo@pokero.test',
          displayName: options.displayName ?? 'Camille',
          role: 'USER',
          locale: options.locale ?? 'fr',
          publicProfile: false,
          publicResults: false,
          emailVerified: true,
        },
      },
      '/api/tournaments': { tournaments: items },
      '/api/tournaments/live': {
        tournament: {
          id: 'live',
          clock: { ...clock, status: options.paused ? 'PAUSED' : 'RUNNING', serverNow: Date.now() },
          activePlayers: 6,
          settings: { buyIn: { targetBuyIn: 10000 } },
        },
      },
      '/api/chip-cases': {
        chipCases: options.empty ? [] : [{ ...chipCase, archived: options.archived ?? false }],
      },
      '/api/presets': {
        presets: options.empty ? [] : [{ ...preset, archived: options.archived ?? false }],
      },
      '/api/stats/me': options.empty
        ? { ...stats, totals: { played: 0, wins: 0, podiums: 0 } }
        : stats,
    };
    await route.fulfill({ status: path in responses ? 200 : 404, json: responses[path] ?? {} });
  });
}
