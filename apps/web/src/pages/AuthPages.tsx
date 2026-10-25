import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  CheckCircle2,
  Mail,
  ShieldCheck,
  Spade,
  Timer,
  TriangleAlert,
  WalletCards,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { api, ApiError } from '../lib/api';
import { useApiErrorMessage } from '../lib/format';
import { Button, Field, Input } from '../components/ui';
import { useToast } from '../components/Toast';

function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <span className="grid size-10 place-items-center rounded-[11px] border border-gold-400/50 bg-gold-500 text-night-950 shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_8px_20px_-10px_rgb(207_169_88/0.65)]">
        <Spade className="size-5" fill="currentColor" strokeWidth={1.5} aria-hidden />
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-display text-[1.6rem] leading-none text-cream-50">Pokero</span>
        <span className="mt-0.5 text-[8.5px] font-semibold uppercase tracking-[0.28em] text-gold-500">
          Poker club
        </span>
      </span>
    </span>
  );
}

function FormAlert({
  tone,
  children,
}: {
  tone: 'danger' | 'success';
  children: ReactNode;
}) {
  const Icon = tone === 'danger' ? TriangleAlert : CheckCircle2;
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`flex items-start gap-2.5 rounded-[var(--radius-md)] border px-3.5 py-3 text-[12.5px] leading-relaxed ${
        tone === 'danger'
          ? 'border-danger-500/30 bg-danger-500/[0.08] text-danger-300'
          : 'border-success-500/25 bg-success-500/[0.07] text-success-300'
      }`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative grid min-h-dvh lg:grid-cols-[1.05fr_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden border-r border-white/[0.07] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(760px_560px_at_22%_12%,rgb(17_64_47/0.75),transparent_68%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(700px_360px_at_20%_110%,rgb(207_169_88/0.07),transparent_70%)]"
          aria-hidden
        />

        <div className="relative">
          <Link to="/" aria-label="Pokero, accueil">
            <BrandMark />
          </Link>
        </div>

        <div className="relative max-w-lg">
          <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.26em] text-gold-500">
            <span className="inline-block h-px w-7 bg-gold-500/60" aria-hidden />
            Organisation de tournois
          </p>
          <h1 className="mt-4 font-display text-[3.1rem] leading-[1.04] text-cream-50">
            Le tournoi,
            <br />
            sans les approximations.
          </h1>
          <p className="mt-5 max-w-md text-[14.5px] leading-relaxed text-cream-300">
            Caves calculées au jeton près, chronomètre piloté par le serveur, classement instantané
            et liens spectateurs révocables. Tout ce qu’il faut pour animer une soirée de poker.
          </p>

          <ul className="mt-8 space-y-3">
            {[
              {
                icon: WalletCards,
                title: 'Caves exactes',
                text: 'Le stock physique est réservé, jamais dépassé.',
              },
              {
                icon: Timer,
                title: 'Chrono serveur',
                text: 'Tous les écrans restent alignés, même après une coupure.',
              },
              {
                icon: ShieldCheck,
                title: 'Données maîtrisées',
                text: 'Comptes, exports RGPD et liens spectateurs révocables.',
              },
            ].map((item) => (
              <li key={item.title} className="flex items-start gap-3">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-[9px] border border-gold-500/20 bg-gold-500/[0.07] text-gold-400">
                  <item.icon className="size-4" aria-hidden />
                </span>
                <span>
                  <span className="block text-[13px] font-semibold text-cream-100">
                    {item.title}
                  </span>
                  <span className="block text-[12px] leading-relaxed text-cream-400">
                    {item.text}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11px] text-cream-500">
          Pokero · outil d’organisation · aucun argent réel, aucun jeu en ligne
        </p>
      </aside>

      <div className="relative flex flex-col">
        <div className="flex items-center justify-between px-5 pb-0 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8 lg:hidden">
          <Link to="/" aria-label="Pokero, accueil">
            <BrandMark />
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-8 sm:px-8 lg:py-12">
          <div className="w-full max-w-[400px] animate-rise">
            <h2 className="font-display text-[2.15rem] leading-tight text-cream-50">{title}</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-cream-300">{subtitle}</p>
            <div className="mt-7">{children}</div>
            {footer ? (
              <div className="mt-7 border-t border-white/[0.06] pt-5 text-[13px] text-cream-300">
                {footer}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { t } = useTranslation();
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const errorMessage = useApiErrorMessage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      const from = (location.state as { from?: string } | null)?.from ?? '/';
      navigate(from, { replace: true });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title={t('auth.welcomeBack')}
      subtitle={t('auth.login')}
      footer={
        <div className="space-y-3">
          <p>
            {t('auth.noAccount')}{' '}
            <Link to="/inscription" className="font-semibold text-gold-400 hover:text-gold-300">
              {t('auth.register')}
            </Link>
          </p>
          <p className="text-[11.5px] leading-relaxed text-cream-500">
            Pokero est un outil d’organisation. Aucun argent réel, aucun jeu en ligne.
          </p>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label={t('auth.email')} htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="vous@exemple.fr"
          />
        </Field>
        <Field label={t('auth.password')} htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        {error ? <FormAlert tone="danger">{error}</FormAlert> : null}
        <Button type="submit" loading={submitting} className="w-full" size="lg">
          {t('auth.loginCta')}
          <ArrowRight className="size-4" aria-hidden />
        </Button>
        <p className="text-center text-xs">
          <Link to="/mot-de-passe-oublie" className="text-cream-400 hover:text-gold-400">
            {t('auth.forgot')}
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { t } = useTranslation();
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const errorMessage = useApiErrorMessage();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await register(email, password, displayName);
      navigate('/', { replace: true });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title={t('auth.createAccount')}
      subtitle={t('auth.register')}
      footer={
        <p>
          {t('auth.hasAccount')}{' '}
          <Link to="/connexion" className="font-semibold text-gold-400 hover:text-gold-300">
            {t('auth.login')}
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label={t('auth.displayName')} htmlFor="displayName">
          <Input
            id="displayName"
            autoComplete="nickname"
            required
            minLength={2}
            maxLength={40}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Noa"
          />
        </Field>
        <Field label={t('auth.email')} htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="vous@exemple.fr"
          />
        </Field>
        <Field label={t('auth.password')} hint={t('auth.passwordHint')} htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <Field label={t('auth.confirmPassword')} htmlFor="confirm">
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </Field>
        {error ? <FormAlert tone="danger">{error}</FormAlert> : null}
        <Button type="submit" loading={submitting} className="w-full" size="lg">
          {t('auth.registerCta')}
        </Button>
      </form>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorMessage = useApiErrorMessage();

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/api/auth/forgot-password', { email });
      setSent(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title={t('auth.resetTitle')}
      subtitle="Un lien valable une heure vous sera envoyé."
      footer={
        <Link to="/connexion" className="font-semibold text-gold-400 hover:text-gold-300">
          ← {t('auth.login')}
        </Link>
      }
    >
      {sent ? (
        <FormAlert tone="success">{t('auth.resetSent')}</FormAlert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label={t('auth.email')} htmlFor="email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="vous@exemple.fr"
            />
          </Field>
          {error ? <FormAlert tone="danger">{error}</FormAlert> : null}
          <Button type="submit" loading={submitting} className="w-full" size="lg">
            <Mail className="size-4" aria-hidden />
            Envoyer le lien
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { success } = useToast();
  const errorMessage = useApiErrorMessage();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/api/auth/reset-password', { token, password });
      success('Mot de passe mis à jour. Vous pouvez vous connecter.');
      navigate('/connexion', { replace: true });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell title={t('auth.resetTitle')} subtitle="Choisissez un nouveau mot de passe.">
      {!token ? (
        <FormAlert tone="danger">Lien incomplet. Recommencez la procédure.</FormAlert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label={t('auth.newPassword')} hint={t('auth.passwordHint')} htmlFor="password">
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <Field label={t('auth.confirmPassword')} htmlFor="confirm">
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </Field>
          {error ? <FormAlert tone="danger">{error}</FormAlert> : null}
          <Button type="submit" loading={submitting} className="w-full" size="lg">
            {t('common.save')}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

export function VerifyEmailPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const token = params.get('token') ?? '';

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }
    void api
      .post('/api/auth/verify-email', { token })
      .then(() => setStatus('ok'))
      .catch((error) => {
        if (error instanceof ApiError) setStatus('error');
        else setStatus('error');
      });
  }, [token]);

  return (
    <AuthShell title={t('auth.verifyTitle')} subtitle="Confirmation de votre adresse email.">
      <div className="space-y-5">
        {status === 'loading' ? (
          <p className="flex items-center gap-2 text-[13px] text-cream-300" role="status">
            <span className="size-1.5 animate-live rounded-full bg-gold-400" aria-hidden />
            {t('common.loading')}
          </p>
        ) : null}
        {status === 'ok' ? <FormAlert tone="success">{t('auth.verifySuccess')}</FormAlert> : null}
        {status === 'error' ? <FormAlert tone="danger">{t('auth.verifyError')}</FormAlert> : null}
        <Link to="/" className="btn-primary w-full">
          {t('nav.dashboard')}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </AuthShell>
  );
}
