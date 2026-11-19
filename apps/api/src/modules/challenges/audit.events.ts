/**
 * Constantes et constructeurs d'événements d'audit pour les thématiques
 * et les prérequis de défis (FR-089, T126).
 */
export const CHALLENGE_AUDIT_ACTIONS = {
  THEME_CREATED: 'theme.created',
  THEME_UPDATED: 'theme.updated',
  PREREQUISITE_CREATED: 'challenge.prerequisite.created',
  PREREQUISITE_DELETED: 'challenge.prerequisite.deleted',
  PREREQUISITE_UPDATED: 'challenge.prerequisite.updated'
} as const;

export type ChallengeAuditAction =
  (typeof CHALLENGE_AUDIT_ACTIONS)[keyof typeof CHALLENGE_AUDIT_ACTIONS];

export interface PrerequisiteAuditEvent {
  action: ChallengeAuditAction;
  challengeId: string;
  actorId?: string;
  details: {
    prerequisiteId?: string;
    conditionType: 'challenge' | 'level' | 'lesson' | 'lore';
    conditionValue: string | number;
  };
}
