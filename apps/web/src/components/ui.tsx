import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2, RefreshCw, X } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const sizeClass: Record<Size, string> = {
  sm: 'btn-sm',
  md: '',
  lg: 'min-h-12 px-5 text-[15px]',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}) {
  const variantClass =
    variant === 'primary'
      ? 'btn-primary'
      : variant === 'secondary'
        ? 'btn-secondary'
        : variant === 'danger'
          ? 'btn-danger'
          : 'btn-ghost';
  return (
    <button
      type={type}
      className={`${variantClass} ${sizeClass[size]} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

export function Card({
  children,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article';
}) {
  return <Tag className={`card p-5 sm:p-6 ${className}`}>{children}</Tag>;
}

export function SectionHeading({
  title,
  action,
  className = '',
}: {
  title: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-3 flex items-center justify-between gap-3 ${className}`}>
      <h2 className="section-title">{title}</h2>
      {action}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="eyebrow flex items-center gap-2.5">
            <span className="inline-block h-px w-6 bg-gold-500/60" aria-hidden />
            {eyebrow}
          </p>
        ) : null}
        <h1 className="page-title mt-2">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-cream-300">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  className = '',
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      {label ? (
        <label className="label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : null}
      {children}
      {hint && !error ? <p className="mt-1.5 text-xs leading-relaxed text-cream-400">{hint}</p> : null}
      {error ? (
        <p className="field-error" role="alert">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className}`} {...props} />;
}

export function Textarea({
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`input ${className}`} {...props} />;
}

export function Select({
  className = '',
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`input ${className}`} {...props}>
      {children}
    </select>
  );
}

const badgeTones: Record<string, string> = {
  neutral: 'border-white/10 bg-white/[0.04] text-cream-200',
  success: 'border-success-500/30 bg-success-500/10 text-success-300',
  warning: 'border-warning-500/30 bg-warning-500/10 text-warning-300',
  danger: 'border-danger-500/30 bg-danger-500/10 text-danger-300',
  gold: 'border-gold-500/30 bg-gold-500/10 text-gold-300',
};

export function Badge({
  children,
  tone = 'neutral',
  className = '',
  dot = false,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'gold';
  className?: string;
  dot?: boolean;
}) {
  const dotTone: Record<string, string> = {
    neutral: 'bg-cream-400',
    success: 'bg-success-400',
    warning: 'bg-warning-400',
    danger: 'bg-danger-400',
    gold: 'bg-gold-400',
  };
  return (
    <span className={`badge ${badgeTones[tone]} ${className}`}>
      {dot ? <span className={`size-1.5 rounded-full ${dotTone[tone]}`} aria-hidden /> : null}
      {children}
    </span>
  );
}

export function Spinner({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div
      className="flex items-center justify-center gap-3 py-20 text-sm text-cream-300"
      role="status"
    >
      <Loader2 className="size-5 animate-spin text-gold-500" aria-hidden />
      {label}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-[var(--radius-md)] bg-white/[0.05] ${className}`} />;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-white/[0.12] bg-white/[0.015] px-6 py-14 text-center">
      {icon ? (
        <div className="mb-4 grid size-14 place-items-center rounded-[var(--radius-md)] border border-gold-500/20 bg-gold-500/[0.07] text-gold-400">
          {icon}
        </div>
      ) : null}
      <h3 className="font-display text-2xl text-cream-50">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-cream-300">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = 'Impossible de charger les données',
  description = 'Vérifiez votre connexion, puis réessayez.',
  retryLabel = 'Réessayer',
  onRetry,
}: {
  title?: string;
  description?: string;
  retryLabel?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-danger-500/25 bg-danger-500/[0.05] px-6 py-14 text-center"
    >
      <div className="mb-4 grid size-14 place-items-center rounded-[var(--radius-md)] border border-danger-500/25 bg-danger-500/[0.08] text-danger-300">
        <AlertTriangle className="size-6" aria-hidden />
      </div>
      <h3 className="font-display text-2xl text-cream-50">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-cream-300">{description}</p>
      {onRetry ? (
        <Button variant="secondary" className="mt-6" onClick={onRetry}>
          <RefreshCw className="size-4" aria-hidden />
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        '[autofocus], input:not([type="hidden"]), select, textarea, button',
      );
      (focusable ?? panelRef.current)?.focus();
    }, 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Fermer"
        className="absolute inset-0 cursor-default bg-black/70 animate-fade"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`relative z-10 max-h-[92dvh] w-full overflow-y-auto rounded-t-[var(--radius-2xl)] border border-white/[0.09] bg-night-850 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-lifted animate-sheet sm:rounded-[var(--radius-xl)] sm:p-6 ${
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md'
        }`}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15 sm:hidden" aria-hidden />
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="font-display text-[1.7rem] leading-tight text-cream-50">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1.5 text-sm leading-relaxed text-cream-300">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-11 shrink-0 place-items-center rounded-full text-cream-300 transition hover:bg-white/[0.07] hover:text-cream-50 sm:size-9"
            aria-label="Fermer"
          >
            <X className="size-4.5" />
          </button>
        </div>
        {children}
        {footer ? <div className="mt-6 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  tone = 'danger',
  loading = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={tone} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <span className="sr-only">Confirmation requise</span>
    </Modal>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className = '',
}: {
  tabs: Array<{ value: T; label: string; count?: number }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={`no-scrollbar flex gap-1 overflow-x-auto rounded-[var(--radius-md)] border border-white/[0.08] bg-night-900/70 p-1 ${className}`}
    >
      {tabs.map((tab) => {
        const active = value === tab.value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={`relative flex min-h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius-sm)] px-3 text-[13px] font-semibold transition-colors duration-150 ${
              active
                ? 'bg-white/[0.08] text-cream-50 shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]'
                : 'text-cream-300 hover:bg-white/[0.03] hover:text-cream-100'
            }`}
          >
            {active ? (
              <span className="size-1.5 rounded-full bg-gold-500" aria-hidden />
            ) : null}
            {tab.label}
            {typeof tab.count === 'number' ? (
              <span
                className={`text-[11px] tabular ${active ? 'text-cream-300' : 'text-cream-400'}`}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="card-flat p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-cream-400">
          {label}
        </span>
        {icon ? <span className="text-gold-500">{icon}</span> : null}
      </div>
      <div className="stat-value mt-2">{value}</div>
      {hint ? <p className="mt-1 text-xs text-cream-400">{hint}</p> : null}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 w-full cursor-pointer items-start justify-between gap-4 rounded-[var(--radius-md)] border border-white/[0.07] bg-white/[0.02] p-3.5 text-left transition hover:border-white/[0.12] hover:bg-white/[0.035] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-cream-100">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs leading-relaxed text-cream-400">{hint}</span> : null}
      </span>
      <span
        aria-hidden
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors duration-200 ${
          checked ? 'border-gold-400/40 bg-gold-500' : 'border-white/15 bg-night-600'
        }`}
      >
        <span
          className={`absolute top-[3px] size-4 rounded-full transition-[left,background-color] duration-200 ${
            checked ? 'left-[23px] bg-night-950' : 'left-[3px] bg-cream-200'
          }`}
        />
      </span>
    </button>
  );
}

export function ProgressBar({
  value,
  tone = 'gold',
  className = '',
}: {
  value: number;
  tone?: 'gold' | 'success' | 'warning' | 'danger';
  className?: string;
}) {
  const tones = {
    gold: 'bg-gold-500',
    success: 'bg-success-400',
    warning: 'bg-warning-400',
    danger: 'bg-danger-400',
  };
  return (
    <div
      className={`h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08] ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(Math.max(0, Math.min(1, value)) * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${tones[tone]}`}
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      />
    </div>
  );
}
