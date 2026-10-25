import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  KeyRound,
  MailCheck,
  MailWarning,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  UserRound,
} from 'lucide-react';
import { api, downloadExport } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApiErrorMessage } from '../lib/format';
import { Badge, Button, Card, Field, Input, PageHeader, Select, Switch, Tabs } from '../components/ui';
import { useToast } from '../components/Toast';

type AccountTab = 'profile' | 'security' | 'data';

export function AccountPage() {
  const { t, i18n } = useTranslation();
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success, error: notifyError } = useToast();
  const errorMessage = useApiErrorMessage();

  const [tab, setTab] = useState<AccountTab>('profile');
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
    <div className="space-y-5">
      <PageHeader
        eyebrow="Votre espace"
        title={t('account.title')}
        description={t('account.subtitle')}
      />

      <section className="card flex flex-wrap items-center gap-4 p-4 sm:p-5">
        <span className="grid size-14 shrink-0 place-items-center rounded-[var(--radius-md)] border border-gold-500/25 bg-gold-500/[0.09] font-display text-xl text-gold-200">
          {initials || 'PK'}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-2xl leading-tight text-cream-50">
            {user.displayName}
          </h2>
          <p className="mt-0.5 truncate text-[12.5px] text-cream-400">{user.email}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={user.emailVerified ? 'success' : 'warning'} dot>
              {user.emailVerified ? 'Email vérifié' : 'Email non vérifié'}
            </Badge>
            <Badge tone={user.publicProfile ? 'gold' : 'neutral'}>
              {user.publicProfile ? 'Profil public' : 'Profil privé'}
            </Badge>
            <Badge tone="neutral">{locale === 'en' ? 'English' : 'Français'}</Badge>
          </div>
        </div>
      </section>

      <Tabs<AccountTab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'profile', label: t('account.profile') },
          { value: 'security', label: t('account.security') },
          { value: 'data', label: t('account.data') },
        ]}
      />

      {tab === 'profile' ? (
        <Card className="p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full border border-white/[0.07] bg-white/[0.03] text-gold-500">
              <UserRound className="size-4" aria-hidden />
            </span>
            <div>
              <h2 className="font-display text-2xl text-cream-50">{t('account.profile')}</h2>
              <p className="mt-0.5 text-[12px] text-cream-400">
                Votre pseudo apparaît dans les tournois et les classements.
              </p>
            </div>
          </div>

          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              profileMutation.mutate();
            }}
          >
            <Field label={t('auth.displayName')} htmlFor="account-display-name">
              <Input
                id="account-display-name"
                value={displayName}
                maxLength={40}
                minLength={2}
                required
                autoComplete="nickname"
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </Field>
            <Field label={t('account.language')} htmlFor="account-locale">
              <Select
                id="account-locale"
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

            <div className="space-y-2">
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
            </div>

            <Button type="submit" loading={profileMutation.isPending}>
              {t('common.save')}
            </Button>
          </form>
        </Card>
      ) : null}

      {tab === 'security' ? (
        <Card className="p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full border border-white/[0.07] bg-white/[0.03] text-gold-500">
              <KeyRound className="size-4" aria-hidden />
            </span>
            <div>
              <h2 className="font-display text-2xl text-cream-50">{t('account.security')}</h2>
              <p className="mt-0.5 text-[12px] text-cream-400">
                Mot de passe et vérification de l’adresse email.
              </p>
            </div>
          </div>

          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              passwordMutation.mutate();
            }}
          >
            <Field label={t('account.currentPassword')} htmlFor="account-current-password">
              <Input
                id="account-current-password"
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </Field>
            <Field
              label={t('account.newPassword')}
              hint={t('auth.passwordHint')}
              htmlFor="account-new-password"
            >
              <Input
                id="account-new-password"
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

          <div className="mt-5 border-t border-white/[0.06] pt-4">
            {user.emailVerified ? (
              <p className="flex items-center gap-2 rounded-[var(--radius-md)] border border-success-500/25 bg-success-500/[0.07] px-3.5 py-3 text-[12.5px] text-success-300">
                <MailCheck className="size-4 shrink-0" aria-hidden />
                Votre adresse email est vérifiée.
              </p>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-warning-500/25 bg-warning-500/[0.07] px-3.5 py-3 text-[12.5px] text-warning-300">
                <span className="flex items-center gap-2">
                  <MailWarning className="size-4 shrink-0" aria-hidden />
                  Votre adresse email n’est pas encore vérifiée.
                </span>
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
            )}
          </div>
        </Card>
      ) : null}

      {tab === 'data' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full border border-white/[0.07] bg-white/[0.03] text-gold-500">
                <ShieldCheck className="size-4" aria-hidden />
              </span>
              <div>
                <h2 className="font-display text-2xl text-cream-50">Vos données</h2>
                <p className="mt-0.5 text-[12px] text-cream-400">
                  Exportez l’ensemble de vos données personnelles au format JSON (RGPD).
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              className="mt-4 w-full sm:w-auto"
              onClick={() => {
                void downloadExport()
                  .then(() => success(t('account.dataExported')))
                  .catch((caught) => notifyError(errorMessage(caught)));
              }}
            >
              <Download className="size-4" aria-hidden />
              {t('account.exportData')}
            </Button>
          </Card>

          <Card className="border-danger-500/25 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full border border-danger-500/25 bg-danger-500/[0.08] text-danger-300">
                <TriangleAlert className="size-4" aria-hidden />
              </span>
              <div>
                <h2 className="font-display text-2xl text-cream-50">{t('account.deleteAccount')}</h2>
                <p className="mt-0.5 text-[12px] leading-relaxed text-cream-400">
                  {t('account.deleteWarning')}
                </p>
              </div>
            </div>

            {!deleteOpen ? (
              <Button
                variant="danger"
                className="mt-4 w-full sm:w-auto"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="size-4" aria-hidden />
                {t('account.deleteAccount')}
              </Button>
            ) : (
              <form
                className="mt-4 space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  deleteMutation.mutate();
                }}
              >
                <Field label={t('auth.password')} htmlFor="delete-password">
                  <Input
                    id="delete-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={deletePassword}
                    onChange={(event) => setDeletePassword(event.target.value)}
                  />
                </Field>
                <Field label={t('account.deleteConfirm')} htmlFor="delete-confirm">
                  <Input
                    id="delete-confirm"
                    value={deleteConfirm}
                    onChange={(event) => setDeleteConfirm(event.target.value)}
                    placeholder="SUPPRIMER"
                    autoComplete="off"
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="submit"
                    variant="danger"
                    loading={deleteMutation.isPending}
                    disabled={deleteConfirm !== 'SUPPRIMER' || deletePassword.length === 0}
                  >
                    {t('common.confirm')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setDeleteOpen(false);
                      setDeletePassword('');
                      setDeleteConfirm('');
                    }}
                  >
                    {t('common.cancel')}
                  </Button>
                </div>
              </form>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
