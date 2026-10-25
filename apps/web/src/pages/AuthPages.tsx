import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CheckCircle2, Mail, Spade, TriangleAlert } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { api, ApiError } from '../lib/api';
import { useApiErrorMessage } from '../lib/format';
import { Button, Field, Input } from '../components/ui';
import { useToast } from '../components/Toast';

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
    <div className="relative grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden border-r border-white/10 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(900px_600px_at_30%_20%,#12624a_0%,transparent_60%)]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link to="/" className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-gold-500 text-felt-950 shadow-xl shadow-gold-500/20">
              <Spade className="size-6" fill="currentColor" />
            </span>
            <span className="font-display text-2xl font-bold text-cream-50">Pokero</span>
          </Link>
          <div className="max-w-md">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-gold-400">Poker club</p>
            <h1 className="mt-4 font-display text-5xl font-bold leading-tight text-cream-50">
              Le tournoi,
              <br />
              sans les approximations.
            </h1>
            <p className="mt-5 text-base leading-relaxed text-cream-200/70">
              Caves calculées au jeton près, chronomètre serveur, classement instantané et
              liens spectateurs révocables. Tout ce qu’il faut pour animer une soirée de poker.
            </p>
            <div className="mt-8 grid grid-cols-3 gap-4 text-center">
              {[
                { value: '100 BB', label: 'Profondeur de départ' },
                { value: '3', label: 'Modes de reprise' },
                { value: '∞', label: 'Spectateurs' },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="font-display text-xl font-bold text-gold-400">{item.value}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-wide text-cream-300/60">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-cream-300/40">
            Pokero · gestion de tournois · aucune dépendance à un compte de jeu en ligne
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-sm animate-rise">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid size-10 place-items-center rounded-xl bg-gold-500 text-felt-950">
              <Spade className="size-5" fill="currentColor" />
            </span>
            <span className="font-display text-xl font-bold text-cream-50">Pokero</span>
          </div>
          <h2 className="font-display text-3xl font-bold text-cream-50">{title}</h2>
          <p className="mt-2 text-sm text-cream-300/70">{subtitle}</p>
          <div className="mt-8">{children}</div>
          {footer ? <div className="mt-8 text-sm text-cream-300/70">{footer}</div> : null}
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
          <p className="text-xs text-cream-300/50">
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
        {error ? (
          <div className="flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-950/40 px-3 py-2.5 text-sm text-red-100">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
        <Button type="submit" loading={submitting} className="w-full">
          {t('auth.loginCta')}
          <ArrowRight className="size-4" />
        </Button>
        <p className="text-center text-xs">
          <Link to="/mot-de-passe-oublie" className="text-cream-300/60 hover:text-gold-400">
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
        {error ? (
          <div className="flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-950/40 px-3 py-2.5 text-sm text-red-100">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
        <Button type="submit" loading={submitting} className="w-full">
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
        <div className="flex items-start gap-3 rounded-xl border border-emerald-400/30 bg-emerald-950/40 p-4 text-sm text-emerald-50">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
          <p>{t('auth.resetSent')}</p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label={t('auth.email')} htmlFor="email">
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          {error ? <p className="field-error">{error}</p> : null}
          <Button type="submit" loading={submitting} className="w-full">
            <Mail className="size-4" />
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
        <div className="flex items-start gap-3 rounded-xl border border-red-400/30 bg-red-950/40 p-4 text-sm text-red-50">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" />
          <p>Lien incomplet. Recommencez la procédure.</p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label={t('auth.newPassword')} htmlFor="password">
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
          {error ? <p className="field-error">{error}</p> : null}
          <Button type="submit" loading={submitting} className="w-full">
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
      <div className="space-y-6">
        {status === 'loading' ? <p className="text-cream-200/70">{t('common.loading')}</p> : null}
        {status === 'ok' ? (
          <div className="flex items-start gap-3 rounded-xl border border-emerald-400/30 bg-emerald-950/40 p-4 text-sm text-emerald-50">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
            <p>{t('auth.verifySuccess')}</p>
          </div>
        ) : null}
        {status === 'error' ? (
          <div className="flex items-start gap-3 rounded-xl border border-red-400/30 bg-red-950/40 p-4 text-sm text-red-50">
            <TriangleAlert className="mt-0.5 size-5 shrink-0" />
            <p>{t('auth.verifyError')}</p>
          </div>
        ) : null}
        <Link to="/" className="btn-primary w-full">
          {t('nav.dashboard')}
        </Link>
      </div>
    </AuthShell>
  );
}
