/** Utilisateur authentifié attaché à la requête par la couche d'authentification. */
export interface AuthenticatedUser {
  id: string;
  pseudonym: string;
  status: 'pending' | 'active' | 'suspended' | 'deleted';
  roles: readonly string[];
  permissions: ReadonlySet<string>;
  sessionId?: string;
  /** Horodatage de la dernière réauthentification (actions sensibles, FR-010). */
  authenticatedAt?: Date;
}
