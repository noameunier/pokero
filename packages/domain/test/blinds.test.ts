import { describe, expect, it } from 'vitest';
import {
  classicBlindStructure,
  deepstackBlindStructure,
  extendBlindStructure,
  expressBlindStructure,
  generateBlindStructure,
} from '../src/index.js';

describe('génération des blindes', () => {
  const structure = generateBlindStructure({
    startingStack: 20_000,
    targetDurationMinutes: 180,
    levelDurationMinutes: 20,
    breakDurationMinutes: 15,
    breakEveryLevels: 4,
    roundUnit: 25,
    startingSmallBlind: 100,
  });

  it('produit une durée proche de la cible', () => {
    expect(structure.totalDurationMinutes).toBeGreaterThanOrEqual(180);
    expect(structure.totalDurationMinutes).toBeLessThan(240);
  });

  it('applique une durée spécifique au premier niveau', () => {
    const withFirstLevel = generateBlindStructure({
      startingStack: 20_000,
      targetDurationMinutes: 180,
      levelDurationMinutes: 20,
      firstLevelDurationMinutes: 40,
      breakDurationMinutes: 15,
      breakEveryLevels: 4,
      roundUnit: 25,
      startingSmallBlind: 100,
    });
    const playLevels = withFirstLevel.levels.filter((level) => level.kind === 'PLAY');
    expect(playLevels[0]!.durationMinutes).toBe(40);
    expect(playLevels[1]!.durationMinutes).toBe(20);
    expect(withFirstLevel.levels[0]!.cumulativeMinutes).toBe(40);
  });

  it('respecte SB = BB / 2 et les multiples de la dénomination', () => {
    for (const level of structure.levels.filter((item) => item.kind === 'PLAY')) {
      expect(level.bigBlind).toBe(level.smallBlind! * 2);
      expect(level.smallBlind! % 25).toBe(0);
      expect(level.bigBlind! % 50).toBe(0);
    }
  });

  it('progresse de façon strictement croissante', () => {
    const blinds = structure.levels
      .filter((level) => level.kind === 'PLAY')
      .map((level) => level.bigBlind!);
    for (let index = 1; index < blinds.length; index += 1) {
      expect(blinds[index]!).toBeGreaterThan(blinds[index - 1]!);
    }
  });

  it('insère les pauses programmées', () => {
    const breaks = structure.levels.filter((level) => level.kind === 'BREAK');
    expect(breaks.length).toBeGreaterThan(0);
    for (const pause of breaks) {
      expect(pause.durationMinutes).toBe(15);
      expect(pause.smallBlind).toBeNull();
    }
  });

  it('ajoute les antes à partir du niveau demandé', () => {
    const playLevels = structure.levels.filter((level) => level.kind === 'PLAY');
    for (let index = 0; index < 4; index += 1) {
      expect(playLevels[index]!.ante).toBeNull();
    }
    expect(playLevels[4]!.ante).toBeGreaterThan(0);
  });

  it('calcule la profondeur de départ', () => {
    expect(structure.startingDepth).toBe(100);
  });

  it('prolonge la structure sans déclencher de fin', () => {
    const extended = extendBlindStructure(structure, 3, { growthFactor: 1.3, roundUnit: 25 });
    expect(extended.levels.length).toBe(structure.levels.length + 3);
    expect(extended.totalDurationMinutes).toBeGreaterThan(structure.totalDurationMinutes);
    expect(extended.levels.at(-1)!.position).toBe(extended.levels.length);
  });

  it('fournit les trois presets demandés', () => {
    const express = expressBlindStructure();
    const classic = classicBlindStructure();
    const deepstack = deepstackBlindStructure();

    expect(express.totalDurationMinutes).toBeGreaterThanOrEqual(80);
    expect(express.totalDurationMinutes).toBeLessThanOrEqual(100);
    expect(classic.totalDurationMinutes).toBeGreaterThanOrEqual(170);
    expect(classic.totalDurationMinutes).toBeLessThanOrEqual(220);
    expect(deepstack.totalDurationMinutes).toBeGreaterThanOrEqual(290);
    expect(deepstack.totalDurationMinutes).toBeLessThanOrEqual(340);
  });

  it('refuse une grosse blinde inférieure au double de la petite', () => {
    expect(() =>
      generateBlindStructure({
        startingStack: 10_000,
        targetDurationMinutes: 60,
        startingSmallBlind: 100,
        startingBigBlind: 150,
      }),
    ).toThrow(/grosse blinde/i);
  });

  it('alerte quand la profondeur de départ est trop faible', () => {
    const shallow = generateBlindStructure({
      startingStack: 1_000,
      targetDurationMinutes: 60,
      startingBigBlind: 100,
    });
    expect(shallow.warnings.some((warning) => warning.code === 'STARTING_DEPTH_LOW')).toBe(true);
  });
});
