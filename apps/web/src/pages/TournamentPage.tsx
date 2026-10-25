import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  CheckCircle2,
  Coffee,
  Copy,
  Link2,
  Lock,
  LockOpen,
  Monitor,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipBack,
  SkipForward,
  Timer,
  Trash2,
  Trophy,
  UserMinus,
  Users,
  XCircle,
} from 'lucide-react';
import { api, ApiError, newIdempotencyKey } from '../lib/api';
import {
  formatChips,
  formatDate,
  statusTone,
  useApiErrorMessage,
  useStatusLabel,
} from '../lib/format';
import { useTournamentSocket } from '../lib/realtime';
import type { TournamentDetail } from '../lib/types';
import { ClockFace, ClockProgress, useServerSyncedRemaining } from '../components/Clock';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Tabs } from '../components/ui';
import { useToast } from '../components/Toast';

const EVENT_LABELS: Record<string, string> = {
  TOURNAMENT_CREATED: 'Tournoi créé',
  PARTICIPANT_ADDED: 'Joueur inscrit',
  PARTICIPANT_REMOVED: 'Joueur retiré',
  CLOCK_START: 'Chronomètre démarré',
  CLOCK_PAUSE: 'Chronomètre en pause',
  CLOCK_RESUME: 'Chronomètre repris',
  CLOCK_NEXT: 'Niveau suivant',
  CLOCK_PREVIOUS: 'Niveau précédent',
  CLOCK_ADD_TIME: 'Temps ajouté',
  CLOCK_SET_REMAINING: 'Temps ajusté',
  CLOCK_RECOVER: 'Chronomètre récupéré',
  CLOCK_COMPLETE: 'Chronomètre clôturé',
  CLOCK_CANCEL: 'Tournoi annulé',
  REBUY: 'Rebuy',
  ADD_ON: 'Add-on',
  ELIMINATION: 'Élimination',
  ELIMINATION_UNDONE: 'Élimination annulée',
  PIN_UNLOCKED: 'PIN déverrouillé',
  TOURNAMENT_COMPLETED: 'Tournoi terminé',
};

type TabKey = 'players' | 'structure' | 'ranking' | 'history';

function readPinToken(tournamentId: string): string | null {
  try {
    const raw = sessionStorage.getItem(`pokero.pin.${tournamentId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token: string; expiresAt: number };
    if (!parsed.token || parsed.expiresAt <= Date.now()) return null;
    return parsed.token;
  } catch {
    return null;
  }
}

export function TournamentPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success, error: notifyError, notify } = useToast();
  const errorMessage = useApiErrorMessage();
  const statusLabel = useStatusLabel();

  const [tab, setTab] = useState<TabKey>('players');
  const [newPlayer, setNewPlayer] = useState('');
  const [pinToken, setPinToken] = useState<string | null>(() => readPinToken(id));
  const [pinModal, setPinModal] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [showSpectator, setShowSpectator] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [extraSeconds, setExtraSeconds] = useState('60');

  const detailQuery = useQuery({
    queryKey: ['tournament', id],
    queryFn: () => api.get<TournamentDetail>(`/api/tournaments/${id}`),
    enabled: Boolean(id),
    refetchInterval: 30_000,
  });

  const socket = useTournamentSocket(id);
  const detail = detailQuery.data;

  useEffect(() => {
    if (socket.refreshNonce > 0) {
      void queryClient.invalidateQueries({ queryKey: ['tournament', id] });
    }
  }, [socket.refreshNonce, queryClient, id]);

  const heartbeat = useCallback(() => {
    void api.post(`/api/tournaments/${id}/heartbeat`).catch(() => undefined);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    heartbeat();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') heartbeat();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [id, heartbeat]);

  const clock = socket.clock ?? detail?.tournament.clock ?? null;
  const remaining = useServerSyncedRemaining(clock);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['tournament', id] });
    void queryClient.invalidateQueries({ queryKey: ['tournaments'] });
  }, [queryClient, id]);

  const handleError = useCallback(
    (caught: unknown) => {
      if (caught instanceof ApiError && caught.code === 'PIN_REQUIRED') {
        setPinToken(null);
        setPinModal(true);
      }
      if (caught instanceof ApiError && caught.code === 'VERSION_CONFLICT') {
        invalidate();
      }
      notifyError(errorMessage(caught));
    },
    [errorMessage, invalidate, notifyError],
  );

  const clockMutation = useMutation({
    mutationFn: (input: {
      action: 'START' | 'PAUSE' | 'RESUME' | 'NEXT' | 'PREVIOUS' | 'ADD_TIME' | 'SET_REMAINING' | 'COMPLETE' | 'CANCEL' | 'RECOVER';
      seconds?: number;
      recoveryMode?: 'CONTINUE_ELAPSED' | 'LAST_CHECKPOINT' | 'LAST_CHECKPOINT_PAUSED';
      label: string;
    }) => {
      const expectedVersion = clock?.version ?? 0;
      return api.postWithHeaders<{ clock: { version: number }; replayed: boolean }>(
        `/api/tournaments/${id}/clock`,
        {
          action: input.action,
          seconds: input.seconds,
          recoveryMode: input.recoveryMode,
          expectedVersion,
          idempotencyKey: newIdempotencyKey(input.action.toLowerCase()),
        },
        pinToken ? { 'x-pin-unlock': pinToken } : {},
      );
    },
    onSuccess: (_data, variables) => {
      success(variables.label);
      invalidate();
    },
    onError: handleError,
  });

  const addParticipantMutation = useMutation({
    mutationFn: (displayName: string) =>
      api.post(`/api/tournaments/${id}/participants`, { displayName }),
    onSuccess: () => {
      setNewPlayer('');
      invalidate();
    },
    onError: handleError,
  });

  const removeParticipantMutation = useMutation({
    mutationFn: (participantId: string) =>
      api.delete(`/api/tournaments/${id}/participants/${participantId}`),
    onSuccess: () => {
      success('Joueur retiré.');
      invalidate();
    },
    onError: handleError,
  });

  const eliminateMutation = useMutation({
    mutationFn: (participantId: string) =>
      api.postWithHeaders(
        `/api/tournaments/${id}/eliminations`,
        { participantId },
        pinToken ? { 'x-pin-unlock': pinToken } : {},
      ),
    onSuccess: () => {
      success('Élimination enregistrée.');
      invalidate();
    },
    onError: handleError,
  });

  const undoEliminationMutation = useMutation({
    mutationFn: (participantId: string) =>
      api.delete(`/api/tournaments/${id}/eliminations/${participantId}`),
    onSuccess: () => {
      success('Élimination annulée.');
      invalidate();
    },
    onError: handleError,
  });

  const rebuyMutation = useMutation({
    mutationFn: (participantId: string) =>
      api.postWithHeaders(
        `/api/tournaments/${id}/rebuys`,
        { participantId },
        pinToken ? { 'x-pin-unlock': pinToken } : {},
      ),
    onSuccess: () => {
      success('Rebuy enregistré.');
      invalidate();
    },
    onError: handleError,
  });

  const addOnMutation = useMutation({
    mutationFn: (participantId: string) =>
      api.postWithHeaders(
        `/api/tournaments/${id}/add-ons`,
        { participantId },
        pinToken ? { 'x-pin-unlock': pinToken } : {},
      ),
    onSuccess: () => {
      success('Add-on enregistré.');
      invalidate();
    },
    onError: handleError,
  });

  const unlockMutation = useMutation({
    mutationFn: (pin: string) =>
      api.post<{ unlocked: boolean; token: string | null; expiresAt: number | null }>(
        `/api/tournaments/${id}/pin/unlock`,
        { pin },
      ),
    onSuccess: (data) => {
      if (data.token) {
        sessionStorage.setItem(
          `pokero.pin.${id}`,
          JSON.stringify({ token: data.token, expiresAt: data.expiresAt ?? Date.now() + 1_800_000 }),
        );
        setPinToken(data.token);
      }
      setPinModal(false);
      setPinValue('');
      success('Tournoi déverrouillé pour 30 minutes.');
    },
    onError: (caught) => notifyError(errorMessage(caught)),
  });

  const spectatorMutation = useMutation({
    mutationFn: () =>
      api.post<{ token: string; id: string; url: string }>(
        `/api/tournaments/${id}/spectator-tokens`,
      ),
    onSuccess: (data) => {
      setCreatedLink(data.url);
      setShowSpectator(true);
      invalidate();
    },
    onError: handleError,
  });

  const revokeTokenMutation = useMutation({
    mutationFn: (tokenId: string) =>
      api.delete(`/api/tournaments/${id}/spectator-tokens/${tokenId}`),
    onSuccess: () => {
      success('Lien révoqué.');
      invalidate();
    },
    onError: handleError,
  });

  const finalizeMutation = useMutation({
    mutationFn: () =>
      api.postWithHeaders(
        `/api/tournaments/${id}/finalize`,
        {},
        pinToken ? { 'x-pin-unlock': pinToken } : {},
      ),
    onSuccess: () => {
      success('Tournoi clôturé. Classement enregistré.');
      invalidate();
    },
    onError: handleError,
  });

  const publicRankingMutation = useMutation({
    mutationFn: (value: boolean) =>
      api.patch(`/api/tournaments/${id}`, { publicRanking: value }),
    onSuccess: () => invalidate(),
    onError: handleError,
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/tournaments/${id}`),
    onSuccess: () => {
      success('Tournoi supprimé.');
      navigate('/');
    },
    onError: handleError,
  });

  const orderedParticipants = useMemo(() => {
    if (!detail) return [];
    const active = detail.tournament.participants.filter(
      (participant) => participant.status === 'ACTIVE',
    );
    const eliminated = detail.tournament.participants
      .filter((participant) => participant.status === 'ELIMINATED')
      .sort((a, b) => (b.eliminationSequence ?? 0) - (a.eliminationSequence ?? 0));
    return [...active, ...eliminated];
  }, [detail]);

  const lastElimination = useMemo(() => {
    if (!detail) return null;
    return [...detail.eliminations].sort((a, b) => b.sequence - a.sequence)[0] ?? null;
  }, [detail]);

  const participantName = useCallback(
    (participantId: string) =>
      detail?.tournament.participants.find((participant) => participant.id === participantId)
        ?.displayName ?? 'Joueur',
    [detail],
  );

  if (detailQuery.isLoading) {
    return <div className="py-24 text-center text-cream-300/60">{t('common.loading')}</div>;
  }

  if (detailQuery.isError || !detail) {
    return (
      <div className="space-y-4 py-16 text-center">
        <p className="text-cream-200">{errorMessage(detailQuery.error)}</p>
        <Link to="/" className="btn-secondary">
          {t('nav.dashboard')}
        </Link>
      </div>
    );
  }

  const { tournament } = detail;
  const locked = tournament.pinRequired && !pinToken;
  const isOpen = ['DRAFT', 'READY', 'RUNNING', 'PAUSED', 'RECOVERY_PENDING'].includes(
    tournament.status,
  );
  const isFinished = tournament.status === 'COMPLETED' || tournament.status === 'CANCELLED';
  const canStart = tournament.status === 'DRAFT' || tournament.status === 'READY';
  const canPause = tournament.status === 'RUNNING';
  const canResume = tournament.status === 'PAUSED' || tournament.status === 'RECOVERY_PENDING';
  const canManagePlayers = tournament.status === 'DRAFT' || tournament.status === 'READY';
  const canRecord = tournament.status === 'RUNNING' || tournament.status === 'PAUSED';
  const activePlayers = tournament.participants.filter(
    (participant) => participant.status === 'ACTIVE',
  );
  const disabled = locked || clockMutation.isPending;

  const sendClock = (
    action: Parameters<typeof clockMutation.mutate>[0]['action'],
    extra: { seconds?: number; recoveryMode?: 'CONTINUE_ELAPSED' | 'LAST_CHECKPOINT' | 'LAST_CHECKPOINT_PAUSED'; label: string },
  ) => {
    clockMutation.mutate({ action, ...extra });
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/" className="btn-ghost btn-sm p-2" aria-label={t('common.back')}>
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate font-display text-xl font-bold text-cream-50 sm:text-2xl">
                {tournament.name}
              </h1>
              <span className={`badge ${statusTone(tournament.status)}`}>
                {statusLabel(tournament.status)}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-cream-300/60">
              {tournament.settings?.chipCaseName ?? '—'} ·{' '}
              {t('common.level')} {clock?.playLevelNumber ?? '—'} ·{' '}
              {t('common.players')} {tournament.participants.length}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/projection/${id}`} className="btn-secondary btn-sm">
            <Monitor className="size-4" />
            {t('tournament.projection')}
          </Link>
          <Button variant="secondary" size="sm" onClick={() => setShowSpectator(true)}>
            <Link2 className="size-4" />
            {t('tournament.share')}
          </Button>
        </div>
      </header>

      {locked ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-950/25 px-4 py-3 text-sm text-amber-100">
          <span className="flex items-center gap-2">
            <Lock className="size-4" />
            {t('tournament.pinRequired')}
          </span>
          <Button size="sm" variant="secondary" onClick={() => setPinModal(true)}>
            {t('tournament.unlock')}
          </Button>
        </div>
      ) : tournament.pinRequired && pinToken ? (
        <div className="flex items-center gap-2 text-xs text-emerald-300/80">
          <LockOpen className="size-3.5" /> Tournoi déverrouillé
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-5">
          <Card className="overflow-hidden border-gold-500/20 bg-gradient-to-br from-felt-800/60 to-felt-950/40">
            {clock ? (
              <>
                <ClockFace clock={clock} remainingMs={remaining} size="lg" />
                <div className="mt-2">
                  <ClockProgress clock={clock} remainingMs={remaining} />
                </div>
              </>
            ) : (
              <p className="py-10 text-center text-cream-300/60">Chronomètre indisponible.</p>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              {canStart ? (
                <Button
                  disabled={disabled}
                  loading={clockMutation.isPending}
                  onClick={() => sendClock('START', { label: 'Tournoi démarré.' })}
                >
                  <Play className="size-4" fill="currentColor" />
                  {t('tournament.start')}
                </Button>
              ) : null}
              {canPause ? (
                <Button
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => sendClock('PAUSE', { label: 'Chronomètre en pause.' })}
                >
                  <Pause className="size-4" />
                  {t('tournament.pause')}
                </Button>
              ) : null}
              {canResume ? (
                <Button
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => sendClock('RESUME', { label: 'Chronomètre repris.' })}
                >
                  <Play className="size-4" />
                  {t('tournament.resume')}
                </Button>
              ) : null}
              {isOpen && !canStart ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={disabled}
                    onClick={() => sendClock('PREVIOUS', { label: 'Niveau précédent.' })}
                  >
                    <SkipBack className="size-4" />
                    <span className="hidden sm:inline">{t('tournament.previousLevel')}</span>
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={disabled}
                    onClick={() => sendClock('NEXT', { label: 'Niveau suivant.' })}
                  >
                    <span className="hidden sm:inline">{t('tournament.nextLevel')}</span>
                    <SkipForward className="size-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={disabled}
                    onClick={() => sendClock('ADD_TIME', { seconds: 60, label: 'Une minute ajoutée.' })}
                  >
                    <Timer className="size-4" />
                    {t('tournament.addMinute')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={disabled}
                    onClick={() =>
                      sendClock('ADD_TIME', { seconds: 300, label: 'Cinq minutes ajoutées.' })
                    }
                  >
                    {t('tournament.addFiveMinutes')}
                  </Button>
                </>
              ) : null}
            </div>

            {isOpen ? (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2 border-t border-white/10 pt-3 text-xs">
                <span className="text-cream-300/50">Ajuster le temps :</span>
                <Input
                  className="h-8 w-20 py-1 text-xs"
                  type="number"
                  value={extraSeconds}
                  onChange={(event) => setExtraSeconds(event.target.value)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() =>
                    sendClock('SET_REMAINING', {
                      seconds: Number(extraSeconds) || 0,
                      label: 'Temps restant ajusté.',
                    })
                  }
                >
                  Définir
                </Button>
                <span className="mx-1 text-cream-300/30">|</span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => sendClock('RECOVER', { recoveryMode: 'CONTINUE_ELAPSED', label: 'Chrono recalé sur le temps écoulé.' })}
                >
                  <RotateCcw className="size-3.5" />
                  Temps écoulé
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => sendClock('RECOVER', { recoveryMode: 'LAST_CHECKPOINT', label: 'Chrono restauré au dernier point de contrôle.' })}
                >
                  Dernier checkpoint
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => sendClock('RECOVER', { recoveryMode: 'LAST_CHECKPOINT_PAUSED', label: 'Chrono restauré en pause.' })}
                >
                  Checkpoint + pause
                </Button>
              </div>
            ) : null}
          </Card>

          <Tabs<TabKey>
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'players', label: t('tournament.players'), count: tournament.participants.length },
              { value: 'structure', label: t('tournament.structure') },
              { value: 'ranking', label: t('tournament.ranking') },
              { value: 'history', label: t('tournament.history') },
            ]}
          />

          {tab === 'players' ? (
            <Card>
              {canManagePlayers ? (
                <form
                  className="mb-4 flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!newPlayer.trim()) return;
                    addParticipantMutation.mutate(newPlayer.trim());
                  }}
                >
                  <Input
                    value={newPlayer}
                    maxLength={40}
                    placeholder={t('tournament.playerName')}
                    onChange={(event) => setNewPlayer(event.target.value)}
                  />
                  <Button type="submit" loading={addParticipantMutation.isPending}>
                    <Plus className="size-4" />
                    {t('tournament.addPlayer')}
                  </Button>
                </form>
              ) : null}

              {orderedParticipants.length === 0 ? (
                <EmptyState
                  icon={<Users className="size-9" />}
                  title={t('tournament.noPlayers')}
                  description="Ajoutez les joueurs inscrits avant de démarrer le tournoi."
                />
              ) : (
                <ul className="space-y-2">
                  {orderedParticipants.map((participant, index) => {
                    const isEliminated = participant.status === 'ELIMINATED';
                    return (
                      <li
                        key={participant.id}
                        className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5 ${
                          isEliminated
                            ? 'border-white/5 bg-white/[0.01] opacity-60'
                            : 'border-white/10 bg-white/[0.03]'
                        }`}
                      >
                        <span
                          className={`grid size-7 shrink-0 place-items-center rounded-lg text-xs font-bold ${
                            isEliminated
                              ? 'bg-white/5 text-cream-300/40'
                              : 'bg-gold-500/15 text-gold-300'
                          }`}
                        >
                          {isEliminated ? participant.eliminationSequence : index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-sm font-medium ${isEliminated ? 'text-cream-300/60 line-through' : 'text-cream-50'}`}>
                            {participant.displayName}
                          </span>
                          <span className="text-[11px] text-cream-300/50">
                            {participant.rebuyCount > 0
                              ? `${participant.rebuyCount} rebuy · `
                              : ''}
                            {participant.addOnCount > 0 ? `${participant.addOnCount} add-on · ` : ''}
                            {isEliminated ? 'Éliminé' : 'En course'}
                          </span>
                        </span>

                        {!isEliminated && canRecord ? (
                          <>
                            {tournament.settings?.rebuy.enabled ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={locked || rebuyMutation.isPending}
                                onClick={() => rebuyMutation.mutate(participant.id)}
                              >
                                {t('tournament.rebuy')}
                              </Button>
                            ) : null}
                            {tournament.settings?.addOn.enabled ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={locked || addOnMutation.isPending}
                                onClick={() => addOnMutation.mutate(participant.id)}
                              >
                                {t('tournament.addOn')}
                              </Button>
                            ) : null}
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={locked || eliminateMutation.isPending}
                              onClick={() => eliminateMutation.mutate(participant.id)}
                            >
                              <UserMinus className="size-3.5" />
                              {t('tournament.eliminate')}
                            </Button>
                          </>
                        ) : null}

                        {canManagePlayers ? (
                          <button
                            type="button"
                            aria-label={t('common.delete')}
                            onClick={() => removeParticipantMutation.mutate(participant.id)}
                            className="grid size-8 place-items-center rounded-lg text-cream-300/40 hover:bg-red-500/10 hover:text-red-300"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}

              {canRecord && lastElimination ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3"
                  disabled={locked || undoEliminationMutation.isPending}
                  onClick={() => undoEliminationMutation.mutate(lastElimination.participantId)}
                >
                  <RotateCcw className="size-3.5" />
                  {t('tournament.undoElimination')} ({participantName(lastElimination.participantId)})
                </Button>
              ) : null}
            </Card>
          ) : null}

          {tab === 'structure' ? (
            <Card>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-cream-50">{t('tournament.structure')}</h2>
                <span className="text-xs text-cream-300/50">
                  {tournament.levels.filter((level) => level.kind === 'PLAY').length} niveaux
                </span>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-[10px] uppercase tracking-wider text-cream-300/50">
                    <tr>
                      <th className="px-2 py-2">#</th>
                      <th className="px-2 py-2">SB</th>
                      <th className="px-2 py-2">BB</th>
                      <th className="px-2 py-2">Ante</th>
                      <th className="px-2 py-2">Durée</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tournament.levels.map((level, index) => {
                      const isCurrent = clock?.levelPosition === level.position;
                      return (
                        <tr
                          key={level.id ?? index}
                          className={`border-t border-white/5 ${
                            isCurrent ? 'bg-gold-500/10 text-gold-200' : 'text-cream-200/80'
                          }`}
                        >
                          <td className="px-2 py-1.5">{level.position}</td>
                          <td className="px-2 py-1.5 tabular">
                            {level.kind === 'BREAK' ? (
                              <span className="inline-flex items-center gap-1 text-cream-300/60">
                                <Coffee className="size-3.5" /> Pause
                              </span>
                            ) : (
                              formatChips(level.smallBlind)
                            )}
                          </td>
                          <td className="px-2 py-1.5 tabular">
                            {level.kind === 'BREAK' ? '—' : formatChips(level.bigBlind)}
                          </td>
                          <td className="px-2 py-1.5 tabular">
                            {level.ante ? formatChips(level.ante) : '—'}
                          </td>
                          <td className="px-2 py-1.5">{level.durationMinutes} min</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}

          {tab === 'ranking' ? (
            <Card>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-cream-50">{t('tournament.ranking')}</h2>
                <Badge tone={tournament.publicRanking ? 'gold' : 'neutral'}>
                  {tournament.publicRanking ? 'Public' : 'Privé'}
                </Badge>
              </div>
              {detail.ranking && detail.ranking.entries.length > 0 ? (
                <ol className="mt-3 space-y-1.5">
                  {detail.ranking.entries.map((entry) => (
                    <li
                      key={entry.participantId}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                        entry.rank === 1
                          ? 'bg-gold-500/10 text-gold-200'
                          : 'bg-white/[0.02] text-cream-200/80'
                      }`}
                    >
                      <span className="w-6 text-center font-bold tabular">
                        {entry.rank === 1 ? <Trophy className="mx-auto size-4" /> : entry.rank}
                      </span>
                      <span className="flex-1 truncate">
                        {participantName(entry.participantId)}
                      </span>
                      {entry.eliminated ? (
                        <span className="text-xs text-cream-300/40">éliminé</span>
                      ) : (
                        <span className="text-xs text-emerald-300/70">en course</span>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-3 text-sm text-cream-300/60">
                  Le classement se construit au fil des éliminations.
                </p>
              )}

              <div className="mt-4 border-t border-white/10 pt-4">
                <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
                  <span className="text-cream-200">Rendre le classement public</span>
                  <input
                    type="checkbox"
                    checked={tournament.publicRanking}
                    onChange={(event) => publicRankingMutation.mutate(event.target.checked)}
                    className="size-4 accent-gold-500"
                  />
                </label>
              </div>
            </Card>
          ) : null}

          {tab === 'history' ? (
            <Card>
              <h2 className="text-lg font-semibold text-cream-50">{t('tournament.history')}</h2>
              <ol className="mt-3 space-y-2">
                {detail.events.length === 0 ? (
                  <p className="text-sm text-cream-300/60">Aucun événement.</p>
                ) : (
                  detail.events.map((event) => (
                    <li key={event.id} className="flex items-start gap-3 text-sm">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gold-500/60" />
                      <span className="flex-1">
                        <span className="text-cream-200">
                          {EVENT_LABELS[event.type] ?? event.type}
                        </span>
                        <span className="ml-2 text-xs text-cream-300/40">
                          {formatDate(event.createdAt)}
                        </span>
                      </span>
                      <span className="text-xs text-cream-300/30">v{event.version}</span>
                    </li>
                  ))
                )}
              </ol>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-cream-300/60">
              Informations
            </h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-cream-300/60">Cave</dt>
                <dd className="tabular font-semibold text-cream-50">
                  {formatChips(tournament.settings?.buyIn.targetBuyIn)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-cream-300/60">Joueurs</dt>
                <dd className="tabular text-cream-100">
                  {activePlayers.length} / {tournament.participants.length}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-cream-300/60">Rebuys</dt>
                <dd className="tabular text-cream-100">
                  {detail.rebuys.filter((rebuy) => !rebuy.cancelledAt).length}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-cream-300/60">Démarrage</dt>
                <dd className="text-cream-100">{formatDate(tournament.startedAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-cream-300/60">Fin</dt>
                <dd className="text-cream-100">{formatDate(tournament.completedAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-cream-300/60">Version chrono</dt>
                <dd className="tabular text-cream-100">v{clock?.version ?? 0}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-cream-300/60">
              Actions
            </h2>
            <div className="mt-3 space-y-2">
              {!isFinished ? (
                <Button
                  className="w-full"
                  disabled={locked || finalizeMutation.isPending || activePlayers.length !== 1}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Déclarer ${activePlayers[0]?.displayName ?? 'le dernier joueur'} vainqueur et clôturer ?`,
                      )
                    ) {
                      finalizeMutation.mutate();
                    }
                  }}
                >
                  <CheckCircle2 className="size-4" />
                  {t('tournament.finalize')}
                </Button>
              ) : null}
              {!isFinished ? (
                <Button
                  variant="secondary"
                  className="w-full"
                  disabled={locked || clockMutation.isPending}
                  onClick={() => {
                    if (window.confirm('Annuler ce tournoi ? Les réservations seront libérées.')) {
                      sendClock('CANCEL', { label: 'Tournoi annulé.' });
                    }
                  }}
                >
                  <XCircle className="size-4" />
                  {t('tournament.cancelTournament')}
                </Button>
              ) : null}
              {tournament.status === 'COMPLETED' || tournament.status === 'CANCELLED' || tournament.status === 'DRAFT' ? (
                <Button
                  variant="danger"
                  className="w-full"
                  loading={deleteMutation.isPending}
                  onClick={() => {
                    if (window.confirm('Supprimer définitivement ce tournoi ?')) {
                      deleteMutation.mutate();
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                  {t('common.delete')}
                </Button>
              ) : null}
              {activePlayers.length !== 1 && !isFinished ? (
                <p className="text-xs text-cream-300/50">
                  Il doit rester exactement un joueur en course pour clôturer.
                </p>
              ) : null}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-cream-300/60">
                Spectateurs
              </h2>
              <Link2 className="size-4 text-gold-500/60" />
            </div>
            <p className="mt-2 text-xs text-cream-300/60">{t('tournament.spectatorHint')}</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3 w-full"
              loading={spectatorMutation.isPending}
              onClick={() => spectatorMutation.mutate()}
            >
              <Plus className="size-4" />
              {t('tournament.createSpectatorLink')}
            </Button>
            {createdLink ? (
              <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-2.5">
                <p className="break-all text-xs text-cream-200">{createdLink}</p>
                <div className="mt-2 flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(createdLink);
                      notify(t('common.copied'));
                    }}
                  >
                    <Copy className="size-3.5" />
                    {t('common.copy')}
                  </Button>
                  <a
                    href={createdLink}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-ghost btn-sm"
                  >
                    Ouvrir
                  </a>
                </div>
              </div>
            ) : null}
            {detail.spectatorTokens.length > 0 ? (
              <ul className="mt-3 space-y-1.5">
                {detail.spectatorTokens.map((token) => (
                  <li
                    key={token.id}
                    className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-xs"
                  >
                    <span className="flex-1 text-cream-300/70">{formatDate(token.createdAt)}</span>
                    <button
                      type="button"
                      onClick={() => revokeTokenMutation.mutate(token.id)}
                      className="text-red-300/70 hover:text-red-200"
                    >
                      {t('tournament.revoke')}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-cream-300/40">Aucun lien actif.</p>
            )}
          </Card>

          <Card>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-cream-300/60">
              Diffusion
            </h2>
            <p className="mt-2 text-xs text-cream-300/60">
              Ouvrez l’écran de projection sur un second écran ou une TV. Le chronomètre reste
              synchronisé au serveur.
            </p>
            <Link to={`/projection/${id}`} className="btn-primary btn-sm mt-3 w-full">
              <Monitor className="size-4" />
              {t('tournament.projection')}
            </Link>
            <div className="mt-3 flex items-center justify-between text-xs text-cream-300/60">
              <span>Connexion temps réel</span>
              <span
                className={`inline-flex items-center gap-1.5 ${
                  socket.connected ? 'text-emerald-300' : 'text-amber-300'
                }`}
              >
                <span
                  className={`size-1.5 rounded-full ${
                    socket.connected ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
                {socket.connected ? 'Active' : 'Reconnexion…'}
              </span>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={pinModal}
        onClose={() => setPinModal(false)}
        title={t('tournament.unlock')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPinModal(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              loading={unlockMutation.isPending}
              disabled={!/^\d{4,8}$/.test(pinValue)}
              onClick={() => unlockMutation.mutate(pinValue)}
            >
              {t('tournament.unlock')}
            </Button>
          </>
        }
      >
        <Field label={t('tournament.pin')} hint="Le déverrouillage dure 30 minutes.">
          <Input
            inputMode="numeric"
            pattern="\d{4,8}"
            maxLength={8}
            autoFocus
            value={pinValue}
            onChange={(event) => setPinValue(event.target.value.replace(/\D/g, ''))}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && /^\d{4,8}$/.test(pinValue)) {
                unlockMutation.mutate(pinValue);
              }
            }}
          />
        </Field>
      </Modal>

      <Modal
        open={showSpectator}
        onClose={() => setShowSpectator(false)}
        title={t('tournament.share')}
        wide
      >
        <div className="space-y-4">
          <p className="text-sm text-cream-300/70">{t('tournament.spectatorHint')}</p>
          {createdLink ? (
            <div className="rounded-xl border border-gold-500/30 bg-gold-500/5 p-3">
              <p className="break-all text-sm text-cream-100">{createdLink}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(createdLink);
                    notify(t('common.copied'));
                  }}
                >
                  <Copy className="size-4" />
                  {t('common.copy')}
                </Button>
                <a href={createdLink} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
                  Ouvrir l’aperçu
                </a>
              </div>
            </div>
          ) : (
            <Button loading={spectatorMutation.isPending} onClick={() => spectatorMutation.mutate()}>
              <Plus className="size-4" />
              {t('tournament.createSpectatorLink')}
            </Button>
          )}
          {detail.spectatorTokens.length > 0 ? (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-cream-300/50">
                Liens actifs
              </h3>
              <ul className="space-y-1.5">
                {detail.spectatorTokens.map((token) => (
                  <li
                    key={token.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-sm"
                  >
                    <span className="text-cream-300/70">Créé le {formatDate(token.createdAt)}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => revokeTokenMutation.mutate(token.id)}
                    >
                      {t('tournament.revoke')}
                    </Button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-cream-300/40">
                Pour des raisons de sécurité, les liens existants ne peuvent plus être affichés.
                Créez-en un nouveau si nécessaire.
              </p>
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
