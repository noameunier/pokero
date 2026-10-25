import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClockView, SpectatorPayload } from './types';

interface SocketState {
  clock: ClockView | null;
  spectator: SpectatorPayload | null;
  connected: boolean;
  refreshNonce: number;
}

export function useTournamentSocket(
  tournamentId: string | undefined,
  spectatorToken?: string,
): SocketState {
  const [state, setState] = useState<SocketState>({
    clock: null,
    spectator: null,
    connected: false,
    refreshNonce: 0,
  });
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!tournamentId) return;

    const socket = io({
      path: '/socket.io',
      withCredentials: true,
      transports: ['websocket', 'polling'],
      auth: { tournamentId, spectatorToken },
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    const subscribe = () => {
      socket.emit('subscribe', { tournamentId, spectatorToken }, (response: { ok?: boolean }) => {
        if (!response?.ok) setState((current) => ({ ...current, connected: false }));
      });
    };

    socket.on('connect', () => {
      setState((current) => ({ ...current, connected: true }));
      subscribe();
    });

    socket.on('disconnect', () => {
      setState((current) => ({ ...current, connected: false }));
    });

    socket.on('state', (payload: { spectator?: SpectatorPayload }) => {
      setState((current) => ({
        ...current,
        spectator: payload.spectator ?? null,
        clock: payload.spectator?.clock ?? current.clock,
      }));
    });

    socket.on('clock', (payload: { clock?: ClockView }) => {
      if (payload?.clock) {
        setState((current) => ({ ...current, clock: payload.clock! }));
      }
    });

    socket.on('refresh', () => {
      setState((current) => ({ ...current, refreshNonce: current.refreshNonce + 1 }));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [tournamentId, spectatorToken]);

  return state;
}
