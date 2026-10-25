import {
  distributeChips,
  resolveCommonCounts,
  summarizeBuyIn,
  type ChipStock,
  type DistributionWarning,
} from '@pokero/domain';
import type { BuyInConfig } from '@pokero/contracts';
import type { Tx } from '../db/types.ts';
import { AppError } from '../lib/app-error.ts';

export interface DbChipType {
  id: string;
  label: string;
  color: string;
  value: number;
  quantity: number;
  position: number;
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
  warnings: DistributionWarning[];
  algorithm: 'DP' | 'GREEDY_FALLBACK' | 'MANUAL';
  freeStock: Array<{ chipTypeId: string; available: number }>;
}

/** Stock libre = quantité physique − réservations actives de tous les tournois. */
export async function fetchFreeStock(
  client: Tx,
  chipTypeIds: string[],
): Promise<Map<string, number>> {
  const types = await client.chipType.findMany({
    where: { id: { in: chipTypeIds } },
    select: { id: true, quantity: true },
  });
  const reservations = await client.inventoryReservation.groupBy({
    by: ['chipTypeId'],
    where: {
      chipTypeId: { in: chipTypeIds },
      status: 'ACTIVE',
      // Les réservations d’un tournoi clos ne doivent plus bloquer le stock.
      tournament: { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
    },
    _sum: { quantity: true },
  });
  const reserved = new Map(reservations.map((row) => [row.chipTypeId, row._sum.quantity ?? 0]));
  return new Map(
    types.map((type) => [type.id, Math.max(0, type.quantity - (reserved.get(type.id) ?? 0))]),
  );
}

export function planBuyIn(input: {
  chipTypes: DbChipType[];
  config: BuyInConfig;
  freeStock: Map<string, number>;
  startBigBlind?: number;
}): BuyInPlan {
  const { chipTypes, config, freeStock } = input;
  const freeForType = (id: string): number => freeStock.get(id) ?? 0;

  const stocks: ChipStock[] = chipTypes.map((type) => ({
    id: type.id,
    label: type.label,
    value: type.value,
    available: freeForType(type.id),
  }));

  const startBigBlind =
    input.startBigBlind ?? Math.max(1, Math.round(config.targetBuyIn / 100));

  if (config.mode === 'MANUAL') {
    const manualCounts = resolveCommonCounts({
      chipTypeIds: chipTypes.map((type) => type.id),
      commonEnabled: config.commonEnabled,
      commonCount: config.commonCount,
      manualCounts: config.counts,
    });
    const counts = chipTypes.map((type) => ({
      chipTypeId: type.id,
      count: manualCounts[type.id] ?? 0,
    }));
    const summary = summarizeBuyIn({
      chipTypes: stocks,
      counts,
      players: config.players,
      targetBuyIn: config.targetBuyIn,
      startBigBlind,
    });
    return {
      players: config.players,
      targetBuyIn: config.targetBuyIn,
      startingStack: config.startingStack,
      perPlayerValue: summary.perPlayerValue,
      perPlayerChipCount: summary.perPlayerChipCount,
      totalValue: summary.totalValue,
      difference: summary.difference,
      exact: summary.exact,
      counts: chipTypes.map((type) => {
        const perPlayer = manualCounts[type.id] ?? 0;
        return {
          chipTypeId: type.id,
          label: type.label,
          color: type.color,
          value: type.value,
          perPlayer,
          total: perPlayer * config.players,
        };
      }),
      warnings: summary.warnings,
      algorithm: 'MANUAL',
      freeStock: chipTypes.map((type) => ({
        chipTypeId: type.id,
        available: freeForType(type.id),
      })),
    };
  }

  const result = distributeChips({
    chipTypes: stocks,
    players: config.players,
    targetBuyIn: config.targetBuyIn,
    startBigBlind,
    reserveByType: config.reserveByType,
    maxChipsPerPlayer: config.maxChipsPerPlayer,
  });

  return {
    players: config.players,
    targetBuyIn: config.targetBuyIn,
    startingStack: config.startingStack,
    perPlayerValue: result.perPlayerValue,
    perPlayerChipCount: result.perPlayerChipCount,
    totalValue: result.totalValue,
    difference: result.difference,
    exact: result.exact,
    counts: chipTypes.map((type) => {
      const perPlayer = result.counts.find((count) => count.chipTypeId === type.id)?.count ?? 0;
      return {
        chipTypeId: type.id,
        label: type.label,
        color: type.color,
        value: type.value,
        perPlayer,
        total: perPlayer * config.players,
      };
    }),
    warnings: result.warnings,
    algorithm: result.algorithm,
    freeStock: chipTypes.map((type) => ({
      chipTypeId: type.id,
      available: freeForType(type.id),
    })),
  };
}

export async function loadChipTypes(
  client: Tx,
  chipCaseId: string,
): Promise<DbChipType[]> {
  const chipCase = await client.chipCase.findUnique({
    where: { id: chipCaseId },
    include: { chipTypes: { orderBy: { position: 'asc' } } },
  });
  if (!chipCase) throw AppError.notFound('Mallette introuvable.');
  return chipCase.chipTypes;
}

/** Vérifie que chaque quantité planifiée tient dans le stock libre. */
export function assertStockAvailable(plan: BuyInPlan): void {
  const shortages = plan.counts.filter((count) => count.total > 0).filter((count) => {
    const free = plan.freeStock.find((stock) => stock.chipTypeId === count.chipTypeId)?.available ?? 0;
    return count.total > free;
  });
  if (shortages.length > 0) {
    throw AppError.conflict(
      'INSUFFICIENT_STOCK',
      'Stock de jetons insuffisant pour cette configuration.',
      {
        shortages: shortages.map((count) => ({
          chipTypeId: count.chipTypeId,
          label: count.label,
          required: count.total,
          available:
            plan.freeStock.find((stock) => stock.chipTypeId === count.chipTypeId)?.available ?? 0,
        })),
      },
    );
  }
}
