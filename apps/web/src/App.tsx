import { Link, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { RequireAuth } from './components/layout/RequireAuth';
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
import { QrChallengePage } from './pages/challenges/QrChallengePage';
import { StegoChallengePage } from './pages/challenges/StegoChallengePage';
import { BattleRoyalePage } from './pages/events/BattleRoyalePage';
import { EventDetailPage } from './pages/events/EventDetailPage';
import { EventLeaderboardPage } from './pages/events/EventLeaderboardPage';
import { EventsPage } from './pages/events/EventsPage';
import { SpectatorView } from './pages/events/SpectatorView';
import { BossPage } from './pages/bosses/BossPage';
import { LeaderboardPage } from './pages/leaderboards/LeaderboardPage';
import { ChatPage } from './pages/ChatPage';
import { LoreChapterPage } from './pages/lore/LoreChapterPage';
import { LorePage } from './pages/lore/LorePage';
import { LessonPage } from './pages/lessons/LessonPage';
import { LessonsPage } from './pages/lessons/LessonsPage';
import { ProfilePage } from './pages/settings/ProfilePage';
import { TeamPage } from './pages/teams/TeamPage';
import { JoinTeamPage } from './pages/teams/JoinTeamPage';
import { TeamSettingsPage } from './pages/teams/TeamSettingsPage';
import { SessionsPage } from './pages/settings/SessionsPage';
import { ShopPage } from './pages/shop/ShopPage';
import { WalletPage } from './pages/shop/WalletPage';

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
        <Route path="challenges/:challengeId/stego" element={<StegoChallengePage />} />
        <Route path="challenges/:challengeId/qr" element={<QrChallengePage />} />
        <Route path="lessons" element={<LessonsPage />} />
        <Route path="lessons/:lessonId" element={<LessonPage />} />
        <Route path="lore" element={<LorePage />} />
        <Route path="lore/:chapterId" element={<LoreChapterPage />} />
        <Route path="leaderboards" element={<LeaderboardPage />} />
        <Route path="teams" element={<TeamPage />} />
        <Route path="teams/join" element={<JoinTeamPage />} />
        <Route path="teams/:teamId" element={<TeamSettingsPage />} />
        <Route path="events" element={<EventsPage />} />
        <Route path="events/:eventId" element={<EventDetailPage />} />
        <Route path="events/:eventId/results" element={<EventLeaderboardPage />} />

        <Route element={<RequireAuth />}>
          <Route path="events/:eventId/arena" element={<BattleRoyalePage />} />
          <Route path="events/:eventId/spectate" element={<SpectatorView />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="bosses" element={<BossPage />} />
          <Route path="shop" element={<ShopPage />} />
          <Route path="wallet" element={<WalletPage />} />
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
