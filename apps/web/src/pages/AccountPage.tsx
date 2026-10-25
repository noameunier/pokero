import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { Download, KeyRound, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { api, downloadExport } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApiErrorMessage } from '../lib/format';
import { Button, Card, Field, Input, Select, Switch } from '../components/ui';
import { useToast } from '../components/Toast';

export function AccountPage() {
  const { t, i18n } = useTranslation();
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success, error: notifyError } = useToast();
  const errorMessage = useApiErrorMessage();

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [publicProfile, setPublicProfile] = useState(user?.publicProfile ?? false);
  const [publicResults, setPublicResults] = useState(user?.publicResults ?? false);
  const [locale, setLocale] = useState(user?.locale ?? 'fr');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const profileMutation = useMutation({
    mutationFn: () =>
      api.patch<{ user: NonNullable<typeof user> }>('/api/auth/me', {
        displayName: displayName.trim(),
        locale,
        publicProfile,
        publicResults,
      }),
    onSuccess: (data) => {
      setUser(data.user);
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      success('Profil enregistré.');
    },
    onError: (caught) => notifyError(errorMessage(caught)),
  });

  const passwordMutation = useMutation({
    mutationFn: () =>
      api.post('/api/auth/change-password', {
        currentPassword,
        newPassword,
      }),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      success(t('account.passwordChanged'));
    },
    onError: (caught) => notifyError(errorMessage(caught)),
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      api.post('/api/auth/delete-account', {
        password: deletePassword,
        confirmation: 'SUPPRIMER',
      }),
    onSuccess: () => {
      success(t('account.accountDeleted'));
      setUser(null);
      void logout().catch(() => undefined);
      navigate('/connexion', { replace: true });
    },
    onError: (caught) => notifyError(errorMessage(caught)),
  });

  if (!user) return null;

  const initials = user.displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold-500/80">
          {t('account.title')}
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold text-cream-50">{t('account.title')}</h1>
        <p className="mt-1.5 text-sm text-cream-300/70">{t('account.subtitle')}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <div className="mb-4 flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-gold-500/15 font-display text-lg font-bold text-gold-300">
                {initials || 'PK'}
              </span>
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold text-cream-50">
                  <UserRound className="size-4 text-gold-500" />
                  {t('account.profile')}
                </h2>
                <p className="text-xs text-cream-300/60">{user.email}</p>
              </div>
            </div>

            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                profileMutation.mutate();
              }}
            >
              <Field label={t('auth.displayName')}>
                <Input
                  value={displayName}
                  maxLength={40}
                  minLength={2}
                  required
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </Field>
              <Field label={t('account.language')}>
                <Select
                  value={locale}
                  onChange={(event) => {
                    const value = event.target.value === 'en' ? 'en' : 'fr';
                    setLocale(value);
                    void i18n.changeLanguage(value);
                    localStorage.setItem('pokero.locale', value);
                  }}
                >
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                </Select>
              </Field>
              <Switch
                label={t('account.publicProfile')}
                hint="Un profil public permet d’être trouvé par votre pseudo."
                checked={publicProfile}
                onChange={setPublicProfile}
              />
              <Switch
                label={t('account.publicResults')}
                hint="Partage vos résultats agrégés sur votre profil public."
                checked={publicResults}
                onChange={setPublicResults}
              />
              <Button type="submit" loading={profileMutation.isPending}>
                {t('common.save')}
              </Button>
            </form>
          </Card>

          <Card>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-cream-50">
              <KeyRound className="size-4 text-gold-500" />
              {t('account.security')}
            </h2>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                passwordMutation.mutate();
              }}
            >
              <Field label={t('account.currentPassword')}>
                <Input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </Field>
              <Field label={t('account.newPassword')} hint={t('auth.passwordHint')}>
                <Input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={10}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </Field>
              <Button
                type="submit"
                variant="secondary"
                loading={passwordMutation.isPending}
                disabled={newPassword.length < 10 || currentPassword.length === 0}
              >
                {t('account.changePassword')}
              </Button>
            </form>
            {!user.emailVerified ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-100">
                <span>Votre adresse email n’est pas encore vérifiée.</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void api
                      .post('/api/auth/resend-verification')
                      .then(() => success('Email de vérification envoyé.'))
                      .catch((caught) => notifyError(errorMessage(caught)));
                  }}
                >
                  Renvoyer
                </Button>
              </div>
            ) : null}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-cream-50">
              <ShieldCheck className="size-4 text-gold-500" />
              {t('account.data')}
            </h2>
            <p className="text-xs text-cream-300/60">
              Exportez l’ensemble de vos données personnelles au format JSON (RGPD).
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3 w-full"
              onClick={() => {
                void downloadExport()
                  .then(() => success(t('account.dataExported')))
                  .catch((caught) => notifyError(errorMessage(caught)));
              }}
            >
              <Download className="size-4" />
              {t('account.exportData')}
            </Button>
          </Card>

          <Card className="border-red-500/20">
            <h2 className="text-lg font-semibold text-cream-50">{t('account.deleteAccount')}</h2>
            <p className="mt-2 text-xs leading-relaxed text-cream-300/60">
              {t('account.deleteWarning')}
            </p>
            {!deleteOpen ? (
              <Button
                variant="danger"
                size="sm"
                className="mt-3 w-full"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="size-4" />
                {t('account.deleteAccount')}
              </Button>
            ) : (
              <form
                className="mt-3 space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  deleteMutation.mutate();
                }}
              >
                <Field label={t('auth.password')}>
                  <Input
                    type="password"
                    autoComplete="current-password"
                    required
                    value={deletePassword}
                    onChange={(event) => setDeletePassword(event.target.value)}
                  />
                </Field>
                <Field label={t('account.deleteConfirm')}>
                  <Input
                    value={deleteConfirm}
                    onChange={(event) => setDeleteConfirm(event.target.value)}
                    placeholder="SUPPRIMER"
                  />
                </Field>
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    variant="danger"
                    size="sm"
                    loading={deleteMutation.isPending}
                    disabled={
                      deleteConfirm !== 'SUPPRIMER' || deletePassword.length === 0
                    }
                  >
                    {t('common.confirm')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteOpen(false)}
                  >
                    {t('common.cancel')}
                  </Button>
                </div>
              </form>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
