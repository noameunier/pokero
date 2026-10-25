import { DomainError } from './errors.js';

export interface RankingEntry {
  participantId: string;
  rank: number;
  tied: boolean;
  eliminated: boolean;
}

export interface FinalRanking {
  entries: RankingEntry[];
  winnerId: string | null;
  final: boolean;
}

/**
 * Classement final basé sur l'ordre des éliminations.
 * sequence 1 = premier éliminé (dernière place), sequence N-1 = finaliste
 * perdant, le dernier joueur restant est vainqueur.
 *
 * Les éliminations simultanées sont ordonnées manuellement par l'organisateur
 * via la séquence fournie.
 */
export function computeFinalRanking(input: {
  participantIds: string[];
  eliminations: Array<{ participantId: string; sequence: number }>;
  winnerId?: string;
}): FinalRanking {
  const participantIds = [...new Set(input.participantIds)];
  const total = participantIds.length;
  if (total === 0) {
    return { entries: [], winnerId: null, final: false };
  }

  const seen = new Set<string>();
  const sequences = new Set<number>();
  for (const elimination of input.eliminations) {
    if (!participantIds.includes(elimination.participantId)) {
      throw new DomainError('UNKNOWN_PARTICIPANT', 'Élimination liée à un participant inconnu.');
    }
    if (seen.has(elimination.participantId)) {
      throw new DomainError('DUPLICATE_ELIMINATION', 'Un participant ne peut être éliminé qu’une fois.');
    }
    if (sequences.has(elimination.sequence)) {
      throw new DomainError('DUPLICATE_SEQUENCE', 'Deux éliminations ne peuvent avoir la même séquence.');
    }
    seen.add(elimination.participantId);
    sequences.add(elimination.sequence);
  }

  const eliminated = [...input.eliminations].sort((a, b) => a.sequence - b.sequence);
  const remaining = participantIds.filter((id) => !seen.has(id));

  let winnerId: string | null = null;
  if (input.winnerId) {
    if (!participantIds.includes(input.winnerId)) {
      throw new DomainError('UNKNOWN_WINNER', 'Le vainqueur déclaré n’est pas un participant.');
    }
    if (seen.has(input.winnerId)) {
      throw new DomainError('WINNER_ELIMINATED', 'Le vainqueur déclaré a déjà été éliminé.');
    }
    winnerId = input.winnerId;
  } else if (remaining.length === 1) {
    winnerId = remaining[0]!;
  }

  const final = winnerId !== null;
  const entries: RankingEntry[] = [];

  for (const participantId of remaining) {
    entries.push({
      participantId,
      rank: winnerId === participantId ? 1 : 1,
      tied: winnerId === null && remaining.length > 1,
      eliminated: false,
    });
  }

  eliminated.forEach((elimination, index) => {
    const rank = final ? total - index : total - index;
    entries.push({
      participantId: elimination.participantId,
      rank,
      tied: false,
      eliminated: true,
    });
  });

  entries.sort((a, b) => a.rank - b.rank || a.participantId.localeCompare(b.participantId));
  return { entries, winnerId, final };
}

export interface PlayerTournamentResult {
  tournamentId: string;
  organizerId: string;
  participantsCount: number;
  rank: number;
  rebuys: number;
  addOns: number;
}

export interface PlayerStats {
  tournamentsPlayed: number;
  wins: number;
  secondPlaces: number;
  thirdPlaces: number;
  podiums: number;
  totalRebuys: number;
  totalAddOns: number;
  bestRank: number | null;
  averageRank: number | null;
  byOrganizer: Array<{ organizerId: string; tournaments: number }>;
}

export function computePlayerStats(results: PlayerTournamentResult[]): PlayerStats {
  if (results.length === 0) {
    return {
      tournamentsPlayed: 0,
      wins: 0,
      secondPlaces: 0,
      thirdPlaces: 0,
      podiums: 0,
      totalRebuys: 0,
      totalAddOns: 0,
      bestRank: null,
      averageRank: null,
      byOrganizer: [],
    };
  }

  const organizers = new Map<string, number>();
  let totalRank = 0;
  let wins = 0;
  let secondPlaces = 0;
  let thirdPlaces = 0;
  let totalRebuys = 0;
  let totalAddOns = 0;
  let bestRank = Number.POSITIVE_INFINITY;

  for (const result of results) {
    if (result.rank === 1) wins += 1;
    if (result.rank === 2) secondPlaces += 1;
    if (result.rank === 3) thirdPlaces += 1;
    totalRank += result.rank;
    bestRank = Math.min(bestRank, result.rank);
    totalRebuys += result.rebuys;
    totalAddOns += result.addOns;
    organizers.set(result.organizerId, (organizers.get(result.organizerId) ?? 0) + 1);
  }

  return {
    tournamentsPlayed: results.length,
    wins,
    secondPlaces,
    thirdPlaces,
    podiums: wins + secondPlaces + thirdPlaces,
    totalRebuys,
    totalAddOns,
    bestRank: Number.isFinite(bestRank) ? bestRank : null,
    averageRank: totalRank / results.length,
    byOrganizer: [...organizers.entries()].map(([organizerId, tournaments]) => ({
      organizerId,
      tournaments,
    })),
  };
}
