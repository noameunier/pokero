import { describe, expect, it } from 'vitest';
import { computeFinalRanking, computePlayerStats } from '../src/index.js';

describe('classement final', () => {
  it('attribue les places selon l’ordre des éliminations', () => {
    const ranking = computeFinalRanking({
      participantIds: ['a', 'b', 'c', 'd'],
      eliminations: [
        { participantId: 'a', sequence: 1 },
        { participantId: 'b', sequence: 2 },
        { participantId: 'c', sequence: 3 },
      ],
    });
    expect(ranking.final).toBe(true);
    expect(ranking.winnerId).toBe('d');
    expect(ranking.entries).toEqual([
      { participantId: 'd', rank: 1, tied: false, eliminated: false },
      { participantId: 'c', rank: 2, tied: false, eliminated: true },
      { participantId: 'b', rank: 3, tied: false, eliminated: true },
      { participantId: 'a', rank: 4, tied: false, eliminated: true },
    ]);
  });

  it('accepte un vainqueur déclaré explicitement', () => {
    const ranking = computeFinalRanking({
      participantIds: ['a', 'b', 'c'],
      eliminations: [
        { participantId: 'a', sequence: 1 },
        { participantId: 'b', sequence: 2 },
      ],
      winnerId: 'c',
    });
    expect(ranking.winnerId).toBe('c');
    expect(ranking.final).toBe(true);
  });

  it('gère une élimination simultanée ordonnée manuellement', () => {
    const ranking = computeFinalRanking({
      participantIds: ['a', 'b', 'c'],
      eliminations: [
        { participantId: 'b', sequence: 1 },
        { participantId: 'a', sequence: 2 },
      ],
    });
    expect(ranking.entries.find((entry) => entry.participantId === 'a')!.rank).toBe(2);
    expect(ranking.entries.find((entry) => entry.participantId === 'b')!.rank).toBe(3);
  });

  it('marque les joueurs restants comme ex æquo si le tournoi n’est pas fini', () => {
    const ranking = computeFinalRanking({
      participantIds: ['a', 'b', 'c', 'd'],
      eliminations: [{ participantId: 'a', sequence: 1 }],
    });
    expect(ranking.final).toBe(false);
    expect(ranking.entries.filter((entry) => !entry.eliminated).every((entry) => entry.tied)).toBe(true);
  });

  it('refuse les doublons et les incohérences', () => {
    expect(() =>
      computeFinalRanking({
        participantIds: ['a', 'b'],
        eliminations: [
          { participantId: 'a', sequence: 1 },
          { participantId: 'a', sequence: 2 },
        ],
      }),
    ).toThrow(/éliminé qu’une fois/i);

    expect(() =>
      computeFinalRanking({
        participantIds: ['a', 'b'],
        eliminations: [
          { participantId: 'a', sequence: 1 },
          { participantId: 'b', sequence: 1 },
        ],
      }),
    ).toThrow(/même séquence/i);

    expect(() =>
      computeFinalRanking({
        participantIds: ['a', 'b'],
        eliminations: [{ participantId: 'a', sequence: 1 }],
        winnerId: 'a',
      }),
    ).toThrow(/déjà été éliminé/i);
  });
});

describe('statistiques joueur', () => {
  it('agrège les résultats multi-organisateurs', () => {
    const stats = computePlayerStats([
      {
        tournamentId: 't1',
        organizerId: 'org1',
        participantsCount: 8,
        rank: 1,
        rebuys: 1,
        addOns: 1,
      },
      {
        tournamentId: 't2',
        organizerId: 'org2',
        participantsCount: 6,
        rank: 2,
        rebuys: 0,
        addOns: 1,
      },
      {
        tournamentId: 't3',
        organizerId: 'org1',
        participantsCount: 10,
        rank: 4,
        rebuys: 2,
        addOns: 0,
      },
    ]);

    expect(stats.tournamentsPlayed).toBe(3);
    expect(stats.wins).toBe(1);
    expect(stats.secondPlaces).toBe(1);
    expect(stats.podiums).toBe(2);
    expect(stats.totalRebuys).toBe(3);
    expect(stats.totalAddOns).toBe(2);
    expect(stats.bestRank).toBe(1);
    expect(stats.averageRank).toBeCloseTo(7 / 3);
    expect(stats.byOrganizer).toEqual([
      { organizerId: 'org1', tournaments: 2 },
      { organizerId: 'org2', tournaments: 1 },
    ]);
  });

  it('renvoie des statistiques vides sans participation', () => {
    const stats = computePlayerStats([]);
    expect(stats.tournamentsPlayed).toBe(0);
    expect(stats.bestRank).toBeNull();
  });
});
