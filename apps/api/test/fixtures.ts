import type { TestClient } from './helpers.ts';
import { request } from './helpers.ts';

export const CHIP_TYPES = [
  { label: 'Blanc', color: '#FFFFFF', value: 25, quantity: 600 },
  { label: 'Rouge', color: '#FF0000', value: 100, quantity: 500 },
  { label: 'Vert', color: '#00AA00', value: 500, quantity: 300 },
  { label: 'Noir', color: '#111111', value: 1000, quantity: 200 },
  { label: 'Violet', color: '#8800AA', value: 5000, quantity: 80 },
];

export const BUY_IN = {
  players: 6,
  targetBuyIn: 10_000,
  startingStack: 10_000,
  mode: 'AUTO' as const,
  counts: {},
  commonEnabled: {},
  commonCount: 0,
  maxChipsPerPlayer: 60,
};

export const BLINDS = {
  autoGenerate: true,
  targetDurationMinutes: 60,
  levelDurationMinutes: 10,
  breakDurationMinutes: 5,
  breakEveryLevels: 3,
  roundUnit: 25,
  anteFromLevel: 3,
  antePercentOfBigBlind: 0.125,
};

export async function createChipCase(
  client: TestClient,
  overrides: { name?: string; chipTypes?: typeof CHIP_TYPES } = {},
): Promise<string> {
  const response = await request(client, {
    method: 'POST',
    url: '/api/chip-cases',
    payload: {
      name: overrides.name ?? 'Mallette test',
      chipTypes: overrides.chipTypes ?? CHIP_TYPES,
    },
  });
  if (response.statusCode !== 201) {
    throw new Error(`Création mallette échouée: ${response.statusCode} ${response.body}`);
  }
  return (response.json() as { chipCase: { id: string } }).chipCase.id;
}

export async function createTournament(
  client: TestClient,
  chipCaseId: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; body: Record<string, unknown> }> {
  const response = await request(client, {
    method: 'POST',
    url: '/api/tournaments',
    payload: {
      name: 'Tournoi test',
      chipCaseId,
      buyIn: BUY_IN,
      blinds: BLINDS,
      rebuy: { enabled: true, unlimited: true, maxPerPlayer: null, value: null, untilLevel: 6 },
      addOn: { enabled: false, value: null, atLevel: null, limitPerPlayer: 1 },
      publicRanking: true,
      ...overrides,
    },
  });
  if (response.statusCode !== 201) {
    throw new Error(`Création tournoi échouée: ${response.statusCode} ${response.body}`);
  }
  const body = response.json() as { tournament: { id: string } };
  return { id: body.tournament.id, body: body as unknown as Record<string, unknown> };
}

export async function addParticipants(
  client: TestClient,
  tournamentId: string,
  names: string[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const displayName of names) {
    const response = await request(client, {
      method: 'POST',
      url: `/api/tournaments/${tournamentId}/participants`,
      payload: { displayName },
    });
    if (response.statusCode !== 201) {
      throw new Error(`Ajout participant échoué: ${response.statusCode} ${response.body}`);
    }
    ids.push((response.json() as { participantId: string }).participantId);
  }
  return ids;
}

export async function clockCommand(
  client: TestClient,
  tournamentId: string,
  command: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return request(client, {
    method: 'POST',
    url: `/api/tournaments/${tournamentId}/clock`,
    payload: command,
    headers,
  });
}

export function idempotencyKey(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
