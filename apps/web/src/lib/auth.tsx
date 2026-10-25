import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { User } from './types';

interface AuthResponse {
  user: User;
  emailVerificationRequired?: boolean;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<{ user: User | null }>('/api/auth/me'),
    staleTime: 30_000,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      api.post<AuthResponse>('/api/auth/login', input),
    onSuccess: (data) => {
      queryClient.setQueryData(['me'], { user: data.user });
    },
  });

  const registerMutation = useMutation({
    mutationFn: (input: { email: string; password: string; displayName: string }) =>
      api.post<AuthResponse>('/api/auth/register', input),
    onSuccess: (data) => {
      queryClient.setQueryData(['me'], { user: data.user });
    },
  });

  const login = useCallback(
    async (email: string, password: string) => {
      await loginMutation.mutateAsync({ email, password });
    },
    [loginMutation],
  );

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      return registerMutation.mutateAsync({ email, password, displayName });
    },
    [registerMutation],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      queryClient.setQueryData(['me'], { user: null });
      queryClient.clear();
      queryClient.setQueryData(['me'], { user: null });
    }
  }, [queryClient]);

  const refresh = useCallback(async () => {
    await meQuery.refetch();
  }, [meQuery]);

  const setUser = useCallback(
    (user: User | null) => {
      queryClient.setQueryData(['me'], { user });
    },
    [queryClient],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user: meQuery.data?.user ?? null,
      isLoading: meQuery.isLoading,
      login,
      register,
      logout,
      refresh,
      setUser,
    }),
    [meQuery.data, meQuery.isLoading, login, register, logout, refresh, setUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth doit être utilisé dans AuthProvider.');
  return context;
}
