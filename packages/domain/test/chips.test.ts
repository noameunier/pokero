import { describe, expect, it } from 'vitest';
import {
  distributeChips,
  resolveCommonCounts,
  summarizeBuyIn,
  type ChipStock,
} from '../src/index.js';

const standardCase: ChipStock[] = [
  { id: 'white', label: 'Blanc', value: 25, available: 2_000 },
  { id: 'red', label: 'Rouge', value: 100, available: 1_000 },
  { id: 'green', label: 'Vert', value: 500, available: 500 },
  { id: 'blue', label: 'Bleu', value: 1_000, available: 300 },
  { id: 'yellow', label: 'Jaune', value: 5_000, available: 100 },
];

describe('distribution des caves', () => {
  it('atteint exactement la valeur cible et respecte les stocks', () => {
    const result = distributeChips({
      chipTypes: standardCase,
      players: 6,
      targetBuyIn: 10_000,
      startBigBlind: 50,
    });

    expect(result.exact).toBe(true);
    expect(result.perPlayerValue).toBe(10_000);
    expect(result.difference).toBe(0);
    expect(result.algorithm).toBe('DP');
    expect(result.perPlayerChipCount).toBeGreaterThan(0);
    expect(result.perPlayerChipCount).toBeLessThanOrEqual(60);

    for (const total of result.totalByType) {
      const stock = standardCase.find((type) => type.id === total.chipTypeId)!;
      expect(total.count).toBeLessThanOrEqual(stock.available);
    }
  });

  it('fournit au moins assez de petits jetons pour la grosse blinde', () => {
    const result = distributeChips({
      chipTypes: standardCase,
      players: 8,
      targetBuyIn: 10_000,
      startBigBlind: 100,
    });
    const white = result.counts.find((count) => count.chipTypeId === 'white')!;
    expect(white.count * 25).toBeGreaterThanOrEqual(100);
  });

  it('est déterministe', () => {
    const request = {
      chipTypes: standardCase,
      players: 6,
      targetBuyIn: 20_000,
      startBigBlind: 100,
    };
    const first = distributeChips(request);
    const second = distributeChips(request);
    expect(second.counts).toEqual(first.counts);
  });

  it('signale un écart quand la valeur exacte est impossible', () => {
    const result = distributeChips({
      chipTypes: [
        { id: 'a', label: 'A', value: 100, available: 100 },
        { id: 'b', label: 'B', value: 500, available: 100 },
      ],
      players: 2,
      targetBuyIn: 1_050,
      startBigBlind: 100,
    });
    expect(result.exact).toBe(false);
    expect(result.difference).not.toBe(0);
    expect(result.warnings.some((warning) => warning.code === 'TARGET_NOT_REACHED')).toBe(true);
  });

  it('ne dépasse jamais le stock disponible par joueur', () => {
    const result = distributeChips({
      chipTypes: [
        { id: 'a', label: 'A', value: 25, available: 10 },
        { id: 'b', label: 'B', value: 100, available: 5 },
      ],
      players: 6,
      targetBuyIn: 1_000,
      startBigBlind: 50,
    });
    for (const total of result.totalByType) {
      const stock = [
        { id: 'a', available: 10 },
        { id: 'b', available: 5 },
      ].find((type) => type.id === total.chipTypeId)!;
      expect(total.count).toBeLessThanOrEqual(stock.available);
    }
    expect(result.warnings.some((warning) => warning.code === 'STOCK_LIMITED')).toBe(true);
  });

  it('déduit les réserves de rebuys du stock utilisable', () => {
    const result = distributeChips({
      chipTypes: [{ id: 'a', label: 'A', value: 100, available: 100 }],
      players: 10,
      targetBuyIn: 100,
      reserveByType: { a: 95 },
    });
    expect(result.totalByType[0]!.count).toBeLessThanOrEqual(5);
    expect(result.exact).toBe(false);
  });

  it('refuse un stock réservé supérieur au stock physique', () => {
    expect(() =>
      distributeChips({
        chipTypes: [{ id: 'a', label: 'A', value: 100, available: 10 }],
        players: 2,
        targetBuyIn: 100,
        reserveByType: { a: 20 },
      }),
    ).toThrow(/réserve/i);
  });

  it('bascule sur le repli glouton pour un espace de recherche trop grand', () => {
    const result = distributeChips({
      chipTypes: [{ id: 'a', label: 'A', value: 1, available: 10_000_000 }],
      players: 1,
      targetBuyIn: 1_000_000,
      maxPerTypePerPlayer: 40,
    });
    expect(result.algorithm).toBe('GREEDY_FALLBACK');
    expect(result.warnings.some((warning) => warning.code === 'TIME_BUDGET_EXCEEDED')).toBe(true);
  });

  it('gère l’absence totale de stock', () => {
    const result = distributeChips({
      chipTypes: [{ id: 'a', label: 'A', value: 100, available: 0 }],
      players: 4,
      targetBuyIn: 1_000,
    });
    expect(result.counts).toEqual([]);
    expect(result.warnings.some((warning) => warning.code === 'NO_USABLE_CHIP_TYPE')).toBe(true);
  });

  it('refuse des valeurs ou quantités non entières', () => {
    expect(() =>
      distributeChips({
        chipTypes: [{ id: 'a', label: 'A', value: 25.5, available: 10 }],
        players: 2,
        targetBuyIn: 100,
      }),
    ).toThrow(/entier/i);
  });
});

describe('règle « Même nombre de jetons »', () => {
  it('applique la quantité commune aux cases cochées et garde les manuelles', () => {
    const counts = resolveCommonCounts({
      chipTypeIds: ['white', 'red', 'green', 'blue', 'yellow'],
      commonEnabled: { white: true, red: true, green: true, blue: true, yellow: false },
      commonCount: 10,
      manualCounts: { yellow: 3 },
    });
    expect(counts).toEqual({ white: 10, red: 10, green: 10, blue: 10, yellow: 3 });
  });

  it('applique immédiatement la valeur commune quand on recoche', () => {
    const counts = resolveCommonCounts({
      chipTypeIds: ['yellow'],
      commonEnabled: { yellow: true },
      commonCount: 10,
      manualCounts: { yellow: 3 },
    });
    expect(counts.yellow).toBe(10);
  });

  it('ne détruit pas la valeur manuelle quand la case est décochée', () => {
    const manual = { yellow: 3 };
    resolveCommonCounts({
      chipTypeIds: ['yellow'],
      commonEnabled: { yellow: true },
      commonCount: 10,
      manualCounts: manual,
    });
    expect(manual.yellow).toBe(3);
  });
});

describe('résumé d’une cave manuelle', () => {
  it('calcule valeur, total et stock restant', () => {
    const summary = summarizeBuyIn({
      chipTypes: standardCase,
      counts: [
        { chipTypeId: 'white', count: 10 },
        { chipTypeId: 'red', count: 10 },
        { chipTypeId: 'green', count: 10 },
        { chipTypeId: 'blue', count: 10 },
        { chipTypeId: 'yellow', count: 3 },
      ],
      players: 6,
      targetBuyIn: 31_250,
      startBigBlind: 50,
    });
    expect(summary.perPlayerValue).toBe(31_250);
    expect(summary.totalValue).toBe(187_500);
    expect(summary.exact).toBe(true);
    expect(summary.remainingStock.find((stock) => stock.chipTypeId === 'yellow')!.count).toBe(82);
  });

  it('alerte si le stock est insuffisant', () => {
    const summary = summarizeBuyIn({
      chipTypes: [{ id: 'a', label: 'A', value: 100, available: 5 }],
      counts: [{ chipTypeId: 'a', count: 2 }],
      players: 4,
      targetBuyIn: 200,
    });
    expect(summary.warnings.some((warning) => warning.code === 'STOCK_LIMITED')).toBe(true);
  });
});
