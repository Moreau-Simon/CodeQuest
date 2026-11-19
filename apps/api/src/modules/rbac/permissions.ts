import type { RoleKey } from '@prisma/client';

/**
 * Catalogue des permissions `<domaine>:<action>` (research.md R5).
 * Toute route protégée déclare une de ces permissions via
 * `@RequirePermissions(...)` ; le guard refuse par défaut.
 */
export const PERMISSIONS = {
  'challenge:read': 'Consulter les défis',
  'challenge:write': 'Créer et modifier les défis',
  'challenge:validate': 'Valider un défi et ses tests',
  'submission:create': 'Déposer une soumission',
  'submission:read': 'Consulter ses soumissions',
  'event:read': 'Consulter les événements',
  'event:write': 'Créer et administrer les événements',
  'event:participate': "S'inscrire et participer à un événement",
  'team:manage': 'Créer et gérer son équipe',
  'chat:write': 'Écrire dans les canaux autorisés',
  'chat:moderate': 'Modérer les canaux de discussion',
  'user:read': 'Consulter les comptes (administration)',
  'user:ban': 'Suspendre ou bannir un compte',
  'user:role': 'Attribuer des rôles',
  'moderation:review': 'Traiter les signalements',
  'economy:spend': 'Dépenser des Bits',
  'economy:adjust': 'Ajuster manuellement un solde',
  'content:write': 'Créer leçons, chapitres de lore et thèmes',
  'settings:write': 'Modifier les réglages de plateforme',
  'audit:read': "Consulter le journal d'audit",
  'assets:write': 'Générer et publier des assets de défi'
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const PLAYER_PERMISSIONS: readonly PermissionKey[] = [
  'challenge:read',
  'submission:create',
  'submission:read',
  'event:read',
  'event:participate',
  'team:manage',
  'chat:write',
  'economy:spend'
];

export const MODERATOR_PERMISSIONS: readonly PermissionKey[] = [
  ...PLAYER_PERMISSIONS,
  'user:read',
  'user:ban',
  'chat:moderate',
  'moderation:review'
];

export const ROLE_PERMISSIONS: Record<RoleKey, readonly PermissionKey[]> = {
  player: PLAYER_PERMISSIONS,
  moderator: MODERATOR_PERMISSIONS,
  admin: Object.keys(PERMISSIONS) as PermissionKey[]
};

export const ROLE_LABELS: Record<RoleKey, string> = {
  player: 'Joueur',
  moderator: 'Modérateur',
  admin: 'Administrateur'
};
