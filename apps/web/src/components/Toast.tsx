import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  notify: (message: string, kind?: ToastKind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

const kindStyles: Record<ToastKind, { icon: typeof Info; box: string; iconColor: string }> = {
  success: {
    icon: CheckCircle2,
    box: 'border-success-500/25 bg-night-800',
    iconColor: 'text-success-400',
  },
  error: {
    icon: TriangleAlert,
    box: 'border-danger-500/30 bg-night-800',
    iconColor: 'text-danger-400',
  },
  info: {
    icon: Info,
    box: 'border-white/[0.1] bg-night-800',
    iconColor: 'text-gold-400',
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      const id = nextId++;
      setToasts((current) => [...current.slice(-3), { id, kind, message }]);
      window.setTimeout(() => remove(id), 5200);
    },
    [remove],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      notify,
      success: (message: string) => notify(message, 'success'),
      error: (message: string) => notify(message, 'error'),
    }),
    [notify],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[100] flex flex-col items-center gap-2 px-4 md:bottom-6"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => {
          const style = kindStyles[toast.kind];
          const Icon = style.icon;
          return (
            <div
              key={toast.id}
              role={toast.kind === 'error' ? 'alert' : 'status'}
              className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[var(--radius-md)] border px-3.5 py-3 text-sm text-cream-100 shadow-lifted animate-rise ${style.box}`}
            >
              <Icon className={`mt-0.5 size-4.5 shrink-0 ${style.iconColor}`} aria-hidden />
              <span className="flex-1 leading-snug">{toast.message}</span>
              <button
                type="button"
                onClick={() => remove(toast.id)}
                className="relative grid size-6 shrink-0 place-items-center rounded-full text-cream-400 transition after:absolute after:-inset-2.5 after:content-[''] hover:bg-white/[0.08] hover:text-cream-100"
                aria-label="Fermer la notification"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast doit être utilisé dans ToastProvider.');
  return context;
}
