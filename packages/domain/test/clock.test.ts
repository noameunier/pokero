import { describe, expect, it } from 'vitest';
import {
  addTime,
  advanceClock,
  buildClockSegments,
  completeClock,
  createClockState,
  formatClock,
  nextSegment,
  pauseClock,
  previousSegment,
  recoverClock,
  resumeClock,
  setRemaining,
  startClock,
  viewClock,
  type BlindLevel,
} from '../src/index.js';

const levels: BlindLevel[] = [
  {
    position: 1,
    kind: 'PLAY',
    smallBlind: 25,
    bigBlind: 50,
    ante: null,
    durationMinutes: 10,
    cumulativeMinutes: 10,
  },
  {
    position: 2,
    kind: 'BREAK',
    smallBlind: null,
    bigBlind: null,
    ante: null,
    durationMinutes: 5,
    cumulativeMinutes: 15,
  },
  {
    position: 3,
    kind: 'PLAY',
    smallBlind: 50,
    bigBlind: 100,
    ante: 10,
    durationMinutes: 10,
    cumulativeMinutes: 25,
  },
];

const segments = buildClockSegments(levels);
const MINUTE = 60_000;
const T0 = 1_700_000_000_000;

describe('moteur de chronomètre', () => {
  it('affiche la durée complète avant démarrage', () => {
    const state = createClockState(T0);
    const view = viewClock(state, segments, T0);
    expect(view.status).toBe('DRAFT');
    expect(view.remainingMs).toBe(10 * MINUTE);
    expect(view.playLevelNumber).toBe(1);
    expect(view.endsAt).toBeNull();
  });

  it('démarre et décrémente selon l’horodatage serveur', () => {
    const state = startClock(createClockState(T0), segments, T0);
    const view = viewClock(state, segments, T0 + 3 * MINUTE);
    expect(view.status).toBe('RUNNING');
    expect(view.remainingMs).toBe(7 * MINUTE);
    expect(view.endsAt).toBe(T0 + 10 * MINUTE);
  });

  it('ignore une horloge cliente en avance (décalage négatif)', () => {
    const state = startClock(createClockState(T0), segments, T0);
    const view = viewClock(state, segments, T0 - 5 * MINUTE);
    expect(view.remainingMs).toBe(10 * MINUTE);
  });

  it('traverse un niveau et une pause', () => {
    const state = startClock(createClockState(T0), segments, T0);
    const afterLevel = advanceClock(state, segments, T0 + 10 * MINUTE);
    expect(afterLevel.transitions).toHaveLength(1);
    expect(afterLevel.state.segmentIndex).toBe(1);
    expect(afterLevel.state.remainingAtAnchorMs).toBe(5 * MINUTE);
    expect(afterLevel.state.accumulatedPlayMs).toBe(10 * MINUTE);

    const afterBreak = advanceClock(afterLevel.state, segments, T0 + 15 * MINUTE);
    expect(afterBreak.state.segmentIndex).toBe(2);
    expect(afterBreak.state.remainingAtAnchorMs).toBe(10 * MINUTE);
    expect(afterBreak.state.accumulatedPlayMs).toBe(10 * MINUTE);
  });

  it('gère plusieurs niveaux traversés pendant une absence', () => {
    const state = startClock(createClockState(T0), segments, T0);
    const result = advanceClock(state, segments, T0 + 22 * MINUTE);
    expect(result.state.segmentIndex).toBe(2);
    expect(result.state.remainingAtAnchorMs).toBe(3 * MINUTE);
    expect(result.state.accumulatedPlayMs).toBe(10 * MINUTE);
    expect(result.transitions.length).toBe(2);
  });

  it('ne déclare pas le vainqueur à la fin de la structure', () => {
    const state = startClock(createClockState(T0), segments, T0);
    const result = advanceClock(state, segments, T0 + 60 * MINUTE);
    expect(result.state.structureExhausted).toBe(true);
    expect(result.state.status).toBe('RUNNING');
    expect(result.state.remainingAtAnchorMs).toBe(0);
    expect(result.transitions.at(-1)!.kind).toBe('STRUCTURE_EXHAUSTED');
  });

  it('fige le temps en pause, y compris pendant une pause programmée', () => {
    const running = startClock(createClockState(T0), segments, T0);
    const paused = pauseClock(running, segments, T0 + 2 * MINUTE);
    expect(paused.status).toBe('PAUSED');
    expect(paused.remainingAtAnchorMs).toBe(8 * MINUTE);

    const later = viewClock(paused, segments, T0 + 30 * MINUTE);
    expect(later.remainingMs).toBe(8 * MINUTE);

    const resumed = resumeClock(paused, T0 + 30 * MINUTE);
    const view = viewClock(resumed, segments, T0 + 31 * MINUTE);
    expect(view.remainingMs).toBe(7 * MINUTE);
  });

  it('passe au niveau suivant et revient au précédent', () => {
    const running = startClock(createClockState(T0), segments, T0);
    const next = nextSegment(running, segments, T0 + MINUTE).state;
    expect(next.segmentIndex).toBe(1);
    expect(next.remainingAtAnchorMs).toBe(5 * MINUTE);
    expect(next.accumulatedPlayMs).toBe(MINUTE);

    const previous = previousSegment(next, segments, T0 + MINUTE);
    expect(previous.segmentIndex).toBe(0);
    expect(previous.remainingAtAnchorMs).toBe(10 * MINUTE);
  });

  it('ajoute et retire du temps sans passer sous zéro', () => {
    const running = startClock(createClockState(T0), segments, T0);
    const more = addTime(running, segments, 2 * MINUTE, T0);
    expect(viewClock(more, segments, T0).remainingMs).toBe(12 * MINUTE);

    const less = addTime(running, segments, -20 * MINUTE, T0);
    expect(less.remainingAtAnchorMs).toBe(0);
    // À zéro, la vue bascule sur le segment suivant (la pause).
    expect(viewClock(less, segments, T0).segmentIndex).toBe(1);
  });

  it('permet de fixer précisément le temps restant', () => {
    const running = startClock(createClockState(T0), segments, T0);
    const fixed = setRemaining(running, segments, 4 * MINUTE, T0);
    expect(viewClock(fixed, segments, T0).remainingMs).toBe(4 * MINUTE);
  });

  it('reprend avec le temps écoulé (mode A)', () => {
    const checkpoint = startClock(createClockState(T0), segments, T0);
    const recovered = recoverClock(checkpoint, segments, 'CONTINUE_ELAPSED', T0 + 12 * MINUTE);
    expect(recovered.state.segmentIndex).toBe(1);
    expect(recovered.state.remainingAtAnchorMs).toBe(3 * MINUTE);
    expect(recovered.transitions.length).toBe(1);
  });

  it('reprend au dernier point de référence (mode B)', () => {
    const checkpoint = startClock(createClockState(T0), segments, T0);
    const recovered = recoverClock(checkpoint, segments, 'LAST_CHECKPOINT', T0 + 12 * MINUTE);
    expect(recovered.state.segmentIndex).toBe(0);
    expect(recovered.state.remainingAtAnchorMs).toBe(10 * MINUTE);
    expect(recovered.state.status).toBe('RUNNING');
    expect(viewClock(recovered.state, segments, T0 + 12 * MINUTE).remainingMs).toBe(10 * MINUTE);
  });

  it('reprend au dernier point de référence en pause (mode C)', () => {
    const checkpoint = startClock(createClockState(T0), segments, T0);
    const recovered = recoverClock(checkpoint, segments, 'LAST_CHECKPOINT_PAUSED', T0 + 12 * MINUTE);
    expect(recovered.state.status).toBe('PAUSED');
    expect(recovered.state.anchorAt).toBeNull();
    expect(recovered.state.remainingAtAnchorMs).toBe(10 * MINUTE);
  });

  it('clôture le tournoi explicitement', () => {
    const running = startClock(createClockState(T0), segments, T0);
    const completed = completeClock(running, T0 + MINUTE);
    expect(completed.status).toBe('COMPLETED');
    expect(completed.anchorAt).toBeNull();
  });

  it('formate le temps', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(65_000)).toBe('01:05');
    expect(formatClock(3_665_000)).toBe('1:01:05');
  });
});
