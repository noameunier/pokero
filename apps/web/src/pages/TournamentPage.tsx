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
import { QRCodeSVG } from 'qrcode.react';
import { useTournamentSocket } from '../lib/realtime';
import type { TournamentDetail } from '../lib/types';
import { ClockFace, ClockProgress, useServerSyncedRemaining } from '../components/Clock';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  Switch,
  Tabs,
} from '../components/ui';
import { useToast } from '../components/Toast';

type ConfirmState = {
  title: string;
  description?: string;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
};

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
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

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
    return <div className="py-24 text-center text-cream-300">{t('common.loading')}</div>;
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
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link
            to="/"
            className="btn-ghost btn-icon -ml-1 text-cream-300"
            aria-label={t('common.back')}
          >
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate font-display text-[1.55rem] leading-tight text-cream-50 sm:text-[2rem]">
                {tournament.name}
              </h1>
              <span className={`badge ${statusTone(tournament.status)}`}>
                {statusLabel(tournament.status)}
              </span>
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-cream-400">
              <span className="truncate">{tournament.settings?.chipCaseName ?? '—'}</span>
              <span className="text-cream-500" aria-hidden>·</span>
              <span>{t('common.level')} {clock?.playLevelNumber ?? '—'}</span>
              <span className="text-cream-500" aria-hidden>·</span>
              <span>{t('common.players')} {tournament.participants.length}</span>
            </p>
          </div>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Link
            to={`/projection/${id}`}
            className="btn-secondary btn-sm flex-1 sm:flex-none"
          >
            <Monitor className="size-3.5" aria-hidden />
            {t('tournament.projection')}
          </Link>
          <Button
            variant="secondary"
            size="sm"
            className="flex-1 sm:flex-none"
            onClick={() => setShowSpectator(true)}
          >
            <Link2 className="size-3.5" aria-hidden />
            {t('tournament.share')}
          </Button>
        </div>
      </header>

      {locked ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-warning-500/25 bg-warning-500/[0.08] px-4 py-3 text-sm text-warning-300">
          <span className="flex items-center gap-2">
            <Lock className="size-4" aria-hidden />
            {t('tournament.pinRequired')}
          </span>
          <Button size="sm" variant="secondary" onClick={() => setPinModal(true)}>
            {t('tournament.unlock')}
          </Button>
        </div>
      ) : tournament.pinRequired && pinToken ? (
        <div className="flex items-center gap-2 text-xs text-success-300">
          <LockOpen className="size-3.5" aria-hidden /> Tournoi déverrouillé pour 30 minutes
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <section
            className="card-command p-5 sm:p-6"
            aria-label="Console du chronomètre"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-400">
                <span
                  className={
                    socket.connected
                      ? 'live-dot'
                      : 'size-1.5 rounded-full bg-warning-400'
                  }
                  aria-hidden
                />
                {socket.connected ? 'Chrono synchronisé' : 'Reconnexion…'}
              </div>
              <div className="flex items-center gap-2">
                {tournament.pinRequired ? (
                  <span className="inline-flex items-center gap-1 text-[10.5px] text-cream-400">
                    <Lock className="size-3" aria-hidden />
                    PIN
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mt-4">
              {clock ? (
                <>
                  <ClockFace clock={clock} remainingMs={remaining} size="lg" />
                  <div className="mt-4">
                    <ClockProgress clock={clock} remainingMs={remaining} />
                  </div>
                </>
              ) : (
                <p className="py-12 text-center text-sm text-cream-400">
                  Chronomètre indisponible.
                </p>
              )}
            </div>

            <div className="mt-5 space-y-2">
              <div className="flex items-stretch gap-2">
                {canStart ? (
                  <Button
                    size="lg"
                    className="flex-1"
                    disabled={disabled}
                    loading={clockMutation.isPending}
                    onClick={() => sendClock('START', { label: 'Tournoi démarré.' })}
                  >
                    <Play className="size-4" fill="currentColor" aria-hidden />
                    {t('tournament.start')}
                  </Button>
                ) : null}
                {canPause ? (
                  <Button
                    size="lg"
                    className="flex-1"
                    disabled={disabled}
                    onClick={() => sendClock('PAUSE', { label: 'Chronomètre en pause.' })}
                  >
                    <Pause className="size-4" aria-hidden />
                    {t('tournament.pause')}
                  </Button>
                ) : null}
                {canResume ? (
                  <Button
                    size="lg"
                    className="flex-1"
                    disabled={disabled}
                    onClick={() => sendClock('RESUME', { label: 'Chronomètre repris.' })}
                  >
                    <Play className="size-4" aria-hidden />
                    {t('tournament.resume')}
                  </Button>
                ) : null}
                {isOpen && !canStart ? (
                  <>
                    <Button
                      variant="secondary"
                      className="btn-icon min-h-12"
                      disabled={disabled}
                      aria-label={t('tournament.previousLevel')}
                      title={t('tournament.previousLevel')}
                      onClick={() => sendClock('PREVIOUS', { label: 'Niveau précédent.' })}
                    >
                      <SkipBack className="size-4" aria-hidden />
                    </Button>
                    <Button
                      variant="secondary"
                      className="btn-icon min-h-12"
                      disabled={disabled}
                      aria-label={t('tournament.nextLevel')}
                      title={t('tournament.nextLevel')}
                      onClick={() => sendClock('NEXT', { label: 'Niveau suivant.' })}
                    >
                      <SkipForward className="size-4" aria-hidden />
                    </Button>
                  </>
                ) : null}
              </div>

              {isOpen && !canStart ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={disabled}
                    onClick={() =>
                      sendClock('ADD_TIME', { seconds: 60, label: 'Une minute ajoutée.' })
                    }
                  >
                    <Timer className="size-3.5" aria-hidden />
                    + 1 min
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={disabled}
                    onClick={() =>
                      sendClock('ADD_TIME', { seconds: 300, label: 'Cinq minutes ajoutées.' })
                    }
                  >
                    + 5 min
                  </Button>
                </div>
              ) : null}
            </div>

            {isOpen && !canStart ? (
              <details className="group mt-4 rounded-[var(--radius-md)] border border-white/[0.07] bg-night-950/40">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3.5 text-[12px] font-semibold text-cream-300 transition hover:text-cream-100">
                  Ajustements avancés
                  <span className="text-cream-500 transition-transform group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </summary>
                <div className="space-y-4 border-t border-white/[0.06] p-3.5">
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="min-w-0 flex-1">
                      <span className="label">Temps restant (secondes)</span>
                      <Input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={extraSeconds}
                        onChange={(event) => setExtraSeconds(event.target.value)}
                      />
                    </label>
                    <Button
                      variant="secondary"
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
                  </div>
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-400">
                      Récupération après interruption
                    </p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={disabled}
                        onClick={() =>
                          sendClock('RECOVER', {
                            recoveryMode: 'CONTINUE_ELAPSED',
                            label: 'Chrono recalé sur le temps écoulé.',
                          })
                        }
                      >
                        <RotateCcw className="size-3.5" aria-hidden />
                        Temps écoulé
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={disabled}
                        onClick={() =>
                          sendClock('RECOVER', {
                            recoveryMode: 'LAST_CHECKPOINT',
                            label: 'Chrono restauré au dernier point de contrôle.',
                          })
                        }
                      >
                        Dernier checkpoint
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={disabled}
                        onClick={() =>
                          sendClock('RECOVER', {
                            recoveryMode: 'LAST_CHECKPOINT_PAUSED',
                            label: 'Chrono restauré en pause.',
                          })
                        }
                      >
                        Checkpoint + pause
                      </Button>
                    </div>
                  </div>
                </div>
              </details>
            ) : null}

            {canStart ? (
              <p className="mt-3 text-center text-[11.5px] text-cream-400">
                Le chrono est piloté par le serveur : tous les écrans connectés restent alignés.
              </p>
            ) : null}
          </section>

          <Tabs<TabKey>
            value={tab}
            onChange={setTab}
            tabs={[
              {
                value: 'players',
                label: t('tournament.players'),
                count: tournament.participants.length,
              },
              { value: 'structure', label: t('tournament.structure') },
              { value: 'ranking', label: t('tournament.ranking') },
              { value: 'history', label: t('tournament.history') },
            ]}
          />

          {tab === 'players' ? (
            <Card className="p-4 sm:p-5">
              {canManagePlayers ? (
                <form
                  className="mb-4 flex flex-col gap-2 sm:flex-row"
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
                    aria-label={t('tournament.playerName')}
                    onChange={(event) => setNewPlayer(event.target.value)}
                  />
                  <Button type="submit" loading={addParticipantMutation.isPending}>
                    <Plus className="size-4" aria-hidden />
                    {t('tournament.addPlayer')}
                  </Button>
                </form>
              ) : null}

              {orderedParticipants.length === 0 ? (
                <EmptyState
                  icon={<Users className="size-6" aria-hidden />}
                  title={t('tournament.noPlayers')}
                  description="Ajoutez les joueurs inscrits avant de démarrer le tournoi."
                />
              ) : (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-success-500/25 bg-success-500/[0.08] px-2.5 py-1 text-success-300">
                      <span className="size-1.5 rounded-full bg-success-400" aria-hidden />
                      {activePlayers.length} en course
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.025] px-2.5 py-1 text-cream-400">
                      {orderedParticipants.length - activePlayers.length} éliminé
                      {orderedParticipants.length - activePlayers.length > 1 ? 's' : ''}
                    </span>
                  </div>

                  <section aria-label="Joueurs en course">
                    <h3 className="section-title mb-2">
                      En course · {activePlayers.length}
                    </h3>
                    <ul className="space-y-1.5">
                      {orderedParticipants
                        .filter((participant) => participant.status === 'ACTIVE')
                        .map((participant, index) => (
                          <li
                            key={participant.id}
                            className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-white/[0.07] bg-white/[0.022] px-3 py-2.5"
                          >
                            <span className="grid size-8 shrink-0 place-items-center rounded-full border border-gold-500/20 bg-gold-500/[0.08] text-[11px] font-bold tabular text-gold-300">
                              {index + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-cream-100">
                                {participant.displayName}
                              </p>
                              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-cream-400">
                                <span className="inline-flex items-center gap-1 text-success-400">
                                  <span className="size-1 rounded-full bg-success-400" aria-hidden />
                                  En course
                                </span>
                                {participant.rebuyCount > 0 ? (
                                  <span>{participant.rebuyCount} rebuy</span>
                                ) : null}
                                {participant.addOnCount > 0 ? (
                                  <span>{participant.addOnCount} add-on</span>
                                ) : null}
                              </p>
                            </div>

                            {canRecord ? (
                              <div className="flex w-full flex-wrap items-center justify-end gap-1.5 sm:w-auto">
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
                                  onClick={() =>
                                    setConfirmState({
                                      title: `Éliminer ${participant.displayName} ?`,
                                      description:
                                        'Le joueur sera retiré de la table et son classement sera figé. L’action peut être annulée juste après.',
                                      confirmLabel: 'Éliminer',
                                      tone: 'danger',
                                      onConfirm: () => eliminateMutation.mutate(participant.id),
                                    })
                                  }
                                >
                                  <UserMinus className="size-3.5" aria-hidden />
                                  {t('tournament.eliminate')}
                                </Button>
                              </div>
                            ) : null}

                            {canManagePlayers ? (
                              <button
                                type="button"
                                aria-label={`Retirer ${participant.displayName}`}
                                onClick={() => removeParticipantMutation.mutate(participant.id)}
                                className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-sm)] text-cream-400 transition hover:bg-danger-500/10 hover:text-danger-300 sm:size-9"
                              >
                                <Trash2 className="size-4" aria-hidden />
                              </button>
                            ) : null}
                          </li>
                        ))}
                    </ul>
                  </section>

                  {orderedParticipants.filter((p) => p.status === 'ELIMINATED').length > 0 ? (
                    <section aria-label="Joueurs éliminés">
                      <h3 className="section-title mb-2">
                        Éliminés ·{' '}
                        {orderedParticipants.filter((p) => p.status === 'ELIMINATED').length}
                      </h3>
                      <ul className="space-y-1">
                        {orderedParticipants
                          .filter((participant) => participant.status === 'ELIMINATED')
                          .map((participant) => (
                            <li
                              key={participant.id}
                              className="flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm text-cream-400"
                            >
                              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/[0.035] text-[11px] font-semibold tabular text-cream-400">
                                {participant.eliminationSequence}
                              </span>
                              <span className="min-w-0 flex-1 truncate line-through decoration-cream-500/50">
                                {participant.displayName}
                              </span>
                              <span className="text-[11px] text-cream-500">Éliminé</span>
                            </li>
                          ))}
                      </ul>
                    </section>
                  ) : null}
                </div>
              )}

              {canRecord && lastElimination ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3"
                  disabled={locked || undoEliminationMutation.isPending}
                  onClick={() => undoEliminationMutation.mutate(lastElimination.participantId)}
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                  {t('tournament.undoElimination')} ({participantName(lastElimination.participantId)})
                </Button>
              ) : null}
            </Card>
          ) : null}

          {tab === 'structure' ? (
            <Card className="overflow-hidden p-0">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-4 sm:px-5">
                <h2 className="font-display text-xl text-cream-50">{t('tournament.structure')}</h2>
                <span className="text-[11px] text-cream-400">
                  {tournament.levels.filter((level) => level.kind === 'PLAY').length} niveaux de jeu
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[440px] text-sm">
                  <thead className="border-y border-white/[0.06] bg-white/[0.015] text-left text-[9.5px] font-bold uppercase tracking-[0.14em] text-cream-400">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">#</th>
                      <th className="px-3 py-2.5 font-semibold">Petite</th>
                      <th className="px-3 py-2.5 font-semibold">Grosse</th>
                      <th className="px-3 py-2.5 font-semibold">Ante</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Durée</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tournament.levels.map((level, index) => {
                      const isCurrent = clock?.levelPosition === level.position;
                      const isBreak = level.kind === 'BREAK';
                      return (
                        <tr
                          key={level.id ?? index}
                          className={`border-b border-white/[0.04] last:border-0 ${
                            isCurrent
                              ? 'bg-gold-500/[0.07] text-gold-200'
                              : isBreak
                                ? 'bg-white/[0.012] text-cream-400'
                                : 'text-cream-200'
                          }`}
                        >
                          <td className="px-4 py-2.5">
                            <span className="inline-flex items-center gap-2">
                              {isCurrent ? (
                                <span className="size-1.5 rounded-full bg-gold-500" aria-hidden />
                              ) : null}
                              <span className="tabular">{level.position}</span>
                            </span>
                          </td>
                          <td className="px-3 py-2.5 tabular">
                            {isBreak ? (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-cream-400">
                                <Coffee className="size-3.5" aria-hidden /> Pause
                              </span>
                            ) : (
                              formatChips(level.smallBlind)
                            )}
                          </td>
                          <td className="px-3 py-2.5 tabular font-semibold">
                            {isBreak ? '—' : formatChips(level.bigBlind)}
                          </td>
                          <td className="px-3 py-2.5 tabular text-cream-400">
                            {level.ante ? formatChips(level.ante) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right text-cream-400">
                            {level.durationMinutes} min
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}

          {tab === 'ranking' ? (
            <Card className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-xl text-cream-50">{t('tournament.ranking')}</h2>
                <Badge tone={tournament.publicRanking ? 'gold' : 'neutral'}>
                  {tournament.publicRanking ? 'Public' : 'Privé'}
                </Badge>
              </div>

              {detail.ranking && detail.ranking.entries.length > 0 ? (
                <>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {detail.ranking.entries.slice(0, 3).map((entry) => (
                      <div
                        key={entry.participantId}
                        className={`rounded-[var(--radius-md)] border p-3 text-center ${
                          entry.rank === 1
                            ? 'border-gold-500/30 bg-gold-500/[0.07]'
                            : 'border-white/[0.06] bg-white/[0.02]'
                        }`}
                      >
                        <div
                          className={`mx-auto grid size-7 place-items-center rounded-full text-[11px] font-bold ${
                            entry.rank === 1
                              ? 'bg-gold-500 text-night-950'
                              : 'bg-white/[0.06] text-cream-300'
                          }`}
                        >
                          {entry.rank}
                          {entry.tied ? '=' : ''}
                        </div>
                        <p className="mt-2 truncate text-[12px] font-semibold text-cream-100">
                          {participantName(entry.participantId)}
                        </p>
                        <p className="mt-0.5 text-[10px] text-cream-400">
                          {entry.eliminated ? 'Éliminé' : 'En course'}
                        </p>
                      </div>
                    ))}
                  </div>

                  <ol className="mt-3 space-y-1">
                    {detail.ranking.entries.slice(3).map((entry) => (
                      <li
                        key={entry.participantId}
                        className="flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-sm text-cream-300 hover:bg-white/[0.02]"
                      >
                        <span className="w-6 text-center font-bold tabular text-cream-500">
                          {entry.rank}
                          {entry.tied ? '=' : ''}
                        </span>
                        <span className="flex-1 truncate">
                          {participantName(entry.participantId)}
                        </span>
                        <span className="text-[11px] text-cream-500">
                          {entry.eliminated ? 'éliminé' : 'en course'}
                        </span>
                      </li>
                    ))}
                  </ol>
                  {detail.ranking.entries.some((entry) => entry.tied) ? (
                    <p className="mt-2 text-[11px] text-cream-500">
                      « = » signale les joueurs ex æquo, classés au même rang.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="mt-4 text-sm text-cream-400">
                  Le classement se construit au fil des éliminations.
                </p>
              )}

              <div className="mt-4 border-t border-white/[0.06] pt-4">
                <Switch
                  label="Rendre le classement public"
                  hint="Visible depuis le lien spectateur."
                  checked={tournament.publicRanking}
                  onChange={(value) => publicRankingMutation.mutate(value)}
                />
              </div>
            </Card>
          ) : null}

          {tab === 'history' ? (
            <Card className="p-4 sm:p-5">
              <h2 className="font-display text-xl text-cream-50">{t('tournament.history')}</h2>
              <ol className="mt-4 space-y-0">
                {detail.events.length === 0 ? (
                  <p className="text-sm text-cream-400">Aucun événement.</p>
                ) : (
                  detail.events.map((event, index) => (
                    <li key={event.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span
                          className={`mt-1.5 size-2 shrink-0 rounded-full ${
                            index === 0 ? 'bg-gold-500' : 'bg-white/15'
                          }`}
                          aria-hidden
                        />
                        {index < detail.events.length - 1 ? (
                          <span className="w-px flex-1 bg-white/[0.06]" aria-hidden />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1 pb-4">
                        <p className="text-sm text-cream-200">
                          {EVENT_LABELS[event.type] ?? event.type}
                        </p>
                        <p className="mt-0.5 text-[11px] text-cream-500">
                          {formatDate(event.createdAt)} · v{event.version}
                        </p>
                      </div>
                    </li>
                  ))
                )}
              </ol>
            </Card>
          ) : null}
        </div>

        <div className="min-w-0 space-y-4">
          <Card className="p-4 sm:p-5">
            <h2 className="section-title">Informations</h2>
            <dl className="mt-3 divide-y divide-white/[0.05] text-sm">
              {[
                {
                  label: 'Cave',
                  value: formatChips(tournament.settings?.buyIn.targetBuyIn),
                  mono: true,
                },
                {
                  label: 'Joueurs',
                  value: `${activePlayers.length} / ${tournament.participants.length}`,
                  mono: true,
                },
                {
                  label: 'Rebuys',
                  value: detail.rebuys.filter((rebuy) => !rebuy.cancelledAt).length,
                  mono: true,
                },
                { label: 'Démarrage', value: formatDate(tournament.startedAt) },
                { label: 'Fin', value: formatDate(tournament.completedAt) },
                { label: 'Version chrono', value: `v${clock?.version ?? 0}`, mono: true },
              ].map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3 py-2">
                  <dt className="text-cream-400">{row.label}</dt>
                  <dd
                    className={`text-right font-medium text-cream-100 ${
                      row.mono ? 'tabular' : ''
                    }`}
                  >
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card className="p-4 sm:p-5">
            <h2 className="section-title">Actions</h2>
            <div className="mt-3 space-y-2">
              {!isFinished ? (
                <Button
                  className="w-full"
                  disabled={locked || finalizeMutation.isPending || activePlayers.length !== 1}
                  loading={finalizeMutation.isPending}
                  onClick={() =>
                    setConfirmState({
                      title: 'Clôturer le tournoi ?',
                      description: `Déclarer ${
                        activePlayers[0]?.displayName ?? 'le dernier joueur'
                      } vainqueur et enregistrer le classement final.`,
                      confirmLabel: 'Clôturer',
                      tone: 'primary',
                      onConfirm: () => finalizeMutation.mutate(),
                    })
                  }
                >
                  <CheckCircle2 className="size-4" aria-hidden />
                  {t('tournament.finalize')}
                </Button>
              ) : null}
              {!isFinished ? (
                <Button
                  variant="secondary"
                  className="w-full"
                  disabled={locked || clockMutation.isPending}
                  onClick={() =>
                    setConfirmState({
                      title: 'Annuler ce tournoi ?',
                      description:
                        'Les réservations de jetons seront libérées. Cette action ne peut pas être annulée.',
                      confirmLabel: 'Annuler le tournoi',
                      tone: 'danger',
                      onConfirm: () =>
                        sendClock('CANCEL', { label: 'Tournoi annulé.' }),
                    })
                  }
                >
                  <XCircle className="size-4" aria-hidden />
                  {t('tournament.cancelTournament')}
                </Button>
              ) : null}
              {tournament.status === 'COMPLETED' ||
              tournament.status === 'CANCELLED' ||
              tournament.status === 'DRAFT' ? (
                <Button
                  variant="danger"
                  className="w-full"
                  loading={deleteMutation.isPending}
                  onClick={() =>
                    setConfirmState({
                      title: 'Supprimer définitivement ce tournoi ?',
                      description:
                        'Le tournoi, ses participants et son historique seront supprimés. Cette action est irréversible.',
                      confirmLabel: 'Supprimer',
                      tone: 'danger',
                      onConfirm: () => deleteMutation.mutate(),
                    })
                  }
                >
                  <Trash2 className="size-4" aria-hidden />
                  {t('common.delete')}
                </Button>
              ) : null}
              {activePlayers.length !== 1 && !isFinished ? (
                <p className="text-[11.5px] leading-relaxed text-cream-400">
                  Il doit rester exactement un joueur en course pour clôturer.
                </p>
              ) : null}
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="section-title">Spectateurs</h2>
              <Link2 className="size-4 text-gold-500" aria-hidden />
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-cream-400">
              {t('tournament.spectatorHint')}
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3 w-full"
              loading={spectatorMutation.isPending}
              onClick={() => spectatorMutation.mutate()}
            >
              <Plus className="size-3.5" aria-hidden />
              {t('tournament.createSpectatorLink')}
            </Button>
            {createdLink ? (
              <div className="mt-3 rounded-[var(--radius-md)] border border-gold-500/20 bg-gold-500/[0.05] p-2.5">
                <p className="break-all text-[11px] leading-relaxed text-cream-200">
                  {createdLink}
                </p>
                <div className="mt-2 flex gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(createdLink);
                      notify(t('common.copied'));
                    }}
                  >
                    <Copy className="size-3.5" aria-hidden />
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
              <ul className="mt-3 space-y-1">
                {detail.spectatorTokens.map((token) => (
                  <li
                    key={token.id}
                    className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-white/[0.025] px-2.5 py-1.5 text-[11px]"
                  >
                    <span className="flex-1 text-cream-400">
                      {formatDate(token.createdAt)}
                    </span>
                    <button
                      type="button"
                      onClick={() => revokeTokenMutation.mutate(token.id)}
                      className="font-semibold text-danger-300 hover:text-danger-300"
                    >
                      {t('tournament.revoke')}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[11px] text-cream-500">Aucun lien actif.</p>
            )}
          </Card>

          <Card className="p-4 sm:p-5">
            <h2 className="section-title">Diffusion</h2>
            <p className="mt-2 text-[11.5px] leading-relaxed text-cream-400">
              Ouvrez la projection sur un second écran ou une TV. Le chronomètre reste synchronisé
              au serveur.
            </p>
            <Link to={`/projection/${id}`} className="btn-primary btn-sm mt-3 w-full">
              <Monitor className="size-3.5" aria-hidden />
              {t('tournament.projection')}
            </Link>
            <div className="mt-3 flex items-center justify-between text-[11px] text-cream-400">
              <span>Connexion temps réel</span>
              <span
                className={`inline-flex items-center gap-1.5 ${
                  socket.connected ? 'text-success-300' : 'text-warning-300'
                }`}
              >
                <span
                  className={`size-1.5 rounded-full ${
                    socket.connected ? 'bg-success-400' : 'bg-warning-400 animate-live'
                  }`}
                  aria-hidden
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
        description="Le déverrouillage dure 30 minutes sur cet appareil."
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
        <Field label={t('tournament.pin')}>
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
        description="Partagez ce lien en lecture seule avec les joueurs et les spectateurs."
        wide
      >
        <div className="space-y-4">
          {createdLink ? (
            <div className="rounded-[var(--radius-md)] border border-gold-500/25 bg-gold-500/[0.05] p-3">
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                <div className="shrink-0 rounded-[var(--radius-sm)] bg-white p-2">
                  <QRCodeSVG value={createdLink} size={104} level="M" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="break-all text-[12px] leading-relaxed text-cream-100">
                    {createdLink}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        void navigator.clipboard.writeText(createdLink);
                        notify(t('common.copied'));
                      }}
                    >
                      <Copy className="size-3.5" aria-hidden />
                      {t('common.copy')}
                    </Button>
                    <a
                      href={createdLink}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary btn-sm"
                    >
                      Ouvrir l’aperçu
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <Button loading={spectatorMutation.isPending} onClick={() => spectatorMutation.mutate()}>
              <Plus className="size-4" aria-hidden />
              {t('tournament.createSpectatorLink')}
            </Button>
          )}
          {detail.spectatorTokens.length > 0 ? (
            <div>
              <h3 className="section-title mb-2">Liens actifs</h3>
              <ul className="space-y-1.5">
                {detail.spectatorTokens.map((token) => (
                  <li
                    key={token.id}
                    className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] bg-white/[0.025] px-3 py-2 text-sm"
                  >
                    <span className="text-cream-400">Créé le {formatDate(token.createdAt)}</span>
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
              <p className="mt-2 text-[11px] leading-relaxed text-cream-500">
                Pour des raisons de sécurité, les liens existants ne peuvent plus être affichés.
                Créez-en un nouveau si nécessaire.
              </p>
            </div>
          ) : null}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmState !== null}
        title={confirmState?.title ?? ''}
        description={confirmState?.description}
        confirmLabel={confirmState?.confirmLabel}
        tone={confirmState?.tone}
        onClose={() => setConfirmState(null)}
        onConfirm={() => {
          confirmState?.onConfirm();
          setConfirmState(null);
        }}
      />
    </div>
  );
}
