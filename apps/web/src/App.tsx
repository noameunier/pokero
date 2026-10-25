import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppShell, AuthGate, FullscreenShell } from './components/AppShell';
import {
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from './pages/AuthPages';
import { DashboardPage } from './pages/DashboardPage';
import { ChipCasesPage } from './pages/ChipCasesPage';
import { ChipCaseEditorPage } from './pages/ChipCaseEditorPage';
import { PresetsPage } from './pages/PresetsPage';
import { PresetEditorPage } from './pages/PresetEditorPage';
import { TournamentNewPage } from './pages/TournamentNewPage';
import { TournamentPage } from './pages/TournamentPage';
import { ProjectionPage } from './pages/ProjectionPage';
import { SpectatorPage } from './pages/SpectatorPage';
import { StatsPage } from './pages/StatsPage';
import { AccountPage } from './pages/AccountPage';
import { Link } from 'react-router-dom';

function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <p className="font-display text-6xl font-bold text-gold-500">404</p>
      <h1 className="mt-4 text-2xl font-semibold text-cream-50">Page introuvable</h1>
      <p className="mt-2 text-sm text-cream-300">
        Cette page n’existe pas ou a été déplacée.
      </p>
      <Link to="/" className="btn-primary mt-8">
        {t('nav.dashboard')}
      </Link>
    </div>
  );
}

function Protected({ children }: { children: ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/connexion" element={<LoginPage />} />
        <Route path="/inscription" element={<RegisterPage />} />
        <Route path="/mot-de-passe-oublie" element={<ForgotPasswordPage />} />
        <Route path="/reinitialiser-mot-de-passe" element={<ResetPasswordPage />} />
        <Route path="/verifier-email" element={<VerifyEmailPage />} />
        <Route
          path="/spectateur/:token"
          element={
            <FullscreenShell>
              <SpectatorPage />
            </FullscreenShell>
          }
        />

        <Route element={<AuthGate><AppShell /></AuthGate>}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/mallettes" element={<ChipCasesPage />} />
          <Route path="/mallettes/nouvelle" element={<ChipCaseEditorPage />} />
          <Route path="/mallettes/:id" element={<ChipCaseEditorPage />} />
          <Route path="/presets" element={<PresetsPage />} />
          <Route path="/presets/nouveau" element={<PresetEditorPage />} />
          <Route path="/presets/:id" element={<PresetEditorPage />} />
          <Route path="/tournois/nouveau" element={<TournamentNewPage />} />
          <Route path="/tournois/:id" element={<TournamentPage />} />
          <Route path="/statistiques" element={<StatsPage />} />
          <Route path="/compte" element={<AccountPage />} />
          <Route path="/404" element={<NotFoundPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route path="/projection/:id" element={<Protected><ProjectionPage /></Protected>} />
        <Route path="/app" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
