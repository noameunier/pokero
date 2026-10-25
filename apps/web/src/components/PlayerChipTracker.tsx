import { useEffect, useMemo, useState } from 'react';
import { Coins } from 'lucide-react';
import { formatChips } from '../lib/format';
import type { SpectatorPayload } from '../lib/types';
import { Badge, Button, Card, Field, Input, Select } from './ui';

interface TrackerEntry {
  stack: number;
  updatedAt: string;
  levelNumber: number | null;
}

interface StoredTracker {
  participantId: string;
  stack: number;
  updatedAt: string;
  levelNumber: number | null;
  history: TrackerEntry[];
}

function storageKey(tournamentId: string): string {
  return `pokero.player-tracker.${tournamentId}`;
}

function readTracker(tournamentId: string): StoredTracker | null {
  try {
    const raw = localStorage.getItem(storageKey(tournamentId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredTracker>;
    if (
      typeof parsed.participantId !== 'string' ||
      typeof parsed.stack !== 'number' ||
      !Number.isFinite(parsed.stack)
    ) {
      return null;
    }
    return {
      participantId: parsed.participantId,
      stack: parsed.stack,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      levelNumber:
        typeof parsed.levelNumber === 'number' ? parsed.levelNumber : null,
      history: Array.isArray(parsed.history) ? parsed.history.slice(0, 5) : [],
    };
  } catch {
    return null;
  }
}

export function PlayerChipTracker({
  tournamentId,
  participants,
  startingStack,
  levelNumber,
}: {
  tournamentId: string;
  participants: SpectatorPayload['participants'];
  startingStack: number;
  levelNumber: number | null;
}) {
  const [tracker, setTracker] = useState<StoredTracker | null>(() =>
    readTracker(tournamentId),
  );
  const [selectedId, setSelectedId] = useState('');
  const [stackInput, setStackInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const activeParticipants = useMemo(
    () => participants.filter((participant) => participant.status === 'ACTIVE'),
    [participants],
  );
  const trackedParticipant = tracker
    ? participants.find((participant) => participant.id === tracker.participantId)
    : null;
  const trackingUnavailable =
    !trackedParticipant || trackedParticipant.status === 'ELIMINATED';

  useEffect(() => {
    const stored = readTracker(tournamentId);
    setTracker(stored);
    setSelectedId('');
    setStackInput(stored ? String(stored.stack) : '');
    setError(null);
  }, [tournamentId]);

  useEffect(() => {
    if (!tracker) return;
    setStackInput(String(tracker.stack));
    try {
      localStorage.setItem(storageKey(tournamentId), JSON.stringify(tracker));
    } catch {
      // Le suivi reste fonctionnel en mémoire si le stockage local est indisponible.
    }
  }, [tracker, tournamentId]);

  const startTracking = () => {
    const participant = activeParticipants.find((item) => item.id === selectedId);
    if (!participant) {
      setError('Choisissez votre nom dans la liste.');
      return;
    }
    const now = new Date().toISOString();
    setTracker({
      participantId: participant.id,
      stack: Math.max(0, startingStack),
      updatedAt: now,
      levelNumber,
      history: [],
    });
    setError(null);
  };

  const updateStack = () => {
    const value = Number.parseInt(stackInput, 10);
    if (!Number.isFinite(value) || value < 0) {
      setError('Indiquez un nombre de jetons positif ou nul.');
      return;
    }
    setError(null);
    const now = new Date().toISOString();
    setTracker((current) => {
      if (!current) return current;
      return {
        ...current,
        stack: value,
        updatedAt: now,
        levelNumber,
        history: [
          { stack: value, updatedAt: now, levelNumber },
          ...current.history,
        ].slice(0, 5),
      };
    });
  };

  const stopTracking = () => {
    setTracker(null);
    setSelectedId('');
    setStackInput('');
    setError(null);
    try {
      localStorage.removeItem(storageKey(tournamentId));
    } catch {
      // Rien à faire si le stockage local est indisponible.
    }
  };

  const lastUpdate = tracker
    ? new Date(tracker.updatedAt).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <Card className="p-4 sm:p-5" as="section">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-cream-400">
            <Coins className="size-3.5 text-gold-400" aria-hidden />
            Suivre mes jetons
          </h2>
          <p className="mt-1 text-[11.5px] leading-relaxed text-cream-400">
            Optionnel et privé : le suivi reste sur cet appareil, sans compte.
          </p>
        </div>
        <Badge tone={tracker ? 'success' : 'neutral'}>{tracker ? 'Actif' : 'Local'}</Badge>
      </div>

      {!tracker ? (
        <div className="mt-4 space-y-3">
          <Field label="Choisir mon nom" htmlFor="player-tracker-name">
            <Select
              id="player-tracker-name"
              value={selectedId}
              onChange={(event) => {
                setSelectedId(event.target.value);
                setError(null);
              }}
            >
              <option value="">Sélectionner un joueur</option>
              {activeParticipants.map((participant) => (
                <option key={participant.id} value={participant.id}>
                  {participant.displayName}
                </option>
              ))}
            </Select>
          </Field>
          {activeParticipants.length === 0 ? (
            <p className="text-[11.5px] text-cream-500">
              Aucun joueur en course pour le moment.
            </p>
          ) : (
            <Button
              type="button"
              onClick={startTracking}
              disabled={!selectedId}
              className="w-full"
            >
              Suivre ce joueur
            </Button>
          )}
          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-cream-500">
                Joueur suivi
              </p>
              <p className="truncate text-sm font-semibold text-cream-100">
                {trackedParticipant?.displayName ?? 'Joueur introuvable'}
              </p>
            </div>
            <button
              type="button"
              onClick={stopTracking}
              className="text-[11px] font-semibold text-cream-400 underline decoration-white/20 underline-offset-2 transition hover:text-cream-200"
            >
              Arrêter le suivi
            </button>
          </div>

          {!trackedParticipant ? (
            <p className="rounded-[var(--radius-sm)] border border-warning-500/25 bg-warning-500/[0.07] px-3 py-2 text-[11.5px] text-warning-300">
              Ce joueur n’est plus dans la liste du tournoi. Arrêtez le suivi pour en choisir un autre.
            </p>
          ) : trackedParticipant.status === 'ELIMINATED' ? (
            <p className="rounded-[var(--radius-sm)] border border-warning-500/25 bg-warning-500/[0.07] px-3 py-2 text-[11.5px] text-warning-300">
              Ce joueur est éliminé. Le suivi est figé.
            </p>
          ) : null}

          <div className="rounded-[var(--radius-md)] border border-gold-500/20 bg-gold-500/[0.06] px-4 py-3 text-center">
            <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-cream-500">
              Mon tapis
            </p>
            <p className="tabular mt-0.5 font-display text-3xl text-gold-200">
              {formatChips(tracker.stack)}
            </p>
            <p className="mt-0.5 text-[10.5px] text-cream-500">
              {tracker.levelNumber ? `Niveau ${tracker.levelNumber} · ` : ''}
              Mis à jour à {lastUpdate}
            </p>
            {tracker.history.length === 0 ? (
              <p className="mt-1 text-[10.5px] text-cream-500">
                Valeur de départ. Ajustez-la à votre tapis réel.
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field label="Nouveau tapis" htmlFor="player-tracker-stack" className="flex-1">
              <Input
                id="player-tracker-stack"
                type="number"
                inputMode="numeric"
                min={0}
                value={stackInput}
                disabled={trackingUnavailable}
                onChange={(event) => setStackInput(event.target.value)}
              />
            </Field>
            <Button
              type="button"
              onClick={updateStack}
              disabled={trackingUnavailable}
              className="w-full sm:w-auto"
            >
              Mettre à jour
            </Button>
          </div>
          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}

          {tracker.history.length > 1 ? (
            <div className="border-t border-white/[0.06] pt-2">
              <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-cream-500">
                Dernières mises à jour
              </p>
              <ul className="mt-1 space-y-0.5">
                {tracker.history.slice(1, 4).map((entry) => (
                  <li
                    key={`${entry.updatedAt}-${entry.stack}`}
                    className="flex items-center justify-between gap-2 text-[11px] text-cream-400"
                  >
                    <span className="tabular">{formatChips(entry.stack)}</span>
                    <span className="text-cream-500">
                      {new Date(entry.updatedAt).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="text-[10.5px] leading-relaxed text-cream-500">
            Ce suivi n’est pas envoyé à l’organisateur. Il reste disponible sur cet appareil
            jusqu’à ce que vous l’arrêtiez.
          </p>
        </div>
      )}
    </Card>
  );
}
