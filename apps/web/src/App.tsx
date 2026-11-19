import { Link, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { RequireAuth } from './components/layout/RequireAuth';
import { Skeleton } from './components/ui';
import { t } from './i18n';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { AuditLogPage } from './pages/admin/AuditLogPage';
import { ChallengeEditorPage } from './pages/admin/ChallengeEditorPage';
import { UsersAdminPage } from './pages/admin/UsersAdminPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';
import { VerifyEmailPage } from './pages/auth/VerifyEmailPage';
import { ChallengePage } from './pages/challenges/ChallengePage';
import { CatalogPage } from './pages/challenges/CatalogPage';
import { DebugChallengePage } from './pages/challenges/DebugChallengePage';
import { LeaderboardPage } from './pages/leaderboards/LeaderboardPage';
import { LessonPage } from './pages/lessons/LessonPage';
import { LessonsPage } from './pages/lessons/LessonsPage';
import { ProfilePage } from './pages/settings/ProfilePage';
import { SessionsPage } from './pages/settings/SessionsPage';

function HomePage(): JSX.Element {
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight">{t('home.title')}</h1>
      <p className="text-lg text-muted">{t('home.subtitle')}</p>
      <Link
        to="/challenges"
        className="inline-flex w-fit items-center rounded-xl bg-primary px-5 py-3 font-semibold text-surface no-underline transition hover:brightness-110"
      >
        {t('home.cta')}
      </Link>
    </section>
  );
}

function PlaceholderPage({ title }: { title: string }): JSX.Element {
  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold">{title}</h1>
      <p className="mt-2 text-muted">{t('common.comingSoon')}</p>
      <Skeleton label={t('common.loading')} className="mt-6 h-24 w-full" />
    </section>
  );
}

function NotFoundPage(): JSX.Element {
  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold">{t('common.notFoundTitle')}</h1>
      <p className="mt-2 text-muted">{t('common.notFoundBody')}</p>
      <Link to="/" className="mt-6 inline-block text-primary hover:underline">
        {t('auth.backHome')}
      </Link>
    </section>
  );
}

export function App(): JSX.Element {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route path="verify-email" element={<VerifyEmailPage />} />
        <Route path="challenges" element={<CatalogPage />} />
        <Route path="challenges/:challengeId" element={<ChallengePage />} />
        <Route path="challenges/:challengeId/debug" element={<DebugChallengePage />} />
        <Route path="lessons" element={<LessonsPage />} />
        <Route path="lessons/:lessonId" element={<LessonPage />} />
        <Route path="leaderboards" element={<LeaderboardPage />} />
        <Route path="teams" element={<PlaceholderPage title={t('nav.teams')} />} />
        <Route path="events" element={<PlaceholderPage title={t('nav.events')} />} />

        <Route element={<RequireAuth />}>
          <Route path="profile" element={<ProfilePage />} />
          <Route path="settings/profile" element={<ProfilePage />} />
          <Route path="settings/sessions" element={<SessionsPage />} />
          <Route path="admin" element={<AdminDashboardPage />} />
          <Route path="admin/challenges/new" element={<ChallengeEditorPage />} />
          <Route path="admin/users" element={<UsersAdminPage />} />
          <Route path="admin/audit" element={<AuditLogPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
