export type Locale = 'fr' | 'en';

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: 'USER' | 'ADMIN';
  locale: Locale;
  publicProfile: boolean;
  publicResults: boolean;
  emailVerified: boolean;
  createdAt?: string;
}

export interface ChipType {
  id: string;
  label: string;
  color: string;
  value: number;
  quantity: number;
  position: number;
  freeQuantity?: number;
}

export interface ChipCase {
  id: string;
  name: string;
  description: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  tournamentsCount: number;
  chipTypes: ChipType[];
}

export interface Preset {
  id: string;
  name: string;
  description: string | null;
  config: Record<string, unknown>;
  defaultChipCaseId: string | null;
  archived: boolean;
  versionsCount: number;
  createdAt: string;
  updatedAt: string;
}

export type TournamentStatus =
  | 'DRAFT'
  | 'READY'
  | 'RUNNING'
  | 'PAUSED'
  | 'RECOVERY_PENDING'
  | 'COMPLETED'
  | 'CANCELLED';

export interface ClockView {
  status: TournamentStatus;
  version: number;
  serverNow: number;
  segmentIndex: number;
  levelPosition: number;
  playLevelNumber: number | null;
  kind: 'PLAY' | 'BREAK';
  smallBlind: number | null;
  bigBlind: number | null;
  ante: number | null;
  remainingMs: number;
  segmentDurationMs: number;
  elapsedInSegmentMs: number;
  endsAt: number | null;
  accumulatedPlayMs: number;
  totalPlayLevels: number;
  structureExhausted: boolean;
  upcoming: Array<{
    index: number;
    kind: 'PLAY' | 'BREAK';
    durationMs: number;
    playLevelNumber: number | null;
    levelPosition: number;
    smallBlind: number | null;
    bigBlind: number | null;
    ante: number | null;
  }>;
}

export interface BlindLevel {
  id?: string;
  position: number;
  kind: 'PLAY' | 'BREAK';
  smallBlind: number | null;
  bigBlind: number | null;
  ante: number | null;
  durationMinutes: number;
}

export interface Participant {
  id: string;
  displayName: string;
  status: 'ACTIVE' | 'ELIMINATED';
  rebuyCount: number;
  addOnCount: number;
  eliminationSequence: number | null;
  linkedAccount: boolean;
}

export interface TournamentSettings {
  buyIn: {
    players: number;
    targetBuyIn: number;
    startingStack: number;
    mode: 'AUTO' | 'MANUAL';
    counts: Record<string, number>;
    commonEnabled: Record<string, boolean>;
    commonCount: number;
    maxChipsPerPlayer: number;
  };
  blinds: {
    autoGenerate: boolean;
    targetDurationMinutes: number;
    levelDurationMinutes: number;
    breakDurationMinutes: number;
    breakEveryLevels: number;
    roundUnit: number;
    anteFromLevel: number;
    antePercentOfBigBlind: number;
    startingSmallBlind?: number;
    startingBigBlind?: number;
    growthFactor?: number;
  };
  rebuy: {
    enabled: boolean;
    unlimited: boolean;
    maxPerPlayer: number | null;
    value: number | null;
    untilLevel: number | null;
  };
  addOn: {
    enabled: boolean;
    value: number | null;
    atLevel: number | null;
    limitPerPlayer: number;
  };
  alerts: {
    soundBeforeLevel: boolean;
    soundAtLevel: boolean;
    vibration: boolean;
    volume: number;
  };
  display: {
    showRanking: boolean;
    showPlayers: boolean;
  };
  chipCaseName: string;
  pinConfigured: boolean;
}

export interface Tournament {
  id: string;
  name: string;
  status: TournamentStatus;
  publicRanking: boolean;
  pinRequired: boolean;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  settings: TournamentSettings;
  clock: ClockView;
  levels: BlindLevel[];
  participants: Participant[];
  activePlayers: number;
}

export interface TournamentSummary {
  id: string;
  name: string;
  status: TournamentStatus;
  publicRanking: boolean;
  participantsCount: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  clockVersion: number;
}

export interface Allocation {
  id: string;
  chipTypeId: string;
  perPlayerCount: number;
  players: number;
  totalQuantity: number;
  chipType: ChipType;
}

export interface Rebuy {
  id: string;
  participantId: string;
  value: number;
  counts: Array<{ chipTypeId: string; count: number }>;
  createdAt: string;
  cancelledAt: string | null;
}

export interface Elimination {
  id: string;
  participantId: string;
  sequence: number;
  createdAt: string;
}

export interface RankingEntry {
  participantId: string;
  rank: number;
  tied: boolean;
  eliminated: boolean;
}

export interface FinalRankingEntry {
  id: string;
  participantId: string;
  rank: number;
}

export interface TournamentDetail {
  tournament: Tournament;
  allocations: Allocation[];
  rebuys: Rebuy[];
  addOns: Rebuy[];
  eliminations: Elimination[];
  ranking: { entries: RankingEntry[]; winnerId: string | null; final: boolean } | null;
  finalRankings: FinalRankingEntry[];
  spectatorTokens: Array<{ id: string; createdAt: string }>;
  events: Array<{ id: string; type: string; payload: unknown; version: number; createdAt: string }>;
}

export interface PlannedChipCount {
  chipTypeId: string;
  label: string;
  color: string;
  value: number;
  perPlayer: number;
  total: number;
}

export interface BuyInPlan {
  players: number;
  targetBuyIn: number;
  startingStack: number;
  perPlayerValue: number;
  perPlayerChipCount: number;
  totalValue: number;
  difference: number;
  exact: boolean;
  counts: PlannedChipCount[];
  warnings: Array<{ code: string; message: string; details?: Record<string, unknown> }>;
  algorithm: string;
  freeStock: Array<{ chipTypeId: string; available: number }>;
}

export interface SpectatorPayload {
  tournament: {
    id: string;
    name: string;
    status: TournamentStatus;
    startedAt: string | null;
    completedAt: string | null;
  };
  clock: ClockView | null;
  levels: BlindLevel[];
  participants: Array<{
    id: string;
    displayName: string;
    status: 'ACTIVE' | 'ELIMINATED';
    rebuyCount: number;
    addOnCount: number;
    eliminationSequence: number | null;
  }>;
  display: { showRanking: boolean; showPlayers: boolean };
  ranking: Array<{ participantId: string; rank: number; displayName: string }> | null;
  activePlayers: number;
  serverNow: number;
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
}

export interface MyStats {
  participations: Array<{
    tournamentId: string;
    tournamentName: string;
    status: TournamentStatus;
    participantStatus: 'ACTIVE' | 'ELIMINATED';
    rank: number | null;
    rebuys: number;
    addOns: number;
  }>;
  results: Array<{
    tournamentId: string;
    tournamentName: string;
    organizerId: string;
    rank: number;
    rebuys: number;
    addOns: number;
    startedAt: string | null;
  }>;
  totals: { played: number; wins: number; podiums: number };
}
