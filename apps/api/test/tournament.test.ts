import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  addParticipants,
  clockCommand,
  createChipCase,
  createTournament,
  idempotencyKey,
} from './fixtures.ts';
import { closeApp, createApp, registerUser, request, truncateAll, type TestClient } from './helpers.ts';

let app: FastifyInstance;
let client: TestClient;

beforeAll(async () => {
  app = await createApp();
});

beforeEach(async () => {
  await truncateAll(app);
  client = await registerUser(app);
});

afterAll(async () => {
  await closeApp(app);
});

describe('tournois et inventaire', () => {
  it('crée un tournoi, réserve les jetons et expose la structure', async () => {
    const chipCaseId = await createChipCase(client);
    const { id, body } = await createTournament(client, chipCaseId);
    const tournament = (body.tournament as { id: string; status: string; levels: unknown[] }).id;
    expect(tournament).toBe(id);

    const detail = await request(client, { method: 'GET', url: `/api/tournaments/${id}` });
    expect(detail.statusCode).toBe(200);
    const payload = detail.json() as {
      tournament: { status: string; clock: { remainingMs: number; version: number } };
      allocations: Array<{ totalQuantity: number }>;
    };
    expect(payload.tournament.status).toBe('DRAFT');
    expect(payload.tournament.clock.remainingMs).toBe(600_000);
    expect(payload.tournament.clock.version).toBe(0);
    expect(payload.allocations.length).toBeGreaterThan(0);

    const reservations = await app.prisma.inventoryReservation.findMany({ where: { tournamentId: id } });
    expect(reservations.length).toBeGreaterThan(0);
    expect(reservations.every((reservation) => reservation.status === 'ACTIVE')).toBe(true);
  });

  it('refuse un tournoi qui dépasse le stock disponible', async () => {
    const chipCaseId = await createChipCase(client, {
      chipTypes: [
        { label: 'Blanc', color: '#FFFFFF', value: 25, quantity: 2 },
        { label: 'Rouge', color: '#FF0000', value: 100, quantity: 1 },
      ],
    });

    const response = await request(client, {
      method: 'POST',
      url: '/api/tournaments',
      payload: {
        name: 'Trop gros',
        chipCaseId,
        buyIn: { ...{ players: 6, targetBuyIn: 10_000, startingStack: 10_000, mode: 'AUTO', counts: {}, commonEnabled: {}, commonCount: 0, maxChipsPerPlayer: 60 } },
        blinds: {
          autoGenerate: true,
          targetDurationMinutes: 60,
          levelDurationMinutes: 10,
          breakDurationMinutes: 5,
          breakEveryLevels: 3,
          roundUnit: 25,
          anteFromLevel: 3,
          antePercentOfBigBlind: 0.125,
        },
      },
    });
    expect(response.statusCode).toBe(409);
    expect((response.json() as { error: { code: string } }).error.code).toBe('INSUFFICIENT_STOCK');
  });

  it('recalcule l’allocation à chaque participant et détecte les doublons', async () => {
    const chipCaseId = await createChipCase(client);
    const { id } = await createTournament(client, chipCaseId);
    const ids = await addParticipants(client, id, ['Alice', 'Bob', 'Chloé']);
    expect(new Set(ids).size).toBe(3);

    const duplicate = await request(client, {
      method: 'POST',
      url: `/api/tournaments/${id}/participants`,
      payload: { displayName: 'Alice' },
    });
    expect(duplicate.statusCode).toBe(409);

    const allocations = await app.prisma.chipAllocation.findMany({ where: { tournamentId: id } });
    expect(allocations.every((allocation) => allocation.players === 3)).toBe(true);
  });

  it('libère les jetons à la suppression d’un tournoi', async () => {
    const chipCaseId = await createChipCase(client);
    const { id } = await createTournament(client, chipCaseId);
    await addParticipants(client, id, ['Alice', 'Bob']);

    const before = await app.prisma.inventoryReservation.count({ where: { tournamentId: id, status: 'ACTIVE' } });
    expect(before).toBeGreaterThan(0);

    const removed = await request(client, { method: 'DELETE', url: `/api/tournaments/${id}` });
    expect(removed.statusCode).toBe(204);
    const after = await app.prisma.inventoryReservation.count({ where: { tournamentId: id, status: 'ACTIVE' } });
    expect(after).toBe(0);
  });

  it('isole les données entre organisateurs', async () => {
    const chipCaseId = await createChipCase(client);
    const { id } = await createTournament(client, chipCaseId);

    const other = await registerUser(app);
    const read = await request(other, { method: 'GET', url: `/api/tournaments/${id}` });
    expect(read.statusCode).toBe(404);

    const write = await request(other, {
      method: 'PATCH',
      url: `/api/tournaments/${id}`,
      payload: { name: 'Piraté' },
    });
    expect(write.statusCode).toBe(404);

    const list = await request(other, { method: 'GET', url: '/api/tournaments' });
    expect((list.json() as { tournaments: unknown[] }).tournaments).toHaveLength(0);
  });
});

describe('chronomètre', () => {
  async function startedTournament(extra: Record<string, unknown> = {}) {
    const chipCaseId = await createChipCase(client);
    const { id } = await createTournament(client, chipCaseId, extra);
    const participants = await addParticipants(client, id, ['Alice', 'Bob', 'Chloé']);
    const start = await clockCommand(client, id, {
      action: 'START',
      expectedVersion: 0,
      idempotencyKey: idempotencyKey('start'),
    });
    expect(start.statusCode).toBe(200);
    return { id, participants, start };
  }

  it('exige deux joueurs pour démarrer', async () => {
    const chipCaseId = await createChipCase(client);
    const { id } = await createTournament(client, chipCaseId);
    await addParticipants(client, id, ['Alice']);
    const response = await clockCommand(client, id, {
      action: 'START',
      expectedVersion: 0,
      idempotencyKey: idempotencyKey('start'),
    });
    expect(response.statusCode).toBe(409);
    expect((response.json() as { error: { code: string } }).error.code).toBe('NOT_ENOUGH_PLAYERS');
  });

  it('démarre, rejoue une commande idempotente et détecte les conflits de version', async () => {
    const { id } = await startedTournament();
    const key = idempotencyKey('replay');

    const first = await clockCommand(client, id, { action: 'PAUSE', expectedVersion: 1, idempotencyKey: key });
    expect(first.statusCode).toBe(200);

    const replay = await clockCommand(client, id, { action: 'PAUSE', expectedVersion: 1, idempotencyKey: key });
    expect(replay.statusCode).toBe(200);
    expect((replay.json() as { replayed: boolean }).replayed).toBe(true);

    const conflict = await clockCommand(client, id, {
      action: 'RESUME',
      expectedVersion: 1,
      idempotencyKey: idempotencyKey('conflict'),
    });
    expect(conflict.statusCode).toBe(409);
    expect((conflict.json() as { error: { code: string } }).error.code).toBe('VERSION_CONFLICT');
  });

  it('gère pause, reprise, niveau suivant et ajout de temps', async () => {
    const { id } = await startedTournament();

    const paused = await clockCommand(client, id, {
      action: 'PAUSE',
      expectedVersion: 1,
      idempotencyKey: idempotencyKey('pause'),
    });
    expect(paused.statusCode).toBe(200);
    expect((paused.json() as { clock: { status: string } }).clock.status).toBe('PAUSED');

    const resumed = await clockCommand(client, id, {
      action: 'RESUME',
      expectedVersion: 2,
      idempotencyKey: idempotencyKey('resume'),
    });
    expect((resumed.json() as { clock: { status: string } }).clock.status).toBe('RUNNING');

    const next = await clockCommand(client, id, {
      action: 'NEXT',
      expectedVersion: 3,
      idempotencyKey: idempotencyKey('next'),
    });
    expect((next.json() as { clock: { playLevelNumber: number } }).clock.playLevelNumber).toBe(2);

    const added = await clockCommand(client, id, {
      action: 'ADD_TIME',
      seconds: 30,
      expectedVersion: 4,
      idempotencyKey: idempotencyKey('add'),
    });
    expect(added.statusCode).toBe(200);
  });

  it('met en œuvre les trois modes de récupération', async () => {
    const { id } = await startedTournament();

    const pause1 = await clockCommand(client, id, {
      action: 'PAUSE',
      expectedVersion: 1,
      idempotencyKey: idempotencyKey('pause1'),
    });
    expect(pause1.statusCode).toBe(200);

    const continueElapsed = await clockCommand(client, id, {
      action: 'RECOVER',
      recoveryMode: 'CONTINUE_ELAPSED',
      expectedVersion: 2,
      idempotencyKey: idempotencyKey('recover1'),
    });
    expect(continueElapsed.statusCode).toBe(200);
    expect((continueElapsed.json() as { clock: { status: string } }).clock.status).toBe('RUNNING');

    const pause2 = await clockCommand(client, id, {
      action: 'PAUSE',
      expectedVersion: 3,
      idempotencyKey: idempotencyKey('pause2'),
    });
    expect(pause2.statusCode).toBe(200);

    const checkpoint = await clockCommand(client, id, {
      action: 'RECOVER',
      recoveryMode: 'LAST_CHECKPOINT',
      expectedVersion: 4,
      idempotencyKey: idempotencyKey('recover2'),
    });
    expect(checkpoint.statusCode).toBe(200);

    const pause3 = await clockCommand(client, id, {
      action: 'PAUSE',
      expectedVersion: 5,
      idempotencyKey: idempotencyKey('pause3'),
    });
    expect(pause3.statusCode).toBe(200);

    const pausedRecovery = await clockCommand(client, id, {
      action: 'RECOVER',
      recoveryMode: 'LAST_CHECKPOINT_PAUSED',
      expectedVersion: 6,
      idempotencyKey: idempotencyKey('recover3'),
    });
    expect(pausedRecovery.statusCode).toBe(200);
    expect((pausedRecovery.json() as { clock: { status: string } }).clock.status).toBe('PAUSED');
  });

  it('enregistre la présence organisateur', async () => {
    const { id } = await startedTournament();
    const response = await request(client, {
      method: 'POST',
      url: `/api/tournaments/${id}/heartbeat`,
    });
    expect(response.statusCode).toBe(200);
    const state = await app.prisma.tournamentClockState.findUnique({ where: { tournamentId: id } });
    expect(state?.lastAdminHeartbeatAt).not.toBeNull();
  });

  it('protège les commandes par un PIN facultatif', async () => {
    const chipCaseId = await createChipCase(client);
    const { id } = await createTournament(client, chipCaseId, { pin: '1234' });
    await addParticipants(client, id, ['Alice', 'Bob']);

    const denied = await clockCommand(client, id, {
      action: 'START',
      expectedVersion: 0,
      idempotencyKey: idempotencyKey('start'),
    });
    expect(denied.statusCode).toBe(403);
    expect((denied.json() as { error: { code: string } }).error.code).toBe('PIN_REQUIRED');

    const wrong = await request(client, {
      method: 'POST',
      url: `/api/tournaments/${id}/pin/unlock`,
      payload: { pin: '9999' },
    });
    expect(wrong.statusCode).toBe(403);

    const unlock = await request(client, {
      method: 'POST',
      url: `/api/tournaments/${id}/pin/unlock`,
      payload: { pin: '1234' },
    });
    expect(unlock.statusCode).toBe(200);
    const token = (unlock.json() as { token: string }).token;

    const allowed = await clockCommand(
      client,
      id,
      { action: 'START', expectedVersion: 0, idempotencyKey: idempotencyKey('start') },
      { 'x-pin-unlock': token },
    );
    expect(allowed.statusCode).toBe(200);
  });
});

describe('rebuys, éliminations et classement', () => {
  it('applique la limite de rebuys', async () => {
    const chipCaseId = await createChipCase(client);
    const { id } = await createTournament(client, chipCaseId, {
      rebuy: { enabled: true, unlimited: false, maxPerPlayer: 1, value: null, untilLevel: 10 },
    });
    const participants = await addParticipants(client, id, ['Alice', 'Bob']);
    await clockCommand(client, id, { action: 'START', expectedVersion: 0, idempotencyKey: idempotencyKey('s') });

    const first = await request(client, {
      method: 'POST',
      url: `/api/tournaments/${id}/rebuys`,
      payload: { participantId: participants[0] },
    });
    expect(first.statusCode).toBe(201);

    const second = await request(client, {
      method: 'POST',
      url: `/api/tournaments/${id}/rebuys`,
      payload: { participantId: participants[0] },
    });
    expect(second.statusCode).toBe(409);
    expect((second.json() as { error: { code: string } }).error.code).toBe('REBUY_LIMIT_REACHED');
  });

  it('refuse un rebuy après la période autorisée', async () => {
    const chipCaseId = await createChipCase(client);
    const { id } = await createTournament(client, chipCaseId, {
      rebuy: { enabled: true, unlimited: true, maxPerPlayer: null, value: null, untilLevel: 1 },
    });
    const participants = await addParticipants(client, id, ['Alice', 'Bob']);
    await clockCommand(client, id, { action: 'START', expectedVersion: 0, idempotencyKey: idempotencyKey('s') });
    await clockCommand(client, id, { action: 'NEXT', expectedVersion: 1, idempotencyKey: idempotencyKey('n') });

    const response = await request(client, {
      method: 'POST',
      url: `/api/tournaments/${id}/rebuys`,
      payload: { participantId: participants[0] },
    });
    expect(response.statusCode).toBe(409);
    expect((response.json() as { error: { code: string } }).error.code).toBe('REBUY_PERIOD_OVER');
  });

  it('ordonne les éliminations, n’annule que la dernière et calcule le classement', async () => {
    const chipCaseId = await createChipCase(client);
    const { id } = await createTournament(client, chipCaseId);
    const participants = await addParticipants(client, id, ['Alice', 'Bob', 'Chloé']);
    await clockCommand(client, id, { action: 'START', expectedVersion: 0, idempotencyKey: idempotencyKey('s') });

    const first = await request(client, {
      method: 'POST',
      url: `/api/tournaments/${id}/eliminations`,
      payload: { participantId: participants[0] },
    });
    expect(first.statusCode).toBe(201);

    const second = await request(client, {
      method: 'POST',
      url: `/api/tournaments/${id}/eliminations`,
      payload: { participantId: participants[1] },
    });
    expect(second.statusCode).toBe(201);

    const undoFirst = await request(client, {
      method: 'DELETE',
      url: `/api/tournaments/${id}/eliminations/${participants[0]}`,
    });
    expect(undoFirst.statusCode).toBe(409);

    const undoSecond = await request(client, {
      method: 'DELETE',
      url: `/api/tournaments/${id}/eliminations/${participants[1]}`,
    });
    expect(undoSecond.statusCode).toBe(204);

    const reEliminate = await request(client, {
      method: 'POST',
      url: `/api/tournaments/${id}/eliminations`,
      payload: { participantId: participants[1] },
    });
    expect(reEliminate.statusCode).toBe(201);

    const finalize = await request(client, { method: 'POST', url: `/api/tournaments/${id}/finalize`, payload: {} });
    expect(finalize.statusCode).toBe(200);
    const body = finalize.json() as {
      ranking: { entries: Array<{ participantId: string; rank: number }> };
      tournament: { status: string };
    };
    expect(body.tournament.status).toBe('COMPLETED');
    expect(body.ranking.entries[0]).toEqual({
      participantId: participants[2],
      rank: 1,
      tied: false,
      eliminated: false,
    });
    expect(body.ranking.entries.map((entry) => entry.rank)).toEqual([1, 2, 3]);
  });

  it('refuse de clôturer tant que plusieurs joueurs restent', async () => {
    const chipCaseId = await createChipCase(client);
    const { id } = await createTournament(client, chipCaseId);
    await addParticipants(client, id, ['Alice', 'Bob']);
    await clockCommand(client, id, { action: 'START', expectedVersion: 0, idempotencyKey: idempotencyKey('s') });

    const response = await request(client, { method: 'POST', url: `/api/tournaments/${id}/finalize`, payload: {} });
    expect(response.statusCode).toBe(409);
    expect((response.json() as { error: { code: string } }).error.code).toBe('PLAYERS_REMAIN');
  });
});

describe('liens spectateurs', () => {
  it('expose un tournoi en lecture seule et révoque le lien', async () => {
    const chipCaseId = await createChipCase(client);
    const { id } = await createTournament(client, chipCaseId);
    await addParticipants(client, id, ['Alice', 'Bob']);

    const created = await request(client, {
      method: 'POST',
      url: `/api/tournaments/${id}/spectator-tokens`,
    });
    expect(created.statusCode).toBe(201);
    const { token, id: tokenId } = created.json() as { token: string; id: string };

    const publicView = await app.inject({ method: 'GET', url: `/api/public/tournaments/${token}` });
    expect(publicView.statusCode).toBe(200);
    const body = publicView.json() as {
      tournament: { name: string };
      participants: Array<{ displayName: string }>;
    };
    expect(body.tournament.name).toBe('Tournoi test');
    expect(body.participants.map((participant) => participant.displayName)).toEqual(['Alice', 'Bob']);

    const unknown = await app.inject({ method: 'GET', url: '/api/public/tournaments/inconnu' });
    expect(unknown.statusCode).toBe(404);

    const revoked = await request(client, {
      method: 'DELETE',
      url: `/api/tournaments/${id}/spectator-tokens/${tokenId}`,
    });
    expect(revoked.statusCode).toBe(204);

    const afterRevocation = await app.inject({ method: 'GET', url: `/api/public/tournaments/${token}` });
    expect(afterRevocation.statusCode).toBe(404);
  });

  it('ne divulgue pas les rangs si le classement est privé', async () => {
    const chipCaseId = await createChipCase(client);
    const { id } = await createTournament(client, chipCaseId, { publicRanking: false });
    const participants = await addParticipants(client, id, ['Alice', 'Bob']);
    await clockCommand(client, id, { action: 'START', expectedVersion: 0, idempotencyKey: idempotencyKey('s') });
    await request(client, {
      method: 'POST',
      url: `/api/tournaments/${id}/eliminations`,
      payload: { participantId: participants[0] },
    });
    await request(client, { method: 'POST', url: `/api/tournaments/${id}/finalize`, payload: {} });

    const created = await request(client, { method: 'POST', url: `/api/tournaments/${id}/spectator-tokens` });
    const { token } = created.json() as { token: string };
    const view = await app.inject({ method: 'GET', url: `/api/public/tournaments/${token}` });
    expect((view.json() as { ranking: unknown }).ranking).toBeNull();
  });
});
