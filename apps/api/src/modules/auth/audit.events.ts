/**
 * Actions du journal d'audit du domaine identité (T064, FR-089).
 * Chaînes stables : elles sont consommées par les tableaux de bord et les
 * exports d'audit, ne jamais les renommer sans migration de données.
 */
export const AUTH_AUDIT_EVENTS = {
  registered: 'user.registered',
  emailVerified: 'user.email_verified',
  loginSucceeded: 'user.login',
  loginFailed: 'user.login_failed',
  loginLocked: 'user.login_locked',
  loggedOut: 'user.logout',
  loggedOutAll: 'user.logout_all',
  passwordResetRequested: 'user.password_reset_requested',
  passwordReset: 'user.password_reset',
  profileUpdated: 'user.profile_updated',
  sessionRevoked: 'user.session_revoked',
  sessionsRevokedAll: 'user.sessions_revoked_all',
  accountDeleted: 'user.account_deleted',
  accountPurged: 'user.account_purged'
} as const;

export type AuthAuditEvent = (typeof AUTH_AUDIT_EVENTS)[keyof typeof AUTH_AUDIT_EVENTS];
