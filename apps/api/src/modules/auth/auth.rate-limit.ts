import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';

/**
 * Limites dédiées aux routes d'authentification (T065, FR-004).
 *
 * Le verrouillage par identifiant (5 échecs, `LockoutService`) protège un
 * compte donné ; la limitation par préfixe IP protège contre le balayage de
 * comptes et l'énumération d'adresses. Les seuils restent au-dessus du seuil
 * de verrouillage pour que le 423 soit toujours observable.
 */
export const SensitiveRateLimit = (): MethodDecorator & ClassDecorator =>
  RateLimit({ limit: 20, windowSeconds: 60, scope: 'ip' });

/** Inscription : 10 comptes par quart d'heure et par préfixe IP. */
export const RegisterRateLimit = (): MethodDecorator & ClassDecorator =>
  RateLimit({ limit: 10, windowSeconds: 15 * 60, scope: 'ip' });

/** Réinitialisation : 5 demandes par quart d'heure et par préfixe IP. */
export const PasswordResetRateLimit = (): MethodDecorator & ClassDecorator =>
  RateLimit({ limit: 5, windowSeconds: 15 * 60, scope: 'ip' });

/** Rotation de session : généreux, le front peut rafraîchir souvent. */
export const RefreshRateLimit = (): MethodDecorator & ClassDecorator =>
  RateLimit({ limit: 60, windowSeconds: 60, scope: 'ip' });
